/**
 * backend/services/notifier.js
 * Hello Trader Central Real-Time Business & Algo Trading Notification Engine
 *
 * Channel: Telegram Bot API (Native HTTPS, zero external runtime deps)
 *
 * Core Principles:
 * 1. NON-BLOCKING: All dispatches are fire-and-forget via setImmediate. A notification failure
 *    can NEVER throw, block, delay, or affect live trade execution or HTTP API responses.
 * 2. STRUCTURED AUDIT LOGGING: Every attempt is logged with timestamp, event type, dedupKey,
 *    HTTP status, latency, and success/failure reason in backend/data/notificationLog.json.
 * 3. SECURITY: Bot tokens, chat IDs, passwords, and private secrets are NEVER logged in plaintext.
 * 4. RESILIENCE: 3 retries with exponential backoff for transient Telegram API failures.
 * 5. IDEMPOTENCY: 60-second deduplication cache per event+key to prevent duplicate alerts.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Environment Config ───────────────────────────────────────────────────────
function getBotConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  };
}

const CATEGORY_FLAGS = {
  LEADS:      process.env.NOTIFY_LEADS      !== 'false',
  SIGNUPS:    process.env.NOTIFY_SIGNUPS    !== 'false',
  PAYMENTS:   process.env.NOTIFY_PAYMENTS   !== 'false',
  MEMBERSHIP: process.env.NOTIFY_MEMBERSHIP !== 'false',
  REFERRALS:  process.env.NOTIFY_REFERRALS  !== 'false',
  ALGO:       process.env.NOTIFY_ALGO       !== 'false',
  COPY:       process.env.NOTIFY_COPY       !== 'false',
  SECURITY:   process.env.NOTIFY_SECURITY   !== 'false',
  ADMIN:      process.env.NOTIFY_ADMIN      !== 'false',
};

const LOG_PATH = path.join(__dirname, '../data/notificationLog.json');
const MAX_LOG_ENTRIES = 1000;
const RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 2000;

// ─── Dedup Cache (in-memory, 60s TTL per key) ────────────────────────────────
const dedupCache = new Map();

// ─── IST Formatter ───────────────────────────────────────────────────────────
function getISTTime() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Structured Notification Log Writer ──────────────────────────────────────
function writeStructuredLog(entry) {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let logs = [];
    if (fs.existsSync(LOG_PATH)) {
      try {
        logs = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
      } catch (_) {
        logs = [];
      }
    }

    logs.unshift({
      event: entry.event || 'UNKNOWN',
      category: entry.category || 'GENERAL',
      dedupKey: entry.dedupKey || null,
      status: entry.status || (entry.success ? 'DELIVERED' : 'FAILED'),
      httpStatus: entry.httpStatus || null,
      errorReason: entry.errorReason || null,
      latencyMs: entry.latencyMs || 0,
      ist: getISTTime(),
      timestamp: new Date().toISOString(),
    });

    if (logs.length > MAX_LOG_ENTRIES) logs = logs.slice(0, MAX_LOG_ENTRIES);
    fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[Notifier] Structured log write error (non-fatal):', err.message);
  }
}

// ─── Native HTTPS Telegram Dispatcher with Timeout & Backoff ─────────────────
function sendTelegramRaw(text, customChatId = null) {
  const startTime = Date.now();
  const { botToken, chatId: envChatId } = getBotConfig();
  const targetChatId = customChatId || envChatId;

  return new Promise((resolve) => {
    if (!botToken || !targetChatId) {
      return resolve({
        success: false,
        httpStatus: null,
        errorReason: !botToken ? 'BOT_TOKEN_MISSING' : 'CHAT_ID_MISSING',
        latencyMs: Date.now() - startTime,
      });
    }

    const payload = JSON.stringify({
      chat_id: targetChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 8000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          const latencyMs = Date.now() - startTime;
          try {
            const parsed = JSON.parse(rawData);
            if (parsed.ok === true) {
              resolve({
                success: true,
                httpStatus: res.statusCode || 200,
                telegramMessageId: parsed.result?.message_id || null,
                latencyMs,
              });
            } else {
              resolve({
                success: false,
                httpStatus: res.statusCode || 400,
                errorReason: parsed.description || 'TELEGRAM_API_ERROR',
                latencyMs,
              });
            }
          } catch (e) {
            resolve({
              success: false,
              httpStatus: res.statusCode || 500,
              errorReason: 'RESPONSE_PARSE_ERROR',
              latencyMs,
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        success: false,
        httpStatus: null,
        errorReason: err.message || 'NETWORK_ERROR',
        latencyMs: Date.now() - startTime,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        httpStatus: 408,
        errorReason: 'REQUEST_TIMEOUT',
        latencyMs: Date.now() - startTime,
      });
    });

    req.write(payload);
    req.end();
  });
}

// ─── Retry with Exponential Backoff ──────────────────────────────────────────
async function sendTelegramWithRetry(text, customChatId = null) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const result = await sendTelegramRaw(text, customChatId);
    if (result.success) return result;

    // Do not retry permanent client configuration errors
    if (result.errorReason === 'BOT_TOKEN_MISSING' || result.errorReason === 'CHAT_ID_MISSING') {
      return result;
    }

    if (attempt < RETRY_ATTEMPTS) {
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    } else {
      return result;
    }
  }
}

// ─── Main notify() Dispatcher (Guaranteed Fire-and-Forget) ────────────────────
function notify({ event, category, message, dedupKey, customChatId = null }) {
  try {
    // 1. Category check
    if (CATEGORY_FLAGS[category] === false) return;

    // 2. Dedup check (60-second TTL)
    if (dedupKey) {
      const key = `${event}:${dedupKey}`;
      if (dedupCache.has(key)) {
        return;
      }
      dedupCache.set(key, true);
      setTimeout(() => dedupCache.delete(key), 60000);
    }

    // 3. Test data isolation check
    const msgLower = (message || '').toLowerCase();
    const dedupLower = (dedupKey || '').toLowerCase();
    const isTestData =
      msgLower.includes('ht9999') ||
      msgLower.includes('ht0803') ||
      msgLower.includes('student test') ||
      msgLower.includes('vpstest') ||
      msgLower.includes('e2e-verify') ||
      dedupLower.includes('ht9999') ||
      dedupLower.includes('ht0803') ||
      dedupLower.includes('vpstest') ||
      dedupLower.includes('mock_test');

    if (isTestData) {
      setImmediate(() => {
        writeStructuredLog({
          event,
          category,
          dedupKey,
          status: 'SUPPRESSED',
          errorReason: 'TEST_DATA_ISOLATION',
          success: true,
        });
      });
      return;
    }

    // 4. Asynchronous fire-and-forget delivery
    setImmediate(async () => {
      try {
        const result = await sendTelegramWithRetry(message, customChatId);
        writeStructuredLog({
          event,
          category,
          dedupKey,
          status: result.success ? 'DELIVERED' : 'FAILED',
          httpStatus: result.httpStatus,
          errorReason: result.errorReason,
          latencyMs: result.latencyMs,
          success: result.success,
        });
      } catch (err) {
        writeStructuredLog({
          event,
          category,
          dedupKey,
          status: 'FAILED',
          errorReason: err.message,
          success: false,
        });
      }
    });
  } catch (err) {
    console.error('[Notifier] Non-blocking dispatch error:', err.message);
  }
}

// ─── First-Class Notification Helpers (Business & Algo Trading) ───────────────
const N = {
  // ─── ALGO TRADING NOTIFICATIONS ──────────────────────────────────────────
  algoBuyExecuted({ studentName, studentId, symbol, lots, quantity, price, orderId, tokensDebited, balanceAfter }) {
    notify({
      event: 'ALGO_BUY_ENTRY',
      category: 'ALGO',
      dedupKey: `buy_${studentId}_${orderId}`,
      message: `🟢 <b>ALGO BUY ORDER EXECUTED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n📈 <b>Symbol:</b> <code>${symbol}</code>\n📦 <b>Quantity:</b> ${quantity} (${lots} Lot${lots > 1 ? 's' : ''})\n💵 <b>Executed Price:</b> ₹${price || 'MARKET'}\n🔖 <b>Order ID:</b> <code>${orderId}</code>\n🪙 <b>Prepaid Brokerage:</b> ${tokensDebited} Tokens (Balance: ${balanceAfter}T)\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoSellExecuted({ studentName, studentId, symbol, lots, quantity, price, orderId, tokensDebited, balanceAfter }) {
    notify({
      event: 'ALGO_SELL_ENTRY',
      category: 'ALGO',
      dedupKey: `sell_${studentId}_${orderId}`,
      message: `🔴 <b>ALGO SELL ORDER EXECUTED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n📉 <b>Symbol:</b> <code>${symbol}</code>\n📦 <b>Quantity:</b> ${quantity} (${lots} Lot${lots > 1 ? 's' : ''})\n💵 <b>Executed Price:</b> ₹${price || 'MARKET'}\n🔖 <b>Order ID:</b> <code>${orderId}</code>\n🪙 <b>Prepaid Brokerage:</b> ${tokensDebited} Tokens (Balance: ${balanceAfter}T)\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoExitExecuted({ studentName, studentId, symbol, lots, quantity, price, orderId, exitReason, realizedPnl }) {
    const pnlFormatted = realizedPnl != null ? `${realizedPnl >= 0 ? '+' : ''}₹${Number(realizedPnl).toFixed(2)}` : 'N/A';
    const pnlIcon = realizedPnl >= 0 ? '🟢' : '🔴';
    notify({
      event: 'ALGO_EXIT_SQUAREOFF',
      category: 'ALGO',
      dedupKey: `exit_${studentId}_${orderId}`,
      message: `🏁 <b>ALGO POSITION SQUARED OFF</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n🎯 <b>Symbol:</b> <code>${symbol}</code>\n📦 <b>Closed Lots:</b> ${lots} (${quantity} Qty)\n💵 <b>Exit Price:</b> ₹${price || 'MARKET'}\n${pnlIcon} <b>Realized P&L:</b> ${pnlFormatted}\n📝 <b>Reason:</b> ${exitReason || 'Signal Square-off'}\n🔖 <b>Exit Order:</b> <code>${orderId}</code>\n🪙 <b>Exit Brokerage:</b> ₹0 (Prepaid at Entry)\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoOrderFailed({ studentName, studentId, symbol, action, reason, orderId }) {
    notify({
      event: 'ALGO_ORDER_FAILED',
      category: 'ALGO',
      dedupKey: `fail_${studentId}_${orderId || Date.now()}`,
      message: `⚠️ <b>ALGO ORDER REJECTED / FAILED</b>\n\n👤 <b>Student:</b> ${studentName || 'Student'} (${studentId || 'N/A'})\n📊 <b>Action:</b> ${action || 'ORDER'}\n📌 <b>Symbol:</b> <code>${symbol || 'N/A'}</code>\n❌ <b>Failure Reason:</b> ${reason || 'Broker / Preflight Rejection'}\n${orderId ? `🔖 <b>Ref:</b> <code>${orderId}</code>\n` : ''}\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoWebhookReceived({ action, symbol, strike, spotPrice, source }) {
    notify({
      event: 'ALGO_WEBHOOK_RECEIVED',
      category: 'ALGO',
      dedupKey: `wb_${action}_${symbol}_${Math.floor(Date.now() / 5000)}`, // 5s dedup
      message: `📡 <b>TRADING SIGNAL WEBHOOK RECEIVED</b>\n\n🎯 <b>Action:</b> ${action}\n📊 <b>Underlying:</b> ${symbol}\n🏷️ <b>Target Strike:</b> ${strike || 'ATM'}\n📈 <b>Spot Price:</b> ₹${spotPrice || '-'}\n📡 <b>Source:</b> ${source || 'TradingView Webhook'}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoTokenDeducted({ studentName, studentId, amount, reason, balanceBefore, balanceAfter, orderId }) {
    notify({
      event: 'ALGO_TOKEN_DEDUCTED',
      category: 'PAYMENTS',
      dedupKey: `debit_${studentId}_${orderId || Date.now()}`,
      message: `🪙 <b>WALLET TOKEN DEDUCTION</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n🔻 <b>Debited:</b> ${amount} Tokens\n📝 <b>Purpose:</b> ${reason}\n💳 <b>Balance:</b> ${balanceBefore}T ➔ <b>${balanceAfter}T</b>\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoKillSwitchTriggered({ studentName, studentId, triggerSource, affectedPositions }) {
    notify({
      event: 'KILL_SWITCH_TRIGGERED',
      category: 'SECURITY',
      dedupKey: `kill_${studentId}_${Date.now()}`,
      message: `🚨 <b>EMERGENCY KILL SWITCH TRIGGERED</b>\n\n👤 <b>User:</b> ${studentName} (${studentId})\n🛑 <b>Source:</b> ${triggerSource || 'User / Admin Emergency Action'}\n📊 <b>Affected Algo Positions:</b> ${affectedPositions || 0}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ─── BUSINESS & PLATFORM NOTIFICATIONS ────────────────────────────────────
  newLead({ name, phone, email, interest, message: msg }) {
    notify({
      event: 'NEW_LEAD',
      category: 'LEADS',
      dedupKey: phone,
      message: `🔔 <b>NEW COURSE ENQUIRY</b>\n\n👤 <b>Name:</b> ${name}\n📞 <b>Phone:</b> ${phone}${email ? `\n📧 <b>Email:</b> ${email}` : ''}${interest ? `\n📚 <b>Interest:</b> ${interest}` : ''}${msg ? `\n💬 <b>Message:</b> ${msg}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  newSignupRequest({ name, phone, email, referralCode, ipAddress }) {
    notify({
      event: 'NEW_SIGNUP_REQUEST',
      category: 'SIGNUPS',
      dedupKey: email || phone,
      message: `🚀 <b>NEW TERMINAL SIGNUP REQUEST</b>\n\n👤 <b>Name:</b> ${name}\n📞 <b>Phone:</b> ${phone}\n📧 <b>Email:</b> ${email}${referralCode ? `\n🔗 <b>Referral:</b> ${referralCode}` : ''}${ipAddress ? `\n🌐 <b>IP:</b> ${ipAddress}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  newPaymentRequest({ studentName, studentId, amount, method, utr }) {
    notify({
      event: 'NEW_PAYMENT_REQUEST',
      category: 'PAYMENTS',
      dedupKey: utr || `${studentId}_${amount}_${Date.now()}`,
      message: `💰 <b>NEW RECHARGE REQUEST</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n💵 <b>Amount:</b> ₹${amount}\n🏦 <b>Method:</b> ${method}${utr ? `\n🔖 <b>UTR:</b> ${utr}` : ''}\n⏳ <b>Status:</b> PENDING\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  paymentApproved({ studentName, studentId, amount, tokens, bonus }) {
    notify({
      event: 'PAYMENT_APPROVED',
      category: 'PAYMENTS',
      dedupKey: `${studentId}_approved_${amount}`,
      message: `✅ <b>PAYMENT APPROVED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n💵 <b>Amount:</b> ₹${amount}\n🪙 <b>Tokens Credited:</b> ${tokens}${bonus > 0 ? ` (+${bonus} Bonus)` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  algoConnected({ studentName, studentId, broker, displayName }) {
    notify({
      event: 'ALGO_BROKER_CONNECTED',
      category: 'ALGO',
      dedupKey: `${studentId}_${broker}`,
      message: `🤖 <b>ALGO BROKER CONNECTED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n🏦 <b>Broker:</b> ${broker}${displayName ? `\n📛 <b>Display Name:</b> ${displayName}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  securityEvent({ eventType, studentId, email, detail }) {
    notify({
      event: 'SECURITY_EVENT',
      category: 'ADMIN',
      dedupKey: `sec_${studentId || email || 'unknown'}_${Date.now()}`,
      message: `🚨 <b>SECURITY EVENT</b>\n\n📌 <b>Event:</b> ${eventType}\n👤 <b>User:</b> ${studentId || 'N/A'} (${email || 'N/A'})\n📝 <b>Detail:</b> ${detail || 'N/A'}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  sendTestNotification({ targetChatId, message }) {
    return sendTelegramRaw(
      message || `🔔 <b>HELLO TRADER — LIVE SYSTEM NOTIFICATION</b>\n\n✅ Central Telegram Notification Service is Active & Verified.\n\n🕐 <i>${getISTTime()} IST</i>`,
      targetChatId
    );
  },
};

module.exports = {
  notify,
  N,
  sendTelegramRaw,
  sendTelegramWithRetry,
  getISTTime,
  getBotConfig,
};
