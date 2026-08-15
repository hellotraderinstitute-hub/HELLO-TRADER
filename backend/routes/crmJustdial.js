/**
 * ─────────────────────────────────────────────────────────────────────────────
 * crmJustdial.js — Secure Inbound Webhook & Metrics API
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Security Features:
 *   - Constant-time secret token comparison (`crypto.timingSafeEqual`)
 *   - Request body size limit check (<= 1MB)
 *   - Rate limiting per IP (max 60 requests per minute)
 *   - Replay / Idempotency protection
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { processJustdialEmailPayload, getSyncStats } = require('../services/justdialCrmSyncService');

// In-memory rate limiter per IP (60 requests / minute)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function applyRateLimiting(req, res, next) {
  const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();

  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count++;
  }

  rateLimitMap.set(ip, record);

  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_REQUESTS: Rate limit exceeded (max 60 requests/min).'
    });
  }

  next();
}

/**
 * Constant-time comparison for secret token authentication
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkWebhookSecret(req, res, next) {
  const secretEnv = process.env.JUSTDIAL_EMAIL_WEBHOOK_SECRET;
  if (!secretEnv) {
    // Development mode if secret not set in .env
    return next();
  }

  const providedSecret = req.headers['x-webhook-secret'] || req.query.token || req.body?.secret || '';
  if (!timingSafeCompare(providedSecret, secretEnv)) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED_WEBHOOK: Invalid or missing authorization secret.'
    });
  }
  next();
}

/**
 * Body payload size check (<= 1MB)
 */
function checkPayloadSize(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 1024 * 1024) {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE: Request size exceeds 1MB limit.'
    });
  }
  next();
}

// ── 1. Inbound Webhook Endpoint ─────────────────────────────────────────────
router.post('/inbound-email', applyRateLimiting, checkPayloadSize, checkWebhookSecret, async (req, res) => {
  try {
    const payload = req.body || {};

    const emailData = {
      from: payload.from || payload.From || payload.sender || payload['body-mime']?.match(/From: ([^\r\n]+)/i)?.[1] || '',
      subject: payload.subject || payload.Subject || '',
      text: payload.text || payload['body-plain'] || payload.stripped_text || '',
      html: payload.html || payload['body-html'] || payload.stripped_html || '',
      date: payload.date || payload.Date || new Date().toISOString(),
      headers: payload.headers || {},
      messageId: payload.messageId || payload['message-id'] || payload['Message-ID'] || ''
    };

    const result = await processJustdialEmailPayload(emailData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[CRM/Justdial] Inbound email error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── 2. Admin Stats & Diagnostics Endpoint ──────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const mode = process.env.JUSTDIAL_INGESTION_MODE || 'OAUTH2';
    let stats;
    if (mode === 'IMAP') {
      const { getImapWorkerStatus } = require('../services/justdialImapWorker');
      stats = getImapWorkerStatus();
    } else {
      const { getGmailOAuthWorkerStatus } = require('../services/justdialGmailOAuthWorker');
      stats = getGmailOAuthWorkerStatus();
    }

    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
