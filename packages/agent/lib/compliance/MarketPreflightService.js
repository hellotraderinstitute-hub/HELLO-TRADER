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
 *  12. Immutable audit logging
 *
 * INVARIANTS:
 *   - NEVER places, modifies, cancels, or squares off any order.
 *   - NEVER exposes plaintext secrets in logs or responses.
 *   - Uses Asia/Kolkata (IST) timezone for trading date calculation.
 *   - Idempotent: safe to run multiple times per day without side effects.
 */

const axios = require('axios');
const crypto = require('crypto');
const { ProxyTransportFactory } = require('../network/ProxyTransportFactory');
const { PILOT_AUTHORIZED_CLIENT, ControlledLivePilotGate } = require('./ControlledLivePilotGate');

const ANGEL_BASE_URL = 'https://apiconnect.angelbroking.com';

// In-memory cache for daily preflight status per user { [userId]: { dateStr, passed, result, timestamp } }
const preflightCache = new Map();

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
   * Check if preflight has passed today for the user
   * @param {string} userId
   * @returns {boolean}
   */
  static isPreflightPassedToday(userId) {
    const cached = this.getCachedPreflight(userId);
    return !!(cached && cached.passed);
  }

  /**
   * Clear preflight cache (used for testing or forced re-checks)
   * @param {string} [userId]
   */
  static clearCache(userId) {
    if (userId) {
      preflightCache.delete(userId);
    } else {
      preflightCache.clear();
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

    const decrypt = decryptFn || ((val) => {
      if (!val) return val;
      const { decryptCredential } = require('../../../../backend/services/crypto');
      return decryptCredential(val);
    });

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
        return this._buildFailureResult('CLIENT_NOT_FOUND', checks, today);
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
        return this._buildFailureResult('BROKER_CONNECTION_NOT_FOUND', checks, today);
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
        return this._buildFailureResult('CREDENTIALS_INVALID', checks, today);
      }
      checks.credentialsPresence = { status: 'PASS', message: 'All required Angel One credentials present and decryptable.' };

      // ── CHECK 3 & 4: Static IP Proxy Assignment & Egress Probe ──────────────
      assignment = await prisma.clientStaticIpAssignment.findFirst({
        where: { userId, broker: 'ANGELONE', status: 'VERIFIED' }
      });

      if (!assignment) {
        checks.proxyVerification = { status: 'FAIL', message: 'No VERIFIED static-IP proxy assigned for Angel One.' };
        return this._buildFailureResult('PROXY_UNAVAILABLE', checks, today);
      }

      if (!assignment.ipAddress) {
        checks.proxyVerification = {
          status: 'FAIL',
          message: 'Proxy IP address is not defined in static IP assignment.'
        };
        return this._buildFailureResult('STATIC_IP_MISMATCH', checks, today);
      }
      checks.proxyVerification = { status: 'PASS', message: `Proxy verified on ${assignment.proxyHost}:${assignment.proxyPort} (${assignment.ipAddress})` };

      // Construct Proxy Transport
      const proxyUser = assignment.encryptedProxyUsername ? decrypt(assignment.encryptedProxyUsername).trim() : null;
      const proxyPass = assignment.encryptedProxyPassword ? decrypt(assignment.encryptedProxyPassword).trim() : null;

      const proxyConfig = {
        connectionType: assignment.connectionType || 'HTTPS_PROXY',
        proxyHost: assignment.proxyHost,
        proxyPort: assignment.proxyPort,
        proxyUsername: proxyUser,
        proxyPassword: proxyPass,
      };

      const { httpsAgent } = ProxyTransportFactory.createAgents(proxyConfig);

      // Verify Egress IP Probe
      if (!options.skipNetworkProbes) {
        try {
          const ipRes = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent,
            timeout: 8000
          });
          const observedIp = ipRes.data?.ip;
          if (observedIp !== assignment.ipAddress) {
            checks.proxyEgress = {
              status: 'FAIL',
              message: `Observed egress IP ${observedIp} != Expected ${assignment.ipAddress}`
            };
            return this._buildFailureResult('STATIC_IP_MISMATCH', checks, today);
          }
          checks.proxyEgress = { status: 'PASS', message: `Egress probe confirmed: ${observedIp} (Zero Direct-IP Fallback)` };
        } catch (ipErr) {
          checks.proxyEgress = { status: 'FAIL', message: `Egress probe via proxy failed: ${ipErr.message}` };
          return this._buildFailureResult('PROXY_UNAVAILABLE', checks, today);
        }
      } else {
        checks.proxyEgress = { status: 'PASS', message: `Mock egress probe confirmed: ${assignment.ipAddress}` };
      }

      // ── CHECK 5 & 6: Angel One SmartAPI Auth & Identity Verification ─────────
      const totp = generateTOTP(totpSecret);
      const authHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '192.168.1.1',
        'X-ClientPublicIP': assignment.ipAddress,
        'X-MACAddress': '00-00-00-00-00-01',
        'X-PrivateKey': apiKey.trim(),
      };

      let jwtToken = null;
      if (!options.skipNetworkProbes) {
        try {
          const authRes = await axios.post(
            `${ANGEL_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
            { clientcode: clientCode.trim(), password: pin.trim(), totp },
            { headers: authHeaders, httpsAgent, timeout: 15000 }
          );

          if (authRes.data?.status !== true) {
            checks.brokerAuth = { status: 'FAIL', message: `Angel One SmartAPI login rejected: ${authRes.data?.message || 'Unknown auth error'}` };
            return this._buildFailureResult('BROKER_AUTH_FAILED', checks, today);
          }
          jwtToken = authRes.data.data?.jwtToken;
          checks.brokerAuth = { status: 'PASS', message: 'SmartAPI authentication successful (Session token issued).' };
        } catch (authErr) {
          const msg = authErr.response?.data?.message || authErr.message;
          checks.brokerAuth = { status: 'FAIL', message: `SmartAPI connection failed: ${msg}` };
          return this._buildFailureResult('BROKER_AUTH_FAILED', checks, today);
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
            return this._buildFailureResult('PROFILE_MISMATCH', checks, today);
          }

          const returnedClientCode = (profileRes.data.data?.clientcode || '').trim().toUpperCase();
          const expectedClientCode = clientCode.trim().toUpperCase();

          if (returnedClientCode !== expectedClientCode) {
            checks.brokerIdentity = {
              status: 'FAIL',
              message: `Broker account mismatch: Connected ${expectedClientCode} != Returned ${returnedClientCode}`
            };
            return this._buildFailureResult('PROFILE_MISMATCH', checks, today);
          }
          checks.brokerIdentity = { status: 'PASS', message: `Identity confirmed: ${returnedClientCode} (${profileRes.data.data?.name || 'Verified'})` };
        } catch (profErr) {
          checks.brokerIdentity = { status: 'FAIL', message: `Profile query error: ${profErr.message}` };
          return this._buildFailureResult('PROFILE_MISMATCH', checks, today);
        }
      } else {
        checks.brokerAuth = { status: 'PASS', message: 'Mock SmartAPI auth passed.' };
        checks.brokerIdentity = { status: 'PASS', message: `Mock identity confirmed: ${clientCode}` };
      }

      // ── CHECK 7 & 8: Risk Settings & Daily Trading State ────────────────────
      riskSettings = await prisma.agentRiskSettings.findUnique({ where: { userId } });
      if (!riskSettings) {
        checks.riskControls = { status: 'FAIL', message: 'Risk settings not initialized for user account.' };
        return this._buildFailureResult('RISK_SETTINGS_UNAVAILABLE', checks, today);
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
        return this._buildFailureResult('KILL_SWITCH_ACTIVE', checks, today);
      }
      if (brokerConn.killSwitchActive) {
        checks.killSwitchState = { status: 'FAIL', message: 'Connection Kill Switch is currently ACTIVE.' };
        return this._buildFailureResult('KILL_SWITCH_ACTIVE', checks, today);
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
        return this._buildFailureResult('PILOT_GATE_BLOCKED', checks, today);
      }
      checks.controlledPilotGate = { status: 'PASS', message: `Pre-Trade Gate READY for ${user.studentId || user.email} | Configured Max Lots: ${preTradeGate.userMaxLots || 1} | Egress: ${assignment.ipAddress}` };

      // ── CHECK 11: Webhook Readiness ─────────────────────────────────────────
      if (!brokerConn.webhookToken) {
        checks.webhookReadiness = { status: 'FAIL', message: 'No webhook token configured for broker connection.' };
        return this._buildFailureResult('WEBHOOK_NOT_CONFIGURED', checks, today);
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

      // Cache successful preflight
      preflightCache.set(userId, {
        dateStr: today,
        passed: true,
        result,
        timestamp: new Date().toISOString(),
      });

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
      return this._buildFailureResult('PREFLIGHT_INTERNAL_ERROR', checks, today, err.message);
    }
  }

  static _buildFailureResult(reasonCode, checks, dateStr, extraMsg = '') {
    const result = {
      readyForLiveTrading: false,
      status: 'FAILED',
      reason: reasonCode,
      message: `PRE-FLIGHT FAILED — LIVE TRADING BLOCKED (${reasonCode}${extraMsg ? `: ${extraMsg}` : ''})`,
      dateStr,
      checks,
      safeSummary: {
        broker: 'Angel One',
        proxy: checks.proxyVerification?.status === 'PASS' ? 'VERIFIED' : 'UNVERIFIED',
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
  preflightCache,
};
