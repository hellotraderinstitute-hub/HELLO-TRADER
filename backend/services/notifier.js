/**
 * notifier.js — Hello Trader Central Real-Time Business Notification Engine
 *
 * Channels: Telegram Bot (primary)
 * Features:
 *   - Instant async dispatch (fire-and-forget, never blocks API responses)
 *   - 3 retries with 5s delay on Telegram failure
 *   - 60-second dedup window per event+key (prevents duplicate alerts)
 *   - Internal JSON log (last 1000 events) at backend/data/notificationLog.json
 *   - Per-category enable/disable via .env flags
 *   - NEVER exposes passwords, JWTs, API keys or secrets in messages
 *   - IST timestamp on every notification
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN  || '';
const CHAT_ID    = process.env.TELEGRAM_CHAT_ID    || '';

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
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 5000;

// ─── Dedup Cache (in-memory, 60s TTL per key) ──────────────────────────────
const dedupCache = new Map();

// ─── IST Formatter ─────────────────────────────────────────────────────────
function getISTTime() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Internal Log Writer ───────────────────────────────────────────────────
function writeLog(entry) {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let logs = [];
    if (fs.existsSync(LOG_PATH)) {
      try { logs = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); } catch (_) {}
    }
    logs.unshift(entry);
    if (logs.length > 1000) logs = logs.slice(0, 1000);
    fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('[Notifier] Log write failed:', err.message);
  }
}

// ─── Telegram Dispatcher (native https — no extra deps) ───────────────────
function sendTelegramRaw(text) {
  return new Promise((resolve) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      resolve({ success: false, reason: 'NOT_CONFIGURED' });
      return;
    }

    const body = JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ success: parsed.ok === true, raw: parsed });
        } catch (_) {
          resolve({ success: false, raw: data });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'TIMEOUT' }); });
    req.write(body);
    req.end();
  });
}

async function sendTelegram(text) {
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    const result = await sendTelegramRaw(text);
    if (result.success) return result;
    if (attempt < RETRY_COUNT) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    else return result;
  }
}

// ─── Main notify() — always fire-and-forget ────────────────────────────────
/**
 * @param {Object} opts
 * @param {string} opts.event      - Event key e.g. 'NEW_LEAD'
 * @param {string} opts.category   - LEADS | SIGNUPS | PAYMENTS | MEMBERSHIP | REFERRALS | ALGO | COPY | SECURITY | ADMIN
 * @param {string} opts.message    - Full formatted Telegram message (HTML allowed)
 * @param {string} [opts.dedupKey] - Unique key for dedup (e.g. request ID, email)
 */
function notify({ event, category, message, dedupKey }) {
  // Category check
  if (CATEGORY_FLAGS[category] === false) return;

  // Dedup check
  if (dedupKey) {
    const key = `${event}:${dedupKey}`;
    if (dedupCache.has(key)) {
      console.log(`[Notifier] Dedup suppressed: ${key}`);
      return;
    }
    dedupCache.set(key, true);
    setTimeout(() => dedupCache.delete(key), 60000);
  }

  // Fire and forget
  setImmediate(async () => {
    const result = await sendTelegram(message);
    writeLog({
      event,
      category,
      dedupKey: dedupKey || null,
      result,
      ist: getISTTime(),
      timestamp: new Date().toISOString(),
    });
    if (!result.success) {
      console.error(`[Notifier] Telegram failed for event ${event}:`, result.error || result.reason);
    }
  });
}

// ─── Pre-built Message Builders ───────────────────────────────────────────

const N = {

  // ── EDUCATION LEADS ──────────────────────────────────────────
  newLead({ name, phone, email, interest, message: msg }) {
    notify({
      event: 'NEW_LEAD',
      category: 'LEADS',
      dedupKey: phone,
      message: `🔔 <b>NEW COURSE ENQUIRY</b>\n\n👤 <b>Name:</b> ${name}\n📞 <b>Phone:</b> ${phone}${email ? `\n📧 <b>Email:</b> ${email}` : ''}${interest ? `\n📚 <b>Interest:</b> ${interest}` : ''}${msg ? `\n💬 <b>Message:</b> ${msg}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  newDemo({ name, phone, email, interest, message: msg }) {
    notify({
      event: 'NEW_DEMO',
      category: 'LEADS',
      dedupKey: phone,
      message: `🎯 <b>FREE DEMO BOOKING</b>\n\n👤 <b>Name:</b> ${name}\n📞 <b>Phone:</b> ${phone}${email ? `\n📧 <b>Email:</b> ${email}` : ''}${interest ? `\n📚 <b>Course:</b> ${interest}` : ''}${msg ? `\n💬 <b>Message:</b> ${msg}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── TERMINAL SIGNUPS ─────────────────────────────────────────
  newSignupRequest({ name, phone, email, referralCode, ipAddress }) {
    notify({
      event: 'NEW_SIGNUP_REQUEST',
      category: 'SIGNUPS',
      dedupKey: email || phone,
      message: `🚀 <b>NEW TERMINAL SIGNUP REQUEST</b>\n\n👤 <b>Name:</b> ${name}\n📞 <b>Phone:</b> ${phone}\n📧 <b>Email:</b> ${email}${referralCode ? `\n🔗 <b>Referral:</b> ${referralCode}` : ''}${ipAddress ? `\n🌐 <b>IP:</b> ${ipAddress}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  signupApproved({ name, studentId, email, phone }) {
    notify({
      event: 'SIGNUP_APPROVED',
      category: 'SIGNUPS',
      dedupKey: studentId,
      message: `✅ <b>SIGNUP APPROVED</b>\n\n👤 <b>Name:</b> ${name}\n🆔 <b>Student ID:</b> ${studentId}\n📧 <b>Email:</b> ${email}\n📞 <b>Phone:</b> ${phone}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  signupRejected({ name, email, phone }) {
    notify({
      event: 'SIGNUP_REJECTED',
      category: 'SIGNUPS',
      dedupKey: email || phone,
      message: `❌ <b>SIGNUP REJECTED</b>\n\n👤 <b>Name:</b> ${name}\n📧 <b>Email:</b> ${email}\n📞 <b>Phone:</b> ${phone}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── PAYMENTS / RECHARGE ──────────────────────────────────────
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

  paymentRejected({ studentName, studentId, amount, reason }) {
    notify({
      event: 'PAYMENT_REJECTED',
      category: 'PAYMENTS',
      dedupKey: `${studentId}_rejected_${amount}`,
      message: `❌ <b>PAYMENT REJECTED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n💵 <b>Amount:</b> ₹${amount}${reason ? `\n📝 <b>Reason:</b> ${reason}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── MEMBERSHIP ───────────────────────────────────────────────
  membershipActivated({ studentName, studentId, durationDays, expiresAt }) {
    const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
    notify({
      event: 'MEMBERSHIP_ACTIVATED',
      category: 'MEMBERSHIP',
      dedupKey: `${studentId}_activated_${durationDays}`,
      message: `🎖️ <b>MEMBERSHIP ACTIVATED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n📅 <b>Duration:</b> ${durationDays} days\n⏰ <b>Expires:</b> ${expiry}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  membershipExpired({ studentName, studentId, autoRenewed, cost }) {
    notify({
      event: autoRenewed ? 'MEMBERSHIP_AUTO_RENEWED' : 'MEMBERSHIP_EXPIRED',
      category: 'MEMBERSHIP',
      dedupKey: `${studentId}_${autoRenewed ? 'renewed' : 'expired'}_${new Date().toDateString()}`,
      message: autoRenewed
        ? `🔄 <b>MEMBERSHIP AUTO-RENEWED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n✅ ${cost || 'Monthly'} tokens deducted — renewed for 30 days\n\n🕐 <i>${getISTTime()} IST</i>`
        : `⏰ <b>MEMBERSHIP EXPIRED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n⚠️ Insufficient tokens — NOT renewed\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── REFERRALS ────────────────────────────────────────────────
  newReferralRegistration({ referrerName, referrerId, newUserEmail, referralCode }) {
    notify({
      event: 'REFERRAL_REGISTRATION',
      category: 'REFERRALS',
      dedupKey: newUserEmail,
      message: `👥 <b>NEW REFERRAL REGISTRATION</b>\n\n🔗 <b>Referrer:</b> ${referrerName} (${referrerId})\n📧 <b>New Lead:</b> ${newUserEmail}\n🏷️ <b>Code Used:</b> ${referralCode}\n⏳ <b>Status:</b> PENDING\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  referralRewardCredited({ referrerName, referrerId, amount, newUserName }) {
    notify({
      event: 'REFERRAL_REWARD',
      category: 'REFERRALS',
      dedupKey: `${referrerId}_reward_${Date.now()}`,
      message: `🏆 <b>REFERRAL REWARD CREDITED</b>\n\n👤 <b>Referrer:</b> ${referrerName} (${referrerId})\n🎉 <b>New Student:</b> ${newUserName}\n🪙 <b>Reward:</b> ₹${amount} Referral Tokens\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── ALGO TRADING ─────────────────────────────────────────────
  algoConnected({ studentName, studentId, broker, displayName }) {
    notify({
      event: 'ALGO_BROKER_CONNECTED',
      category: 'ALGO',
      dedupKey: `${studentId}_${broker}`,
      message: `🤖 <b>ALGO BROKER CONNECTED</b>\n\n👤 <b>Student:</b> ${studentName} (${studentId})\n🏦 <b>Broker:</b> ${broker}${displayName ? `\n📛 <b>Display Name:</b> ${displayName}` : ''}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── COPY TRADING ─────────────────────────────────────────────
  copyFollow({ followerName, followerId, masterName, masterId }) {
    notify({
      event: 'COPY_FOLLOW',
      category: 'COPY',
      dedupKey: `${followerId}_follows_${masterId}`,
      message: `📋 <b>COPY TRADING SUBSCRIPTION</b>\n\n👤 <b>Follower:</b> ${followerName} (${followerId})\n📊 <b>Master:</b> ${masterName} (${masterId})\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── SECURITY EVENTS ─────────────────────────────────────────
  securityEvent({ eventType, studentId, email, detail }) {
    notify({
      event: 'SECURITY_EVENT',
      category: 'ADMIN',
      dedupKey: `sec_${studentId || email || 'unknown'}_${Date.now()}`,
      message: `🚨 <b>SECURITY EVENT</b>\n\n📌 <b>Event:</b> ${eventType}\n👤 <b>User:</b> ${studentId || 'N/A'} (${email || 'N/A'})\n📝 <b>Detail:</b> ${detail || 'N/A'}\n\n🕐 <i>${getISTTime()} IST</i>`,
    });
  },

  // ── CUSTOM TELEGRAM DISPATCH ────────────────────────────────
  sendTelegramCustomMessage(targetChatId, messageText) {
    return notify({
      event: 'CUSTOM_TELEGRAM_MESSAGE',
      category: 'ADMIN',
      dedupKey: `custom_msg_${Math.random()}`,
      message: messageText
    });
  }
};

module.exports = { notify, N, sendTelegramRaw, getISTTime };
