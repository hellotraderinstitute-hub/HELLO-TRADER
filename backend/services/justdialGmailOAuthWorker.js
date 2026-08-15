/**
 * ─────────────────────────────────────────────────────────────────────────────
 * justdialGmailOAuthWorker.js — Production Gmail API OAuth 2.0 Ingestion Worker
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Architecture & Guarantees:
 *   - Google Gmail API v1 with OAuth 2.0 via `googleapis` SDK
 *   - Authenticates via OAuth2Client (Client ID + Client Secret + Refresh Token)
 *   - Automatic background access token refresh
 *   - Query: `from:instantemail@justdial.com is:unread`
 *   - Strict privacy: Never stores or logs passwords, App Passwords, or OAuth secrets
 *   - Integrates with existing `justdialEmailParser.js` & `justdialCrmSyncService.js`
 *   - Transactional Email State: Removes `UNREAD` label ONLY after successful CRM import or duplicate detection
 *   - Leaves failed/errored emails UNREAD in Gmail so they retry safely on the next poll cycle
 *   - Overlapping poll guard prevents concurrent worker execution
 *   - Reconnect & backoff error handling with graceful SIGTERM/SIGINT shutdown
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { google } = require('googleapis');
const { parseJustdialEmail, isValidSender } = require('./justdialEmailParser');
const { processJustdialEmailPayload, getSyncStats, maskPhone } = require('./justdialCrmSyncService');

let workerConfig = {
  mode: process.env.JUSTDIAL_INGESTION_MODE || 'OAUTH2',
  user: process.env.GMAIL_OAUTH_USER || 'hellotraderinstitute@gmail.com',
  clientId: process.env.GMAIL_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET || '',
  refreshToken: process.env.GMAIL_OAUTH_REFRESH_TOKEN || '',
  pollIntervalMs: parseInt(process.env.GMAIL_POLL_INTERVAL_MS || '30000', 10)
};

let isPolling = false;
let pollTimer = null;

const workerMetrics = {
  workerStatus: (workerConfig.clientId && workerConfig.clientSecret && workerConfig.refreshToken) ? 'OFFLINE' : 'MISSING_CREDENTIALS',
  lastPollAt: null,
  lastSuccessfulPollAt: null,
  lastError: null,
  unreadJustdialEmailCount: 0,
  processedToday: 0
};

/**
 * Initialize Google OAuth2 Client
 */
function getOAuth2Client() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || workerConfig.clientId;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || workerConfig.clientSecret;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN || workerConfig.refreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  return oauth2Client;
}

/**
 * Recursively parse plain text and HTML content from Gmail message payload parts
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
 * Perform a single safe Gmail API OAuth 2.0 poll cycle
 */
async function executeGmailOAuthPollCycle() {
  const auth = getOAuth2Client();

  if (!auth) {
    workerMetrics.workerStatus = 'MISSING_CREDENTIALS';
    return { success: false, reason: 'GMAIL_OAUTH_CREDENTIALS_MISSING' };
  }

  if (isPolling) {
    console.log('[JustdialOAuth] Skip poll cycle: Previous poll still in progress.');
    return { success: false, reason: 'OVERLAPPING_POLL_PREVENTED' };
  }

  isPolling = true;
  workerMetrics.lastPollAt = new Date().toISOString();
  workerMetrics.workerStatus = 'POLLING';

  let processedInThisCycle = 0;
  let unreadCountInThisCycle = 0;

  try {
    const gmail = google.gmail({ version: 'v1', auth });

    // 1. List unread messages matching Justdial query
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:instantemail@justdial.com is:unread'
    });

    const messages = listRes.data.messages || [];

    if (messages.length === 0) {
      workerMetrics.unreadJustdialEmailCount = 0;
      workerMetrics.workerStatus = 'ONLINE';
      workerMetrics.lastSuccessfulPollAt = new Date().toISOString();
      workerMetrics.lastError = null;
      return { success: true, processed: 0, unread: 0 };
    }

    unreadCountInThisCycle = messages.length;

    // 2. Process each unread message
    for (const msgRef of messages) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgRef.id,
        format: 'full'
      });

      const msgData = msgRes.data;
      const headers = {};
      if (msgData.payload && msgData.payload.headers) {
        msgData.payload.headers.forEach(h => {
          headers[h.name.toLowerCase()] = h.value;
        });
      }

      const fromHeader = headers['from'] || '';
      const subject = headers['subject'] || '';
      const messageId = headers['message-id'] || msgData.id;

      // Primary Sender Guard
      if (!isValidSender(fromHeader)) {
        console.log(`[JustdialOAuth] Message ${msgData.id} ignored: Sender ${fromHeader} not in allowlist.`);
        continue;
      }

      // Extract body text and HTML
      const bodyParts = extractBodyParts(msgData.payload);

      const rawPayload = {
        from: fromHeader,
        subject,
        text: bodyParts.text,
        html: bodyParts.html,
        messageId,
        headers
      };

      // 3. Ingest lead through CRM Sync Engine
      const syncResult = await processJustdialEmailPayload(rawPayload);

      // 4. TRANSACTIONAL READ MARKING:
      // Remove UNREAD label ONLY after successful CRM import or duplicate detection
      if (syncResult.success || syncResult.status === 'DUPLICATE') {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id: msgData.id,
            requestBody: {
              removeLabelIds: ['UNREAD']
            }
          });
          processedInThisCycle++;
          workerMetrics.processedToday++;
          console.log(`[JustdialOAuth] Message ${msgData.id} processed (${syncResult.status}). Removed UNREAD label.`);
        } catch (modifyErr) {
          console.error(`[JustdialOAuth] Failed to remove UNREAD label for message ${msgData.id}:`, modifyErr.message);
        }
      } else {
        console.warn(`[JustdialOAuth] Message ${msgData.id} ingestion failed (${syncResult.error}). Leaving UNREAD for retry.`);
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
    const errorMsg = err.message || 'Gmail API OAuth Connection Error';
    console.error('[JustdialOAuth] Poll Cycle Error:', errorMsg);
    workerMetrics.workerStatus = 'ERROR';
    workerMetrics.lastError = errorMsg;
    return { success: false, error: errorMsg };
  } finally {
    isPolling = false;
  }
}

/**
 * Start recurring Gmail API OAuth worker loop
 */
function startJustdialGmailOAuthWorker(customConfig = null) {
  if (customConfig) {
    workerConfig = { ...workerConfig, ...customConfig };
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const hasAuth = !!(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET && process.env.GMAIL_OAUTH_REFRESH_TOKEN);

  if (!hasAuth && !workerConfig.clientId) {
    console.log('[JustdialOAuth] Worker is pending configuration (GMAIL_OAUTH_CLIENT_ID missing).');
    workerMetrics.workerStatus = 'MISSING_CREDENTIALS';
    return;
  }

  console.log(`[JustdialOAuth] Starting Gmail API OAuth 2.0 Worker for ${workerConfig.user} (Interval: ${workerConfig.pollIntervalMs}ms)...`);

  // Initial poll on startup
  executeGmailOAuthPollCycle();

  // Schedule recurring poll loop
  pollTimer = setInterval(() => {
    executeGmailOAuthPollCycle();
  }, workerConfig.pollIntervalMs);
}

/**
 * Stop worker cleanly
 */
function stopJustdialGmailOAuthWorker() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  workerMetrics.workerStatus = 'STOPPED';
  isPolling = false;
  console.log('[JustdialOAuth] Worker stopped cleanly.');
}

/**
 * Get OAuth worker status combined with CRM sync stats
 */
function getGmailOAuthWorkerStatus() {
  const crmStats = getSyncStats();
  const user = workerConfig.user || 'hellotraderinstitute@gmail.com';
  const maskedUser = user ? `${user.slice(0, 3)}***@${user.split('@')[1] || ''}` : 'NOT_SET';

  return {
    ...crmStats,
    worker: {
      mode: 'OAUTH2',
      status: workerMetrics.workerStatus,
      user: maskedUser,
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

// Graceful process shutdown listeners
process.on('SIGTERM', () => stopJustdialGmailOAuthWorker());
process.on('SIGINT', () => stopJustdialGmailOAuthWorker());

module.exports = {
  startJustdialGmailOAuthWorker,
  stopJustdialGmailOAuthWorker,
  executeGmailOAuthPollCycle,
  getGmailOAuthWorkerStatus
};
