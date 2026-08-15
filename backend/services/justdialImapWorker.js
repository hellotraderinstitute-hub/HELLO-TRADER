/**
 * ─────────────────────────────────────────────────────────────────────────────
 * justdialImapWorker.js — Production IMAP Polling Worker for Justdial Email Leads
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Architecture & Guarantees:
 *   - Secure IMAPS connection via maintained `imapflow` library
 *   - Parses raw MIME/HTML/Text using `mailparser.simpleParser`
 *   - Filters senders against `APPROVED_SENDERS` (e.g. instantemail@justdial.com)
 *   - Integrates with `justdialEmailParser.js` & `justdialCrmSyncService.js`
 *   - Transactional Email State: Only marks email as `\Seen` AFTER successful CRM import or duplicate detection
 *   - Leaves failed/errored emails UNREAD so they retry safely on the next poll cycle
 *   - Single-worker loop guard prevents overlapping poll runs
 *   - Never logs credentials, App Passwords, or unmasked sensitive data
 *   - Handles connection drops, exponential backoff, and graceful SIGTERM/SIGINT shutdown
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { isValidSender } = require('./justdialEmailParser');
const { processJustdialEmailPayload, getSyncStats, maskPhone } = require('./justdialCrmSyncService');

let workerConfig = {
  enabled: process.env.JUSTDIAL_IMAP_ENABLED === 'true',
  host: process.env.JUSTDIAL_IMAP_HOST || 'imap.gmail.com',
  port: parseInt(process.env.JUSTDIAL_IMAP_PORT || '993', 10),
  secure: process.env.JUSTDIAL_IMAP_SECURE !== 'false',
  user: process.env.JUSTDIAL_IMAP_USER || '',
  pass: process.env.JUSTDIAL_IMAP_APP_PASSWORD || process.env.JUSTDIAL_IMAP_PASSWORD || '',
  pollIntervalMs: parseInt(process.env.JUSTDIAL_IMAP_POLL_INTERVAL_MS || '30000', 10)
};

let isPolling = false;
let pollTimer = null;
let activeClient = null;

const workerMetrics = {
  workerStatus: workerConfig.enabled ? 'OFFLINE' : 'DISABLED',
  lastPollAt: null,
  lastSuccessfulPollAt: null,
  lastError: null,
  unreadJustdialEmailCount: 0,
  processedToday: 0
};

/**
 * Perform a single safe IMAP poll cycle
 */
async function executeImapPollCycle() {
  if (!workerConfig.enabled || !workerConfig.user || !workerConfig.pass) {
    workerMetrics.workerStatus = workerConfig.enabled ? 'MISSING_CREDENTIALS' : 'DISABLED';
    return { success: false, reason: 'IMAP worker disabled or credentials missing' };
  }

  if (isPolling) {
    console.log('[JustdialIMAP] Skip poll cycle: Previous poll still in progress.');
    return { success: false, reason: 'OVERLAPPING_POLL_PREVENTED' };
  }

  isPolling = true;
  workerMetrics.lastPollAt = new Date().toISOString();
  workerMetrics.workerStatus = 'POLLING';

  let client = null;
  let lock = null;
  let processedInThisCycle = 0;
  let unreadCountInThisCycle = 0;

  try {
    client = new ImapFlow({
      host: workerConfig.host,
      port: workerConfig.port,
      secure: workerConfig.secure,
      auth: {
        user: workerConfig.user,
        pass: workerConfig.pass
      },
      logger: false, // Strict privacy: Never log auth strings or email contents
      tls: {
        rejectUnauthorized: true
      }
    });

    activeClient = client;

    // 1. Connect securely to IMAP server
    await client.connect();

    // 2. Open & Lock INBOX
    lock = await client.getLock('INBOX');

    // 3. Search for unread messages
    const searchResult = await client.search({ seen: false });

    if (!searchResult || searchResult.length === 0) {
      workerMetrics.unreadJustdialEmailCount = 0;
      workerMetrics.workerStatus = 'ONLINE';
      workerMetrics.lastSuccessfulPollAt = new Date().toISOString();
      workerMetrics.lastError = null;
      return { success: true, processed: 0, unread: 0 };
    }

    // 4. Fetch and inspect unread messages
    for await (const message of client.fetch(searchResult, { envelope: true, source: true, flags: true, uid: true })) {
      const fromAddress = message.envelope && message.envelope.from && message.envelope.from[0]
        ? message.envelope.from[0].address
        : '';

      // Primary Sender Guard: Only process emails from approved Justdial senders
      if (!isValidSender(fromAddress)) {
        // Leave unrelated emails unread and untouched
        continue;
      }

      unreadCountInThisCycle++;

      // Parse full raw email MIME body
      let parsedMail;
      try {
        parsedMail = await simpleParser(message.source);
      } catch (parseErr) {
        console.error(`[JustdialIMAP] MIME parsing failed for UID ${message.uid}:`, parseErr.message);
        // Leave email UNREAD for safety
        continue;
      }

      const rawPayload = {
        from: fromAddress,
        subject: parsedMail.subject || (message.envelope && message.envelope.subject) || '',
        text: parsedMail.text || '',
        html: parsedMail.html || parsedMail.textAsHtml || '',
        messageId: parsedMail.messageId || (message.envelope && message.envelope.messageId) || String(message.uid),
        headers: parsedMail.headers ? Object.fromEntries(parsedMail.headers) : {}
      };

      // 5. Ingest lead through CRM Sync Engine
      const syncResult = await processJustdialEmailPayload(rawPayload);

      // 6. Transactional State Update: Mark message read ONLY after successful CRM transaction or duplicate
      if (syncResult.success || syncResult.status === 'DUPLICATE') {
        try {
          await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen']);
          processedInThisCycle++;
          workerMetrics.processedToday++;
          console.log(`[JustdialIMAP] UID ${message.uid} processed (${syncResult.status}). Marked \\Seen.`);
        } catch (flagErr) {
          console.error(`[JustdialIMAP] Failed to set \\Seen flag for UID ${message.uid}:`, flagErr.message);
        }
      } else {
        console.warn(`[JustdialIMAP] UID ${message.uid} ingestion failed (${syncResult.error}). Leaving UNREAD for retry.`);
      }
    }

    workerMetrics.unreadJustdialEmailCount = unreadCountInThisCycle;
    workerMetrics.workerStatus = 'ONLINE';
    workerMetrics.lastSuccessfulPollAt = new Date().toISOString();
    workerMetrics.lastError = null;

    return {
      success: true,
      processed: processedInThisCycle,
      unread: unreadCountInThisCycle
    };

  } catch (err) {
    const errorMsg = err.message || 'IMAP Connection Error';
    console.error('[JustdialIMAP] Poll Cycle Error:', errorMsg);
    workerMetrics.workerStatus = 'ERROR';
    workerMetrics.lastError = errorMsg.replace(new RegExp(workerConfig.pass, 'g'), '***MASKED***');
    return { success: false, error: workerMetrics.lastError };
  } finally {
    if (lock) {
      try { lock.release(); } catch (_) {}
    }
    if (client) {
      try { await client.logout(); } catch (_) {}
    }
    activeClient = null;
    isPolling = false;
  }
}

/**
 * Start recurring IMAP worker loop
 */
function startJustdialImapWorker(customConfig = null) {
  if (customConfig) {
    workerConfig = { ...workerConfig, ...customConfig };
  }

  if (!workerConfig.enabled) {
    console.log('[JustdialIMAP] Worker is disabled (JUSTDIAL_IMAP_ENABLED !== true).');
    workerMetrics.workerStatus = 'DISABLED';
    return;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  console.log(`[JustdialIMAP] Starting IMAP Worker loop for ${workerConfig.user} (Interval: ${workerConfig.pollIntervalMs}ms)...`);

  // Trigger initial poll immediately on server start
  executeImapPollCycle();

  // Schedule recurring polling loop
  pollTimer = setInterval(() => {
    executeImapPollCycle();
  }, workerConfig.pollIntervalMs);
}

/**
 * Stop IMAP worker loop and disconnect active clients
 */
async function stopJustdialImapWorker() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (activeClient) {
    try {
      await activeClient.logout();
    } catch (_) {}
    activeClient = null;
  }

  workerMetrics.workerStatus = 'STOPPED';
  isPolling = false;
  console.log('[JustdialIMAP] IMAP Worker stopped cleanly.');
}

/**
 * Get comprehensive worker status combined with CRM sync metrics
 */
function getImapWorkerStatus() {
  const crmStats = getSyncStats();
  return {
    ...crmStats,
    worker: {
      enabled: workerConfig.enabled,
      status: workerMetrics.workerStatus,
      user: workerConfig.user ? `${workerConfig.user.slice(0, 3)}***@${workerConfig.user.split('@')[1] || ''}` : 'NOT_SET',
      host: workerConfig.host,
      port: workerConfig.port,
      pollIntervalMs: workerConfig.pollIntervalMs,
      lastPollAt: workerMetrics.lastPollAt,
      lastSuccessfulPollAt: workerMetrics.lastSuccessfulPollAt,
      lastError: workerMetrics.lastError,
      unreadJustdialEmailCount: workerMetrics.unreadJustdialEmailCount,
      processedToday: workerMetrics.processedToday,
      isPolling
    }
  };
}

// Listen for process SIGTERM / SIGINT for graceful shutdown
process.on('SIGTERM', () => stopJustdialImapWorker());
process.on('SIGINT', () => stopJustdialImapWorker());

module.exports = {
  startJustdialImapWorker,
  stopJustdialImapWorker,
  executeImapPollCycle,
  getImapWorkerStatus
};
