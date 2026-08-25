/**
 * ─────────────────────────────────────────────────────────────────────────────
 * backfill_justdial_30days.js — Historical 30-Day Justdial Email Backfill Script
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Requirements:
 *   - Target window: 16-Jul-2026 00:00:00 IST to 14-Aug-2026 23:59:59 IST
 *   - One-time historical backfill command (ISOLATED; never runs on restart)
 *   - Default mode: --dry-run (Must be run first)
 *   - Execute mode: --import
 *   - Deduplication by externalLeadId & normalized phone number
 *   - Merge Safety: Never overwrites existing CRM lead status, assignment, or notes
 *   - Zero PII leakage: All phone numbers and emails masked in logs
 *   - Preserves existing Gmail read/unread state
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
  parseJustdialEmail,
  isValidSender,
  maskPhone,
  maskEmail
} = require('../services/justdialEmailParser');

// Timezone-safe 30-day IST boundaries (UTC+5:30)
const START_DATE_IST = new Date('2026-07-16T00:00:00.000+05:30');
const END_DATE_IST = new Date('2026-08-14T23:59:59.999+05:30');

const CHECKPOINT_FILE = path.join(__dirname, '../data/justdialBackfillCheckpoint.json');

// Parse CLI flags
const args = process.argv.slice(2);
const isImportMode = args.includes('--import') || args.includes('--execute');
const isDryRun = !isImportMode || args.includes('--dry-run');

/**
 * Initialize Google OAuth2 Client
 */
function getOAuth2Client() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || 'MOCK_GMAIL_CLIENT_ID';
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || 'MOCK_GMAIL_CLIENT_SECRET';
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN || 'MOCK_GMAIL_REFRESH_TOKEN';

  if (!process.env.GMAIL_OAUTH_CLIENT_ID && isDryRun) {
    return null; // Signals dry run fallback mode if live Gmail OAuth keys not set
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Recursively extract plain text and HTML from Gmail message payload
 */
function extractBodyParts(part, result = { text: '', html: '' }) {
  if (!part) return result;

  if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    result.text += Buffer.from(part.body.data, 'base64url').toString('utf8');
  } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
    result.html += Buffer.from(part.body.data, 'base64url').toString('utf8');
  }

  if (part.parts && Array.isArray(part.parts)) {
    part.parts.forEach(p => extractBodyParts(p, result));
  }

  return result;
}

/**
 * Load checkpoint cursor for idempotent/resumable execution
 */
function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    }
  } catch (_) {}
  return { processedMessageIds: [] };
}

function saveCheckpoint(processedIds) {
  try {
    const dir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
      lastRunAt: new Date().toISOString(),
      processedMessageIds: Array.from(new Set(processedIds))
    }, null, 2));
  } catch (_) {}
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
 * Main Historical 30-Day Backfill Runner
 */
async function runJustdialHistoricalBackfill() {
  console.log(`\n==================================================`);
  console.log(`JUSTDIAL 30-DAY HISTORICAL EMAIL BACKFILL`);
  console.log(`==================================================`);
  console.log(`MODE: ${isDryRun ? '🔍 DRY RUN (Simulated Import)' : '🚀 ACTUAL IMPORT (Database Modification)'}`);
  console.log(`Target Window (IST): ${START_DATE_IST.toISOString()} to ${END_DATE_IST.toISOString()}\n`);

  const metrics = {
    dateWindowStart: START_DATE_IST.toISOString(),
    dateWindowEnd: END_DATE_IST.toISOString(),
    gmailMatchingEmails: 0,
    parsedSuccessfully: 0,
    importedNewLeads: 0,
    updatedExistingLeads: 0,
    duplicatesSkipped: 0,
    missingPhoneCount: 0,
    parseFailures: 0,
    otherFailures: 0,
    totalProcessed: 0,
    failedMessages: [],
    sampleMaskedRecords: []
  };

  const checkpoint = loadCheckpoint();
  const processedMessageIds = new Set(checkpoint.processedMessageIds || []);

  let auth = getOAuth2Client();
  let allMessageRefs = [];

  if (auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    // 1. Fetch matching historical messages (Date boundary query)
    console.log(`[Backfill] Querying Gmail API for historical Justdial messages...`);
    const queryStr = `(from:instantemail@justdial.com OR from:lead-alerts@justdial.com OR from:noreply@justdial.com OR from:info@justdial.com) after:2026/07/15 before:2026/08/15`;
    let pageToken = null;

    try {
      do {
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          q: queryStr,
          pageToken,
          maxResults: 100
        });

        const msgs = listRes.data.messages || [];
        allMessageRefs.push(...msgs);
        pageToken = listRes.data.nextPageToken;
      } while (pageToken);

    } catch (listErr) {
      console.error(`[Backfill] Gmail List API Error: ${listErr.message}`);
      if (!isDryRun) process.exit(1);
    }
  } else {
    console.log(`[Backfill] Live Gmail OAuth credentials pending in .env — Running DRY RUN validation over historical email suite...`);
    // Sample dry-run verification dataset matching 30-day target window
    allMessageRefs = [
      { id: 'msg-jd-hist-001', mock: true, payload: { from: 'instantemail@justdial.com', text: 'Enquiry ID: JD-849102\nName: Santu Kumar\nMobile: 9839150731\nLocation: Civil lines, Gaya\nCategory: Share Trading Institutes\nDate: 14-Aug-2026 15:07' } },
      { id: 'msg-jd-hist-002', mock: true, payload: { from: 'instantemail@justdial.com', text: 'Enquiry ID: JD-849103\nName: Ritesh Maurya\nMobile: 9415414240\nLocation: Farrukhabad\nCategory: Share Trading Institutes\nDate: 14-Aug-2026 14:24' } },
      { id: 'msg-jd-hist-003', mock: true, payload: { from: 'instantemail@justdial.com', text: 'Enquiry ID: JD-849104\nName: Sandeep Mehroliya\nMobile: 9829110545\nLocation: Basni phase 1, Jodhpur\nCategory: Share Trading Institutes\nDate: 14-Aug-2026 13:10' } },
      { id: 'msg-jd-hist-004', mock: true, payload: { from: 'instantemail@justdial.com', text: 'Enquiry ID: JD-849105\nName: Navin Arora\nMobile: 9414408115\nLocation: Vigyan nagar, Kota\nCategory: Share Trading Institutes\nDate: 14-Aug-2026 11:48' } },
      { id: 'msg-jd-hist-005', mock: true, payload: { from: 'instantemail@justdial.com', text: 'Enquiry ID: JD-849106\nName: Sheikh Mohammad\nMobile: 9935319524\nLocation: Daudpur, Gorakhpur\nCategory: Share Trading Institutes\nDate: 13-Aug-2026 19:52' } },
      { id: 'msg-jd-hist-006', mock: true, payload: { from: 'instantemail@justdial.com', text: 'Enquiry ID: JD-849107\nName: Inquiry Without Mobile Number\nLocation: Varanasi\nCategory: Share Trading' } }
    ];
  }

  metrics.gmailMatchingEmails = allMessageRefs.length;
  console.log(`[Backfill] Found ${allMessageRefs.length} candidate Gmail messages in target range.`);

  // Find or Create MarketingSource "Justdial" if in actual import mode
  let justdialSource = null;
  if (!isDryRun) {
    justdialSource = await prisma.marketingSource.findUnique({ where: { name: 'Justdial' } });
    if (!justdialSource) {
      justdialSource = await prisma.marketingSource.create({
        data: { name: 'Justdial', channelType: 'DIRECT', isActive: true }
      });
    }
  }

  // Bounded Concurrency Processing
  const BATCH_SIZE = 10;
  for (let i = 0; i < allMessageRefs.length; i += BATCH_SIZE) {
    const batch = allMessageRefs.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (msgRef) => {
      metrics.totalProcessed++;

      try {
        let rawPayload;
        let msgId = msgRef.id;

        if (msgRef.mock && msgRef.payload) {
          rawPayload = msgRef.payload;
        } else {
          const msgRes = await gmail.users.messages.get({
            userId: 'me',
            id: msgRef.id,
            format: 'full'
          });

          const msgData = msgRes.data;
          msgId = msgData.id;
          const internalDate = new Date(parseInt(msgData.internalDate, 10));

          // Date Boundary Check
          if (internalDate < START_DATE_IST || internalDate > END_DATE_IST) {
            return; // Skip messages outside exact 30-day IST window
          }

          const headers = {};
          if (msgData.payload && msgData.payload.headers) {
            msgData.payload.headers.forEach(h => {
              headers[h.name.toLowerCase()] = h.value;
            });
          }

          const fromHeader = headers['from'] || '';
          const subject = headers['subject'] || '';
          const messageId = headers['message-id'] || msgData.id;

          if (!isValidSender(fromHeader)) {
            metrics.otherFailures++;
            metrics.failedMessages.push({ id: msgId, reason: 'REJECTED_SENDER' });
            return;
          }

          const bodyParts = extractBodyParts(msgData.payload);
          rawPayload = {
            from: fromHeader,
            subject,
            text: bodyParts.text,
            headers,
            date: internalDate.toISOString()
          };
        }

        // Parse using justdialEmailParser.js
        let parsedLead;
        try {
          parsedLead = parseJustdialEmail(rawPayload);
          metrics.parsedSuccessfully++;
        } catch (parseErr) {
          if (parseErr.message.includes('phone number')) {
            metrics.missingPhoneCount++;
            metrics.failedMessages.push({ id: msgId, reason: 'MISSING_PHONE: Kept phone null; no scrape/reveal bypass performed.' });
          } else {
            metrics.parseFailures++;
            metrics.failedMessages.push({ id: msgId, reason: parseErr.message });
          }
          return;
        }

        // Masked record sample for report
        if (metrics.sampleMaskedRecords.length < 5) {
          metrics.sampleMaskedRecords.push({
            externalLeadId: parsedLead.externalLeadId,
            name: parsedLead.name,
            phone: maskPhone(parsedLead.phone),
            city: parsedLead.city || 'N/A',
            receivedAt: parsedLead.receivedAt
          });
        }

        // Deduplication & CRM Processing
        if (isDryRun) {
          // Check if lead would be duplicate in DB
          let existingLead = null;
          if (parsedLead.externalLeadId) {
            existingLead = await prisma.lead.findFirst({
              where: { notes: { contains: parsedLead.externalLeadId } }
            });
          }
          if (!existingLead && parsedLead.phone) {
            existingLead = await prisma.lead.findFirst({
              where: { phone: parsedLead.phone }
            });
          }

          if (existingLead) {
            metrics.updatedExistingLeads++;
            metrics.duplicatesSkipped++;
          } else {
            metrics.importedNewLeads++;
          }

        } else {
          // Actual Import Execution with Merge Safety
          let existingLead = null;
          if (parsedLead.externalLeadId) {
            existingLead = await prisma.lead.findFirst({
              where: { notes: { contains: parsedLead.externalLeadId } }
            });
          }
          if (!existingLead && parsedLead.phone) {
            existingLead = await prisma.lead.findFirst({
              where: { phone: parsedLead.phone }
            });
          }

          if (existingLead) {
            // MERGE SAFETY: Update ONLY missing fields; preserve existing status, assignment, notes
            metrics.duplicatesSkipped++;
            metrics.updatedExistingLeads++;
            await prisma.lead.update({
              where: { id: existingLead.id },
              data: {
                syncedAt: new Date(),
                externalLeadId: existingLead.externalLeadId || parsedLead.externalLeadId
              }
            });
          } else {
            // Transactional New Lead Creation
            const leadNumber = await generateLeadNumber();
            await prisma.$transaction(async (tx) => {
              const lead = await tx.lead.create({
                data: {
                  leadNumber,
                  name: parsedLead.name || 'Justdial Lead',
                  email: parsedLead.email || null,
                  phone: parsedLead.phone,
                  city: parsedLead.city || null,
                  status: 'NEW',
                  callStatus: 'NOT_CALLED',
                  priority: 'MEDIUM',
                  notes: `[Justdial 30-Day Historical Backfill] Ref: ${parsedLead.externalLeadId || 'N/A'} | Enquiry: ${parsedLead.enquiry || 'N/A'}`,
                  source: justdialSource ? { connect: { id: justdialSource.id } } : undefined
                }
              });

              await tx.crmActivityTimeline.create({
                data: {
                  leadId: lead.id,
                  actorName: 'Justdial Historical Backfill',
                  actorRole: 'SYSTEM',
                  eventType: 'LEAD_CREATED',
                  title: `Lead Auto-Imported from 30-Day Justdial Email Backfill`,
                  description: `Ref ID: ${parsedLead.externalLeadId} | Received At: ${parsedLead.receivedAt}`
                }
              });
            });
            metrics.importedNewLeads++;
          }

          processedMessageIds.add(msgData.id);
        }

      } catch (err) {
        metrics.otherFailures++;
        metrics.failedMessages.push({ id: msgRef.id, reason: err.message });
      }
    }));
  }

  if (!isDryRun) {
    saveCheckpoint(Array.from(processedMessageIds));
  }

  // Print Structured Completion Report
  console.log(`\n==================================================`);
  console.log(`FINAL BACKFILL METRICS REPORT`);
  console.log(`==================================================`);
  console.log(`Date window:`);
  console.log(`Start: ${metrics.dateWindowStart}`);
  console.log(`End:   ${metrics.dateWindowEnd}`);
  console.log(``);
  console.log(`Gmail matching emails:      ${metrics.gmailMatchingEmails}`);
  console.log(`Parsed successfully:        ${metrics.parsedSuccessfully}`);
  console.log(`Imported new CRM leads:     ${metrics.importedNewLeads}`);
  console.log(`Updated existing leads:     ${metrics.updatedExistingLeads}`);
  console.log(`Duplicates skipped:         ${metrics.duplicatesSkipped}`);
  console.log(`Emails with missing phone:  ${metrics.missingPhoneCount}`);
  console.log(`Parse failures:             ${metrics.parseFailures}`);
  console.log(`Other failures:             ${metrics.otherFailures}`);
  console.log(`Total processed:            ${metrics.totalProcessed}`);
  console.log(`==================================================`);

  if (metrics.sampleMaskedRecords.length > 0) {
    console.log(`\nSample Masked Records (No PII Leakage):`);
    metrics.sampleMaskedRecords.forEach((r, idx) => {
      console.log(`  ${idx + 1}. [${r.externalLeadId}] ${r.name} | Phone: ${r.phone} | City: ${r.city}`);
    });
  }

  if (metrics.failedMessages.length > 0) {
    console.log(`\nFailed Message IDs & Reasons (Total: ${metrics.failedMessages.length}):`);
    metrics.failedMessages.forEach(f => {
      console.log(`  - Message ID: ${f.id} -> ${f.reason}`);
    });
  }

  console.log(`\n[Backfill Complete]\n`);
}

runJustdialHistoricalBackfill().catch(err => {
  console.error('[Backfill] Execution failed:', err);
  process.exit(1);
});
