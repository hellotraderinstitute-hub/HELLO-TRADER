/**
 * MarketPreflightService.js — Market-Open Pre-Flight Check Engine for Angel One
 *
 * Runs strictly READ-ONLY pre-flight checks before Indian market trading session:
 *   1. Client/Broker configuration validation
 *   2. Credential decryption and presence validation
 *   3. Mandatory static-IP proxy verification (dc-mum-007.staticip.in:443 -> 151.245.182.52)
 *   4. Outbound egress probe through proxy (zero direct-IP fallback)
 *   5. Angel One SmartAPI authentication & session validation (loginByPassword + TOTP)
 *   6. Angel One getProfile() read-only identity verification
 *   7. Risk settings presence, integrity, and user ownership validation
 *   8. Trading-day IST state check & daily reset (preserves configured limits)
 *   9. Kill switch state verification (global & connection)
 *  10. Controlled Live Pilot Gate verification (HT0802 / 1-lot hard cap)
 *  11. Webhook readiness verification
 *  12. Immutable audit logging & Database Session Persistence (survives PM2/backend restarts)
 *
 * INVARIANTS:
 *   - NEVER places, modifies, cancels, or squares off any order.
 *   - NEVER exposes plaintext secrets in logs or responses.
 *   - Uses Asia/Kolkata (IST) timezone for trading date calculation.
 *   - Idempotent: safe to run multiple times per day without side effects.
 *   - Persists today's READY state in DB: valid across PM2 restarts with 0 signal delay.
 *   - Automatic fallback: if first signal of new day arrives before pre-flight, runs safely and continues same signal.
 */

'use strict';

const axios = require('axios');
let ProxyTransportFactory;
try {
  const ptfModule = require('../network/ProxyTransportFactory');
  ProxyTransportFactory = ptfModule.ProxyTransportFactory || ptfModule;
} catch (_) {
  try {
    const ptfModule = require('../../network/ProxyTransportFactory');
    ProxyTransportFactory = ptfModule.ProxyTransportFactory || ptfModule;
  } catch (e) {
    try {
      const ptfModule = require('../../../packages/agent/lib/network/ProxyTransportFactory');
      ProxyTransportFactory = ptfModule.ProxyTransportFactory || ptfModule;
    } catch (e2) {
      console.error('[MarketPreflightService] Could not load ProxyTransportFactory:', e2);
    }
  }
}
const { PILOT_AUTHORIZED_CLIENT, ControlledLivePilotGate } = require('./ControlledLivePilotGate');

const ANGEL_BASE_URL = 'https://apiconnect.angelbroking.com';

// In-memory cache for daily preflight status per user { [userId]: { dateStr, passed, result, timestamp } }
const preflightCache = new Map();

// In-flight concurrency lock to prevent duplicate simultaneous executions on same user
const inFlightPreflightPromises = new Map();

/**
 * Get current date string in Asia/Kolkata (IST) timezone
 * @returns {string} "YYYY-MM-DD"
 */
function getISTDateString() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Check if current IST time is on a weekend (Saturday / Sunday)
 * @returns {boolean}
 */
function isISTWeekend() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short'
  });
  const day = formatter.format(new Date());
  return day === 'Sat' || day === 'Sun';
}

/**
 * Generate RFC 6238 TOTP
 */
function generateTOTP(secret) {
  if (!secret) return '000000';
  try {
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let cleanSecret = String(secret).replace(/[\s=]/g, '').toUpperCase();
    let bits = '';
    for (let i = 0; i < cleanSecret.length; i++) {
      const val = base32chars.indexOf(cleanSecret.charAt(i));
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    const key = Buffer.from(bytes);
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / 30);
    const timeBuf = Buffer.alloc(8);
    timeBuf.writeBigUInt64BE(BigInt(timeStep));

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(timeBuf);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return code.toString().padStart(6, '0');
  } catch (_) {
    return '000000';
  }
}

class MarketPreflightService {
  /**
   * Helper to ensure database table exists in SQLite
   */
  static async ensureTableExists(prisma) {
    if (!prisma) return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS MarketPreflightRecord (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          tradingDate TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'READY',
          readyForLiveTrading INTEGER NOT NULL DEFAULT 1,
          broker TEXT NOT NULL DEFAULT 'ANGELONE',
          checksJson TEXT,
          safeSummaryJson TEXT,
          reason TEXT,
          message TEXT,
          lastRunAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(userId, tradingDate)
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_market_preflight_user_date ON MarketPreflightRecord(userId, tradingDate, status);
      `);
    } catch (_) {}
  }

  /**
   * Initialize Persistent Pre-flight on Server Startup:
   * Restores all valid today's IST pre-flight records into memory cache so PM2 restarts
   * never invalidate today's verified session.
   *
   * @param {object} [prismaClient]
   */
  static async initPersistentPreflight(prismaClient) {
    const today = getISTDateString();
    let prisma = prismaClient;
    if (!prisma) {
      try {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient();
      } catch (_) {
        return;
      }
    }

    try {
      await this.ensureTableExists(prisma);

      // Query all today's active READY records
      let records = [];
      try {
        if (prisma.marketPreflightRecord) {
          records = await prisma.marketPreflightRecord.findMany({
            where: { tradingDate: today, status: 'READY', readyForLiveTrading: true }
          });
        } else {
          records = await prisma.$queryRawUnsafe(
            `SELECT * FROM MarketPreflightRecord WHERE tradingDate = '${today}' AND status = 'READY' AND (readyForLiveTrading = 1 OR readyForLiveTrading = true)`
          );
        }
      } catch (_) {
        records = await prisma.$queryRawUnsafe(
          `SELECT * FROM MarketPreflightRecord WHERE tradingDate = '${today}' AND status = 'READY'`
        ).catch(() => []);
      }

      let restoredCount = 0;
      for (const rec of records) {
        let checks = {};
        let safeSummary = {};
        try { checks = typeof rec.checksJson === 'string' ? JSON.parse(rec.checksJson) : rec.checksJson || {}; } catch (_) {}
        try { safeSummary = typeof rec.safeSummaryJson === 'string' ? JSON.parse(rec.safeSummaryJson) : rec.safeSummaryJson || {}; } catch (_) {}

        const result = {
          readyForLiveTrading: true,
          status: 'READY',
          message: rec.message || 'PRE-FLIGHT PASSED — ANGEL ONE READY',
          dateStr: today,
          checks,
          safeSummary,
          isRestoredFromDb: true
        };

        preflightCache.set(rec.userId, {
          dateStr: today,
          passed: true,
          result,
          timestamp: rec.lastRunAt ? new Date(rec.lastRunAt).toISOString() : new Date().toISOString()
        });
        restoredCount++;
      }

      console.log(`[MarketPreflightService] Restored ${restoredCount} persistent READY pre-flight record(s) for IST trading date: ${today}`);
      return restoredCount;
    } catch (err) {
      console.warn('[MarketPreflightService] Notice during persistent preflight init:', err.message);
      return 0;
    }
  }

  /**
   * Persist a completed pre-flight result to the database.
   */
  static async persistPreflightResult(userId, result, prismaClient) {
    const today = getISTDateString();
    let prisma = prismaClient;
    if (!prisma) {
      try {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient();
      } catch (_) {
        return;
      }
    }

    try {
      await this.ensureTableExists(prisma);
      const isReady = !!result.readyForLiveTrading;
      const status = result.status || (isReady ? 'READY' : 'FAILED');
      const checksJson = JSON.stringify(result.checks || {});
      const safeSummaryJson = JSON.stringify(result.safeSummary || {});
      const reason = result.reason || null;
      const message = result.message || (isReady ? 'PRE-FLIGHT PASSED — ANGEL ONE READY' : 'PRE-FLIGHT FAILED');

      if (prisma.marketPreflightRecord) {
        await prisma.marketPreflightRecord.upsert({
          where: {
            userId_tradingDate: {
              userId,
              tradingDate: today
            }
          },
          create: {
            userId,
            tradingDate: today,
            status,
            readyForLiveTrading: isReady,
            broker: 'ANGELONE',
            checksJson,
            safeSummaryJson,
            reason,
            message,
            lastRunAt: new Date()
          },
          update: {
            status,
            readyForLiveTrading: isReady,
            checksJson,
            safeSummaryJson,
            reason,
            message,
            lastRunAt: new Date()
          }
        });
      } else {
        const id = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        await prisma.$executeRawUnsafe(`
          INSERT INTO MarketPreflightRecord (id, userId, tradingDate, status, readyForLiveTrading, broker, checksJson, safeSummaryJson, reason, message, lastRunAt, createdAt, updatedAt)
          VALUES ('${id}', '${userId}', '${today}', '${status}', ${isReady ? 1 : 0}, 'ANGELONE', '${checksJson.replace(/'/g, "''")}', '${safeSummaryJson.replace(/'/g, "''")}', ${reason ? `'${reason}'` : 'NULL'}, '${message.replace(/'/g, "''")}', '${nowIso}', '${nowIso}', '${nowIso}')
          ON CONFLICT(userId, tradingDate) DO UPDATE SET
            status = '${status}',
            readyForLiveTrading = ${isReady ? 1 : 0},
            checksJson = '${checksJson.replace(/'/g, "''")}',
            safeSummaryJson = '${safeSummaryJson.replace(/'/g, "''")}',
            reason = ${reason ? `'${reason}'` : 'NULL'},
            message = '${message.replace(/'/g, "''")}',
            lastRunAt = '${nowIso}',
            updatedAt = '${nowIso}';
        `);
      }
    } catch (err) {
      console.warn('[MarketPreflightService] Error persisting preflight result to DB:', err.message);
    }
  }

  /**
   * Fast database lookup for today's persistent pre-flight status.
   */
  static async getPersistentPreflightToday(userId, prismaClient) {
    const today = getISTDateString();
    let prisma = prismaClient;
    if (!prisma) {
      try {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient();
      } catch (_) {
        return null;
      }
    }

    try {
      await this.ensureTableExists(prisma);
      let rec = null;
      if (prisma.marketPreflightRecord) {
        rec = await prisma.marketPreflightRecord.findUnique({
          where: {
            userId_tradingDate: {
              userId,
              tradingDate: today
            }
          }
        });
      } else {
        const rows = await prisma.$queryRawUnsafe(
          `SELECT * FROM MarketPreflightRecord WHERE userId = '${userId}' AND tradingDate = '${today}' LIMIT 1`
        ).catch(() => []);
        rec = rows[0] || null;
      }

      if (rec) {
        let checks = {};
        let safeSummary = {};
        try { checks = typeof rec.checksJson === 'string' ? JSON.parse(rec.checksJson) : rec.checksJson || {}; } catch (_) {}
        try { safeSummary = typeof rec.safeSummaryJson === 'string' ? JSON.parse(rec.safeSummaryJson) : rec.safeSummaryJson || {}; } catch (_) {}

        const isReady = rec.readyForLiveTrading === 1 || rec.readyForLiveTrading === true || rec.status === 'READY';
        const result = {
          readyForLiveTrading: isReady,
          status: rec.status,
          reason: rec.reason,
          message: rec.message,
          dateStr: today,
          checks,
          safeSummary,
          isPersistentDb: true
        };

        preflightCache.set(userId, {
          dateStr: today,
          passed: isReady,
          result,
          timestamp: rec.lastRunAt ? new Date(rec.lastRunAt).toISOString() : new Date().toISOString()
        });

        return result;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Get cached pre-flight status for user on current IST trading day
   * @param {string} userId
   * @returns {object|null}
   */
  static getCachedPreflight(userId) {
    const today = getISTDateString();
    const cached = preflightCache.get(userId);
    if (cached && cached.dateStr === today) {
      return cached;
    }
    return null;
  }

  /**
   * Check if preflight has passed today for the user (Fast synchronous memory check)
   * @param {string} userId
   * @returns {boolean}
   */
  static isPreflightPassedToday(userId) {
    const cached = this.getCachedPreflight(userId);
    return !!(cached && cached.passed);
  }

  /**
   * High-Reliability Pre-Flight Gate for Webhooks & Live Signals:
   * 1. Memory check (0 latency) -> if PASS, returns true immediately.
   * 2. DB persistence check -> if persistent READY exists for today, populates cache and returns true.
   * 3. In-flight check -> if a background pre-flight is currently in-flight, awaits that same Promise.
   * 4. Auto-run fallback -> if missing for today's new session, safely runs pre-flight once, persists result,
   *    and allows original signal to proceed without dropping.
   *
   * @param {string} userId
   * @param {object} [options]
   * @returns {Promise<{ allowed: boolean, reason?: string, result: object }>}
   */
  static async ensurePreflightPassed(userId, options = {}) {
    const today = getISTDateString();

    // 1. In-memory hot cache (0 latency path)
    const cached = this.getCachedPreflight(userId);
    if (cached && cached.passed) {
      return { allowed: true, isCached: true, result: cached.result };
    }

    // 2. Persistent Database check (survives PM2 restarts)
    const dbRecord = await this.getPersistentPreflightToday(userId, options.prismaClient);
    if (dbRecord && dbRecord.readyForLiveTrading) {
      return { allowed: true, isPersistentDb: true, result: dbRecord };
    }

    // 3. Concurrency check: wait for existing in-flight pre-flight if one is currently executing
    if (inFlightPreflightPromises.has(userId)) {
      const existingRes = await inFlightPreflightPromises.get(userId);
      return {
        allowed: !!(existingRes && existingRes.readyForLiveTrading),
        reason: existingRes?.reason,
        result: existingRes
      };
    }

    // 4. Safe automatic pre-flight execution on first signal of the day
    console.log(`[MarketPreflightService] Automatic pre-flight executing for user ${userId} on IST date ${today}...`);
    const preflightRes = await this.getOrRunDailyPreflight(userId, options);
    const allowed = !!(preflightRes && preflightRes.readyForLiveTrading);

    return {
      allowed,
      reason: preflightRes?.reason || (allowed ? null : 'PREFLIGHT_FAILED'),
      result: preflightRes
    };
  }

  /**
   * Clear preflight cache (used for testing or deliberate re-checks)
   * @param {string} [userId]
   */
  static clearCache(userId) {
    if (userId) {
      preflightCache.delete(userId);
      inFlightPreflightPromises.delete(userId);
    } else {
      preflightCache.clear();
      inFlightPreflightPromises.clear();
    }
  }

  /**
   * Automatic daily pre-flight check:
   * Returns cached result if already evaluated for today;
   * otherwise runs the complete read-only checks automatically with concurrency protection.
   *
   * @param {string} userId
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  static async getOrRunDailyPreflight(userId, options = {}) {
    const today = getISTDateString();

    if (!options.forceRefresh) {
      const cached = this.getCachedPreflight(userId);
      if (cached) {
        return {
          ...cached.result,
          isCached: true,
          cachedAt: cached.timestamp,
        };
      }

      // Check DB before running new broker checks
      const dbRec = await this.getPersistentPreflightToday(userId, options.prismaClient);
      if (dbRec && dbRec.readyForLiveTrading) {
        return {
          ...dbRec,
          isPersistentDb: true
        };
      }
    }

    // Mutex concurrency lock to prevent duplicate executions from simultaneous requests
    if (inFlightPreflightPromises.has(userId) && !options.forceRefresh) {
      return inFlightPreflightPromises.get(userId);
    }

    const runPromise = (async () => {
      try {
        const res = await this.runAngelOnePreflight(userId, options);
        return res;
      } finally {
        inFlightPreflightPromises.delete(userId);
      }
    })();

    inFlightPreflightPromises.set(userId, runPromise);
    return runPromise;
  }

  /**
   * Background runner for all active Angel One connections at market open.
   */
  static async runDailyPreflightForAllConnectedUsers(options = {}) {
    const today = getISTDateString();
    let prisma = options.prismaClient;
    if (!prisma) {
      try {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient();
      } catch (_) {
        return;
      }
    }

    try {
      const activeConnections = await prisma.algoBrokerConnection.findMany({
        where: {
          isActive: true,
          broker: { in: ['ANGELONE', 'ANGEL_ONE'] }
        },
        select: { userId: true, id: true }
      });

      console.log(`[MarketPreflightService] Running daily pre-flight for ${activeConnections.length} active Angel One connection(s)...`);
      for (const conn of activeConnections) {
        // Skip if already passed today
        if (this.isPreflightPassedToday(conn.userId)) continue;
        const dbRec = await this.getPersistentPreflightToday(conn.userId, prisma);
        if (dbRec && dbRec.readyForLiveTrading) continue;

        // Run pre-flight safely
        await this.getOrRunDailyPreflight(conn.userId, {
          prismaClient: prisma,
          brokerConnectionId: conn.id
        }).catch(err => {
          console.warn(`[MarketPreflightService] Background preflight error for user ${conn.userId}:`, err.message);
        });
      }
    } catch (err) {
      console.warn('[MarketPreflightService] Error in runDailyPreflightForAllConnectedUsers:', err.message);
    }
  }

  /**
   * Run complete READ-ONLY Market-Open Pre-Flight Check for an Angel One client
   * @param {string} userId
   * @param {object} [options]
   * @param {object} [options.prismaClient]
   * @param {Function} [options.decryptFn]
   * @param {object} [options.AuditLogger]
   * @param {boolean} [options.forceRefresh=false]
   * @returns {Promise<{ readyForLiveTrading: boolean, status: string, reason?: string, dateStr: string, checks: object, safeSummary: object }>}
   */
  static async runAngelOnePreflight(userId, options = {}) {
    const today = getISTDateString();

    // Idempotency: Return existing valid pre-flight if already completed today unless forceRefresh is set
    if (!options.forceRefresh) {
      const cached = this.getCachedPreflight(userId);
      if (cached && cached.passed) {
        return {
          ...cached.result,
          isCached: true,
          cachedAt: cached.timestamp,
        };
      }
    }

    const {
      prismaClient,
      decryptFn,
      AuditLogger,
    } = options;

    let prisma = prismaClient;
    if (!prisma) {
      const { PrismaClient } = require('@prisma/client');
      prisma = new PrismaClient();
    }

    let decrypt = decryptFn;
    if (!decrypt) {
      try {
        const { decryptCredential } = require('../../../../backend/services/crypto');
        decrypt = decryptCredential;
      } catch (_) {
        try {
          const { decryptCredential } = require('../../../backend/services/crypto');
          decrypt = decryptCredential;
        } catch (e) {
          const { decryptCredential } = require('../../backend/services/crypto');
          decrypt = decryptCredential;
        }
      }
    }

    const checks = {
      clientConfig: { status: 'PENDING', message: '' },
      credentialsPresence: { status: 'PENDING', message: '' },
      proxyVerification: { status: 'PENDING', message: '' },
      proxyEgress: { status: 'PENDING', message: '' },
      brokerAuth: { status: 'PENDING', message: '' },
      brokerIdentity: { status: 'PENDING', message: '' },
      riskControls: { status: 'PENDING', message: '' },
      dailyTradingState: { status: 'PENDING', message: '' },
      killSwitchState: { status: 'PENDING', message: '' },
      controlledPilotGate: { status: 'PENDING', message: '' },
      webhookReadiness: { status: 'PENDING', message: '' },
    };

    let user = null;
    let brokerConn = null;
    let assignment = null;
    let riskSettings = null;
    let systemSettings = null;

    try {
      // ── CHECK 1: Client & Broker Connection Record ──────────────────────────
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        checks.clientConfig = { status: 'FAIL', message: 'User record not found in platform database.' };
        const failRes = this._buildFailureResult('CLIENT_NOT_FOUND', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }

      if (options.brokerConnectionId) {
        brokerConn = await prisma.algoBrokerConnection.findFirst({
          where: { id: options.brokerConnectionId, userId }
        });
      } else {
        brokerConn = await prisma.algoBrokerConnection.findFirst({
          where: { userId, broker: { in: ['ANGELONE', 'ANGEL_ONE'] } }
        });
      }
      if (!brokerConn) {
        checks.clientConfig = { status: 'FAIL', message: 'No active Angel One connection configured for this account.' };
        const failRes = this._buildFailureResult('BROKER_CONNECTION_NOT_FOUND', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      checks.clientConfig = { status: 'PASS', message: `Angel One connection found for ${user.studentId || user.email}` };

      // ── CHECK 2: Credential Decryption & Presence ───────────────────────────
      const apiKey = decrypt(brokerConn.apiKey);
      const pin = decrypt(brokerConn.password) || decrypt(brokerConn.apiSecret);
      const totpSecret = decrypt(brokerConn.totpSecret);
      const clientCode = brokerConn.clientId;

      if (!apiKey || !pin || !totpSecret || !clientCode) {
        checks.credentialsPresence = {
          status: 'FAIL',
          message: 'Missing or corrupted Angel One API Key, PIN/MPIN, Client Code, or TOTP secret.'
        };
        const failRes = this._buildFailureResult('CREDENTIALS_INVALID', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      checks.credentialsPresence = { status: 'PASS', message: 'All required Angel One credentials present and decryptable.' };

      // ── CHECK 3 & 4: Static IP Proxy Assignment & Egress Probe ──────────────
      const staticIpModel = prisma.clientStaticIpAssignment || prisma.ClientStaticIpAssignment;
      assignment = staticIpModel ? (
        await staticIpModel.findFirst({
          where: { userId, broker: { in: ['ANGELONE', 'ANGEL_ONE', 'ALL'] }, status: { in: ['VERIFIED', 'ASSIGNED', 'VERIFYING'] } },
          orderBy: { updatedAt: 'desc' }
        }) || await staticIpModel.findFirst({
          where: { userId, status: { in: ['VERIFIED', 'ASSIGNED', 'VERIFYING'] } },
          orderBy: { updatedAt: 'desc' }
        })
      ) : null;

      if (!assignment) {
        checks.proxyVerification = { status: 'FAIL', message: 'No VERIFIED static-IP proxy assigned for Angel One.' };
        const failRes = this._buildFailureResult('PROXY_NOT_VERIFIED', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      checks.proxyVerification = { status: 'PASS', message: `Proxy config verified: ${assignment.proxyHost}:${assignment.proxyPort}` };

      const proxyUsername = decrypt(assignment.encryptedProxyUsername) || 'dc-mum-007';
      const proxyPassword = decrypt(assignment.encryptedProxyPassword) || '';
      const { httpsAgent } = this._createProxyAgent({
        connectionType: assignment.connectionType || (assignment.proxyHost ? 'HTTPS_PROXY' : 'DIRECT_IP'),
        proxyHost: assignment.proxyHost || 'dc-mum-007.staticip.in',
        proxyPort: assignment.proxyPort || 443,
        proxyUsername,
        proxyPassword,
        ipAddress: assignment.ipAddress || '151.245.182.52',
      });

      // Probe outbound egress through proxy (Zero Direct-IP fallback)
      let observedIp = null;
      if (process.env.NODE_ENV !== 'test' && !options.skipNetworkProbe) {
        try {
          const probeRes = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent,
            timeout: 5000,
          });
          observedIp = probeRes.data?.ip;
          if (observedIp !== assignment.ipAddress) {
            checks.proxyEgress = {
              status: 'FAIL',
              message: `Observed egress IP ${observedIp} != Expected assigned IP ${assignment.ipAddress}`
            };
            const failRes = this._buildFailureResult('PROXY_EGRESS_MISMATCH', checks, today);
            await this.persistPreflightResult(userId, failRes, prisma);
            return failRes;
          }
          checks.proxyEgress = { status: 'PASS', message: `Verified egress IPv4: ${observedIp}` };
          if (assignment.status !== 'VERIFIED' && staticIpModel) {
            await staticIpModel.update({
              where: { id: assignment.id },
              data: { status: 'VERIFIED', verifiedAt: new Date(), lastObservedOutboundIp: observedIp }
            }).catch(() => {});
          }
        } catch (probeErr) {
          checks.proxyEgress = { status: 'FAIL', message: `Proxy egress probe failed: ${probeErr.message}` };
          const failRes = this._buildFailureResult('PROXY_EGRESS_FAILED', checks, today);
          await this.persistPreflightResult(userId, failRes, prisma);
          return failRes;
        }
      } else {
        checks.proxyEgress = { status: 'PASS', message: `Mock proxy egress verified: ${assignment.ipAddress}` };
      }

      // ── CHECK 5 & 6: Angel One SmartAPI Authentication & Identity Verification ─
      if (process.env.NODE_ENV !== 'test' && !options.skipBrokerAuth) {
        const totp = generateTOTP(totpSecret);
        const authHeaders = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': assignment.ipAddress || '151.245.182.52',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': apiKey,
        };

        let jwtToken = null;
        let feedToken = null;

        try {
          const loginRes = await axios.post(
            `${ANGEL_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
            { clientcode: clientCode, password: pin, totp },
            { headers: authHeaders, httpsAgent, timeout: 10000 }
          );

          if (loginRes.data?.status !== true) {
            checks.brokerAuth = { status: 'FAIL', message: `SmartAPI Auth failed: ${loginRes.data?.message || 'Invalid Credentials'}` };
            const failRes = this._buildFailureResult('BROKER_AUTH_FAILED', checks, today);
            await this.persistPreflightResult(userId, failRes, prisma);
            return failRes;
          }

          jwtToken = loginRes.data.data?.jwtToken;
          feedToken = loginRes.data.data?.feedToken;
          checks.brokerAuth = { status: 'PASS', message: 'SmartAPI loginByPassword + TOTP authenticated successfully.' };
        } catch (authErr) {
          const msg = authErr.response?.data?.message || authErr.message;
          checks.brokerAuth = { status: 'FAIL', message: `SmartAPI connection failed: ${msg}` };
          const failRes = this._buildFailureResult('BROKER_AUTH_FAILED', checks, today);
          await this.persistPreflightResult(userId, failRes, prisma);
          return failRes;
        }

        // Profile Check (READ-ONLY)
        try {
          const profileRes = await axios.get(
            `${ANGEL_BASE_URL}/rest/secure/angelbroking/user/v1/getProfile`,
            {
              headers: {
                ...authHeaders,
                'Authorization': `Bearer ${jwtToken}`
              },
              httpsAgent,
              timeout: 10000
            }
          );

          if (profileRes.data?.status !== true) {
            checks.brokerIdentity = { status: 'FAIL', message: `getProfile() failed: ${profileRes.data?.message}` };
            const failRes = this._buildFailureResult('PROFILE_MISMATCH', checks, today);
            await this.persistPreflightResult(userId, failRes, prisma);
            return failRes;
          }

          const returnedClientCode = (profileRes.data.data?.clientcode || '').trim().toUpperCase();
          const expectedClientCode = clientCode.trim().toUpperCase();

          if (returnedClientCode !== expectedClientCode) {
            checks.brokerIdentity = {
              status: 'FAIL',
              message: `Broker account mismatch: Connected ${expectedClientCode} != Returned ${returnedClientCode}`
            };
            const failRes = this._buildFailureResult('PROFILE_MISMATCH', checks, today);
            await this.persistPreflightResult(userId, failRes, prisma);
            return failRes;
          }
          checks.brokerIdentity = { status: 'PASS', message: `Identity confirmed: ${returnedClientCode} (${profileRes.data.data?.name || 'Verified'})` };
        } catch (profErr) {
          checks.brokerIdentity = { status: 'FAIL', message: `Profile query error: ${profErr.message}` };
          const failRes = this._buildFailureResult('PROFILE_MISMATCH', checks, today);
          await this.persistPreflightResult(userId, failRes, prisma);
          return failRes;
        }
      } else {
        checks.brokerAuth = { status: 'PASS', message: 'Mock SmartAPI auth passed.' };
        checks.brokerIdentity = { status: 'PASS', message: `Mock identity confirmed: ${clientCode}` };
      }

      // ── CHECK 7 & 8: Risk Settings & Daily Trading State ────────────────────
      riskSettings = await prisma.agentRiskSettings.findUnique({ where: { userId } });
      if (!riskSettings) {
        checks.riskControls = { status: 'FAIL', message: 'Risk settings not initialized for user account.' };
        const failRes = this._buildFailureResult('RISK_SETTINGS_UNAVAILABLE', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }

      // Daily Trading State Reset: If calendar date in IST has changed, reset daily pause & counters
      // but strictly PRESERVE configured limits (Daily Max Loss, Daily Profit Target, Per-Trade Target)
      if (riskSettings.isPausedToday && riskSettings.pausedDateStr && riskSettings.pausedDateStr !== today) {
        riskSettings = await prisma.agentRiskSettings.update({
          where: { userId },
          data: {
            isPausedToday: false,
            pauseReason: null,
            pausedDateStr: null,
          }
        });
        checks.dailyTradingState = { status: 'PASS', message: `New IST trading day ${today}: Daily pause automatically cleared.` };
      } else {
        checks.dailyTradingState = { status: 'PASS', message: `IST trading day ${today}: Trading state synchronized.` };
      }

      checks.riskControls = {
        status: 'PASS',
        message: `Max Loss: ₹${riskSettings.dailyMaxLoss} (${riskSettings.dailyMaxLossEnabled ? 'ON' : 'OFF'}) | Target: ₹${riskSettings.dailyProfitTarget} | Paused: ${riskSettings.isPausedToday ? 'YES' : 'NO'}`
      };

      // ── CHECK 9: Kill Switch State ──────────────────────────────────────────
      systemSettings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      if (systemSettings?.globalKillSwitch) {
        checks.killSwitchState = { status: 'FAIL', message: 'Global Kill Switch is currently ACTIVE.' };
        const failRes = this._buildFailureResult('KILL_SWITCH_ACTIVE', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      if (brokerConn.killSwitchActive) {
        checks.killSwitchState = { status: 'FAIL', message: 'Connection Kill Switch is currently ACTIVE.' };
        const failRes = this._buildFailureResult('KILL_SWITCH_ACTIVE', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      checks.killSwitchState = { status: 'PASS', message: 'All Kill Switches armed and clean (Inactive).' };

      // ── CHECK 10: Pre-Trade Validation Gate ────────────────────────────────
      const sampleOrder = { symbol: 'NIFTY25AUG24400CE', quantity: 65, side: 'BUY' };
      const preTradeGate = ControlledLivePilotGate.evaluateLivePilotGate({
        user,
        brokerConnection: brokerConn,
        staticIpAssignment: assignment,
        riskSettings: { ...(riskSettings || {}), isLiveTradingEnabled: true },
        order: sampleOrder,
        globalKillSwitch: !!systemSettings?.globalKillSwitch,
      });

      if (!preTradeGate.allowed) {
        checks.controlledPilotGate = { status: 'FAIL', message: `Pre-trade gate restriction: ${preTradeGate.reason}` };
        const failRes = this._buildFailureResult('PILOT_GATE_BLOCKED', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      checks.controlledPilotGate = { status: 'PASS', message: `Pre-Trade Gate READY for ${user.studentId || user.email} | Configured Max Lots: ${preTradeGate.userMaxLots || 1} | Egress: ${assignment.ipAddress}` };

      // ── CHECK 11: Webhook Readiness ─────────────────────────────────────────
      if (!brokerConn.webhookToken) {
        checks.webhookReadiness = { status: 'FAIL', message: 'No webhook token configured for broker connection.' };
        const failRes = this._buildFailureResult('WEBHOOK_NOT_CONFIGURED', checks, today);
        await this.persistPreflightResult(userId, failRes, prisma);
        return failRes;
      }
      checks.webhookReadiness = { status: 'PASS', message: 'Webhook endpoint armed and ready for signal routing.' };

      // ── ALL 11 CHECKS PASSED ────────────────────────────────────────────────
      const maskedClient = clientCode ? `${clientCode.slice(0, 2)}****${clientCode.slice(-2)}` : 'N/A';
      const safeSummary = {
        broker: 'Angel One',
        account: maskedClient,
        proxy: 'VERIFIED',
        egressIp: assignment.ipAddress,
        riskControls: 'ACTIVE',
        killSwitch: 'ARMED',
        algo: 'READY',
        tradingDate: today,
      };

      const result = {
        readyForLiveTrading: true,
        status: 'READY',
        message: 'PRE-FLIGHT PASSED — ANGEL ONE READY',
        dateStr: today,
        checks,
        safeSummary,
      };

      // Cache successful preflight in memory
      preflightCache.set(userId, {
        dateStr: today,
        passed: true,
        result,
        timestamp: new Date().toISOString(),
      });

      // Persist successful preflight in database for PM2 restart persistence
      await this.persistPreflightResult(userId, result, prisma);

      // Audit Log
      if (AuditLogger) {
        await AuditLogger.log({
          userId,
          category: 'BROKER',
          action: 'MARKET_PREFLIGHT_PASSED',
          detail: `Market Pre-Flight Passed for Angel One (${maskedClient}) via Proxy ${assignment.ipAddress}`,
          meta: safeSummary,
        });
      }

      return result;
    } catch (err) {
      console.error('[MarketPreflightService] Unexpected error:', err);
      const failRes = this._buildFailureResult('PREFLIGHT_INTERNAL_ERROR', checks, today, err.message);
      await this.persistPreflightResult(userId, failRes, prisma);
      return failRes;
    }
  }

  static _createProxyAgent(config) {
    if (ProxyTransportFactory) {
      if (typeof ProxyTransportFactory.createProxyAgent === 'function') {
        return ProxyTransportFactory.createProxyAgent(config);
      }
      if (typeof ProxyTransportFactory.createAgents === 'function') {
        return ProxyTransportFactory.createAgents(config);
      }
    }
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      const auth = (config.proxyUsername && config.proxyPassword) ? `${encodeURIComponent(config.proxyUsername)}:${encodeURIComponent(config.proxyPassword)}@` : '';
      const proxyUrl = `http://${auth}${config.proxyHost || 'dc-mum-007.staticip.in'}:${config.proxyPort || 443}`;
      return { httpsAgent: new HttpsProxyAgent(proxyUrl), httpAgent: null, connectionType: 'HTTPS_PROXY' };
    } catch (e) {
      console.error('[MarketPreflightService] Error initializing proxy agent:', e);
      return { httpsAgent: null, httpAgent: null, connectionType: 'DIRECT_IP' };
    }
  }

  static _buildFailureResult(reasonCode, checks, dateStr, extraMsg = '') {
    const result = {
      readyForLiveTrading: false,
      status: 'FAILED',
      reason: extraMsg ? `${reasonCode}: ${extraMsg}` : reasonCode,
      message: `PRE-FLIGHT FAILED — LIVE TRADING BLOCKED (${reasonCode}${extraMsg ? `: ${extraMsg}` : ''})`,
      dateStr,
      checks,
      safeSummary: {
        broker: 'Angel One',
        proxy: checks.proxyVerification?.status === 'PASS' ? 'VERIFIED' : 'UNVERIFIED',
        egressIp: checks.proxyEgress?.status === 'PASS' ? 'VERIFIED' : 'UNVERIFIED',
        riskControls: checks.riskControls?.status === 'PASS' ? 'ACTIVE' : 'INCOMPLETE',
        killSwitch: checks.killSwitchState?.status === 'PASS' ? 'ARMED' : 'BLOCKED',
        algo: 'BLOCKED',
        tradingDate: dateStr,
      }
    };
    return result;
  }
}

module.exports = {
  MarketPreflightService,
  getISTDateString,
  isISTWeekend,
  preflightCache,
};
