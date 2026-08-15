/**
 * ─────────────────────────────────────────────────────────────────────────────
 * justdialCrmSyncService.js — Persistent Sync Engine & Deduplication Guard
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Safety & Audit Guarantees:
 *   - File-backed persistent metrics at backend/data/justdialSyncStats.json (survives restart)
 *   - Replay / Idempotency cache (Message-ID & Payload Hash tracking for 24h)
 *   - Masked log entries (never logs unmasked phone/email or raw email bodies)
 *   - DB transaction wrapper ensuring atomic lead + timeline creation
 *   - Preserves status = "NEW", callStatus = "NOT_CALLED", priority = "MEDIUM"
 *   - Never affects trading, wallet, membership, referral, Dhan, billing, or paper trading
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { parseJustdialEmail, maskPhone, maskEmail } = require('./justdialEmailParser');
const { N } = require('./notifier');

const STATS_FILE_PATH = path.join(__dirname, '../data/justdialSyncStats.json');

// Replay protection cache (payload hash -> timestamp, 24h TTL)
const replayCache = new Map();
const REPLAY_TTL_MS = 24 * 60 * 60 * 1000;

// Load persistent stats from file or initialize
function loadSyncStats() {
  try {
    const dir = path.dirname(STATS_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(STATS_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE_PATH, 'utf8'));
      return {
        emailsReceived: data.emailsReceived || 0,
        emailsAccepted: data.emailsAccepted || 0,
        importedToday: data.importedToday || 0,
        duplicatesSkipped: data.duplicatesSkipped || 0,
        failedParsing: data.failedParsing || 0,
        rejectedSender: data.rejectedSender || 0,
        lastSyncAt: data.lastSyncAt || null,
        recentLogs: Array.isArray(data.recentLogs) ? data.recentLogs : []
      };
    }
  } catch (err) {
    console.error('[JustdialSync] Failed to load stats file:', err.message);
  }

  return {
    emailsReceived: 0,
    emailsAccepted: 0,
    importedToday: 0,
    duplicatesSkipped: 0,
    failedParsing: 0,
    rejectedSender: 0,
    lastSyncAt: null,
    recentLogs: []
  };
}

const syncMetrics = loadSyncStats();

function saveSyncStats() {
  try {
    const dir = path.dirname(STATS_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(syncMetrics, null, 2));
  } catch (err) {
    console.error('[JustdialSync] Failed to save stats file:', err.message);
  }
}

function logEvent(type, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    ...details
  };
  syncMetrics.recentLogs.unshift(entry);
  if (syncMetrics.recentLogs.length > 100) {
    syncMetrics.recentLogs.pop();
  }
  saveSyncStats();
}

/**
 * Generate SHA-256 hash of payload for replay protection
 */
function computePayloadHash(payload) {
  const str = JSON.stringify({
    from: payload.from || '',
    subject: payload.subject || '',
    text: (payload.text || '').slice(0, 500),
    html: (payload.html || '').slice(0, 500),
    messageId: payload.messageId || payload['message-id'] || ''
  });
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Auto-generate Lead Number (HT-LD-YYYY-NNNN)
 */
async function generateLeadNumber() {
  const count = await prisma.lead.count();
  const year = new Date().getFullYear();
  return `HT-LD-${year}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Main Sync Engine: Parses raw email payload and safely syncs into CRM
 */
async function processJustdialEmailPayload(rawEmailPayload) {
  syncMetrics.emailsReceived++;
  syncMetrics.lastSyncAt = new Date().toISOString();

  // Replay Protection Check
  const payloadHash = computePayloadHash(rawEmailPayload);
  const now = Date.now();

  // Clean old replay entries
  for (const [hash, ts] of replayCache.entries()) {
    if (now - ts > REPLAY_TTL_MS) replayCache.delete(hash);
  }

  if (replayCache.has(payloadHash)) {
    syncMetrics.duplicatesSkipped++;
    logEvent('REPLAY_PREVENTED', { hash: payloadHash.slice(0, 8) });
    return {
      success: true,
      status: 'DUPLICATE',
      message: 'Replay protection: Payload already processed within 24h.'
    };
  }

  let parsedLead;
  try {
    parsedLead = parseJustdialEmail(rawEmailPayload);
    syncMetrics.emailsAccepted++;
    replayCache.set(payloadHash, now);
  } catch (err) {
    if (err.message.startsWith('REJECTED_SENDER')) {
      syncMetrics.rejectedSender++;
      logEvent('REJECTED_SENDER', { error: err.message });
    } else {
      syncMetrics.failedParsing++;
      logEvent('FAILED_PARSING', { error: err.message });
    }
    saveSyncStats();
    return {
      success: false,
      status: 'REJECTED',
      error: err.message
    };
  }

  // Deduplication & Sync Execution in Transaction
  try {
    // 1. Check duplicate by externalLeadId
    if (parsedLead.externalLeadId) {
      const existingByExtId = await prisma.lead.findFirst({
        where: {
          notes: { contains: parsedLead.externalLeadId }
        }
      });
      if (existingByExtId) {
        syncMetrics.duplicatesSkipped++;
        logEvent('DUPLICATE_EXT_ID', { externalLeadId: parsedLead.externalLeadId });
        return {
          success: true,
          status: 'DUPLICATE',
          message: `Lead with external ID ${parsedLead.externalLeadId} already exists.`,
          lead: existingByExtId
        };
      }
    }

    // 2. Check duplicate by normalized phone
    const existingByPhone = await prisma.lead.findFirst({
      where: { phone: parsedLead.phone }
    });
    if (existingByPhone) {
      syncMetrics.duplicatesSkipped++;
      await prisma.lead.update({
        where: { id: existingByPhone.id },
        data: {
          syncedAt: new Date(),
          externalLeadId: existingByPhone.externalLeadId || parsedLead.externalLeadId
        }
      });
      logEvent('DUPLICATE_PHONE', { phone: maskPhone(parsedLead.phone) });
      return {
        success: true,
        status: 'DUPLICATE',
        message: `Lead with phone number ${maskPhone(parsedLead.phone)} already exists.`,
        lead: existingByPhone
      };
    }

    // 3. Find/Create MarketingSource "Justdial"
    let justdialSource = await prisma.marketingSource.findUnique({
      where: { name: 'Justdial' }
    });
    if (!justdialSource) {
      justdialSource = await prisma.marketingSource.create({
        data: { name: 'Justdial', channelType: 'DIRECT', isActive: true }
      });
    }

    const leadNumber = await generateLeadNumber();

    // Transactional creation: Lead + Activity Timeline
    const newLead = await prisma.$transaction(async (tx) => {
      const leadData = {
        leadNumber,
        name: parsedLead.name || 'Justdial Lead',
        email: parsedLead.email || null,
        phone: parsedLead.phone,
        city: parsedLead.city || null,
        status: 'NEW',
        callStatus: 'NOT_CALLED',
        priority: 'MEDIUM',
        notes: `[Justdial Email Auto-Import] Ref: ${parsedLead.externalLeadId || 'N/A'} | Enquiry: ${parsedLead.enquiry || 'N/A'}`
      };
      if (justdialSource && justdialSource.id) {
        leadData.source = { connect: { id: justdialSource.id } };
      }

      const lead = await tx.lead.create({
        data: leadData
      });

      await tx.crmActivityTimeline.create({
        data: {
          leadId: lead.id,
          actorName: 'Justdial Email Import',
          actorRole: 'SYSTEM',
          eventType: 'LEAD_CREATED',
          title: `Lead ${lead.leadNumber} Auto-Imported from Justdial Email`,
          description: `Extracted Name: ${parsedLead.name} | City: ${parsedLead.city || 'N/A'} | Ref ID: ${parsedLead.externalLeadId}`
        }
      });

      return lead;
    });

    syncMetrics.importedToday++;
    logEvent('IMPORTED', { leadNumber: newLead.leadNumber, externalLeadId: parsedLead.externalLeadId });

    // Telegram Notification (Masked Phone)
    try {
      if (N.sendTelegramCustomMessage) {
        const maskedP = maskPhone(parsedLead.phone);
        const msg = `📥 <b>JUSTDIAL LEAD AUTO-IMPORTED</b>\n\n👤 <b>Name:</b> ${parsedLead.name}\n📞 <b>Phone:</b> ${maskedP}\n📍 <b>City:</b> ${parsedLead.city || 'N/A'}\n📝 <b>Enquiry:</b> ${parsedLead.enquiry}\n🆔 <b>Ref ID:</b> <code>${parsedLead.externalLeadId}</code>`;
        N.sendTelegramCustomMessage(process.env.TELEGRAM_CHAT_ID, msg);
      }
    } catch (_) {}

    return {
      success: true,
      status: 'IMPORTED',
      lead: newLead
    };

  } catch (dbErr) {
    if (dbErr.code === 'P2002') {
      syncMetrics.duplicatesSkipped++;
      logEvent('DUPLICATE_P2002', { phone: maskPhone(parsedLead.phone) });
      return {
        success: true,
        status: 'DUPLICATE',
        message: 'Unique database constraint prevented duplicate lead entry.'
      };
    }

    syncMetrics.failedParsing++;
    logEvent('DB_ERROR', { error: dbErr.message });
    return {
      success: false,
      status: 'FAILED',
      error: dbErr.message
    };
  }
}

function getSyncStats() {
  return {
    ...syncMetrics,
    serverTime: new Date().toISOString()
  };
}

module.exports = {
  processJustdialEmailPayload,
  getSyncStats,
  maskPhone
};
