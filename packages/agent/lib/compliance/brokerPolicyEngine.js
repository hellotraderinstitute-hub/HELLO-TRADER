/**
 * brokerPolicyEngine.js — Pre-Execution Broker Compliance & Routing Policy Layer
 *
 * Enforces broker-specific regulatory policies, rate limiting, session lifecycles,
 * static-IP identity, and order-type constraints BEFORE any request can touch a broker adapter.
 */

const axios = require('axios');

// Broker Readiness Classifications
const BROKER_READINESS = {
  DHAN: {
    status: 'READY_FOR_STATIC_IP_TESTING',
    liveAllowed: false, // Gated by global feature flag
    requiresStaticIp: true,
    tokenType: '24H_JWT',
    sessionExpiryHours: 24,
    maxOrdersPerSec: 10,
    allowedOrderTypes: ['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_MARKET'],
    allowedProductTypes: ['INTRADAY', 'CNC', 'MARGIN'],
    allowedExchanges: ['NSE_EQ', 'NSE_FNO', 'BSE_EQ', 'MCX_COMM'],
  },
  ANGELONE: {
    status: 'REQUIRES_DAILY_TOTP_SESSION',
    liveAllowed: false,
    requiresStaticIp: true,
    tokenType: 'DAILY_JWT_TOTP',
    sessionExpiryHours: 18, // Expires at midnight IST
    maxOrdersPerSec: 10,
    allowedOrderTypes: ['MARKET', 'LIMIT', 'STOPLOSS_LIMIT', 'STOPLOSS_MARKET'],
    allowedProductTypes: ['DELIVERY', 'CARRYFORWARD', 'INTRADAY', 'BO', 'CO'],
    allowedExchanges: ['NSE', 'NFO', 'BSE', 'MCX'],
  },
  GOPOCKET: {
    status: 'BLOCKED_PENDING_OFFICIAL_DOCS',
    liveAllowed: false, // HARD BLOCKED from live execution
    requiresStaticIp: true,
    tokenType: 'OAUTH_SESSION_ASSUMED',
    sessionExpiryHours: 12,
    maxOrdersPerSec: 5,
    allowedOrderTypes: ['MARKET', 'LIMIT'],
    allowedProductTypes: ['MIS', 'CNC', 'NRML'],
    allowedExchanges: ['NSE', 'NFO'],
    blockReason: 'GoPocket / SkyPro API specs require official vendor documentation & sandbox certification before live enablement.',
  },
};

/**
 * Token Bucket Rate Limiter for broker endpoints
 */
class TokenBucketRateLimiter {
  constructor(maxTokens = 10, refillRatePerSec = 10) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRatePerSec;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  tryConsume(tokens = 1) {
    this._refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

class BrokerCompliancePolicyEngine {
  constructor(options = {}) {
    this.registeredStaticIp = options.registeredStaticIp || null;
    this.rateLimiters = {
      DHAN: new TokenBucketRateLimiter(10, 10),
      ANGELONE: new TokenBucketRateLimiter(10, 10),
      GOPOCKET: new TokenBucketRateLimiter(5, 5),
    };
    this.sessions = new Map(); // broker -> { authenticatedAt, expiresAt, ip }
  }

  /**
   * Get Broker Readiness Specification
   * @param {string} brokerKey
   */
  getBrokerPolicy(brokerKey) {
    return BROKER_READINESS[(brokerKey || '').toUpperCase()] || null;
  }

  /**
   * Record a successful session authentication
   * @param {string} brokerKey
   * @param {object} sessionInfo
   */
  registerSession(brokerKey, sessionInfo = {}) {
    const b = brokerKey.toUpperCase();
    const policy = this.getBrokerPolicy(b);
    const now = Date.now();
    const expiryMs = (policy?.sessionExpiryHours || 24) * 3600 * 1000;

    this.sessions.set(b, {
      authenticatedAt: new Date(now),
      expiresAt: new Date(now + expiryMs),
      clientIp: sessionInfo.clientIp || this.registeredStaticIp,
      ...sessionInfo,
    });
  }

  /**
   * Check if a broker's daily session is active and valid
   * @param {string} brokerKey
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateSession(brokerKey) {
    const b = brokerKey.toUpperCase();
    const session = this.sessions.get(b);

    if (!session) {
      return { valid: false, reason: `NO_ACTIVE_SESSION: Broker ${b} has not been authenticated today.` };
    }

    if (Date.now() > session.expiresAt.getTime()) {
      return { valid: false, reason: `SESSION_EXPIRED: ${b} session expired at ${session.expiresAt.toISOString()}. Daily re-authentication required.` };
    }

    return { valid: true };
  }

  /**
   * Evaluate complete pre-execution compliance policy
   * @param {object} order
   * @param {object} context
   * @returns {{ allowed: boolean, reason?: string, policy?: object }}
   */
  evaluateOrder(order, context = {}) {
    const broker = (order.broker || context.broker || '').toUpperCase();
    const policy = this.getBrokerPolicy(broker);

    if (!policy) {
      return { allowed: false, reason: `UNSUPPORTED_BROKER: ${broker} is not a supported broker policy.` };
    }

    // 1. Hard Block for Unverified/Assumed Brokers
    if (policy.status === 'BLOCKED_PENDING_OFFICIAL_DOCS' && !context.isSimulation) {
      return {
        allowed: false,
        reason: `BROKER_BLOCKED_FOR_LIVE: ${policy.blockReason}`,
        policy,
      };
    }

    // 2. Order Type Permissibility Check
    const orderType = (order.orderType || 'MARKET').toUpperCase();
    if (!policy.allowedOrderTypes.includes(orderType)) {
      return {
        allowed: false,
        reason: `ORDER_TYPE_NOT_PERMITTED: Order type ${orderType} is not permitted for broker ${broker}. Permitted: ${policy.allowedOrderTypes.join(', ')}`,
        policy,
      };
    }

    // 3. Static IP Verification Check
    if (policy.requiresStaticIp && this.registeredStaticIp) {
      const currentIp = context.outboundIp || this.registeredStaticIp;
      if (currentIp !== this.registeredStaticIp) {
        return {
          allowed: false,
          reason: `STATIC_IP_MISMATCH: Outbound IP ${currentIp} does not match registered static IP ${this.registeredStaticIp}.`,
          policy,
        };
      }
    }

    // 4. Per-Broker Rate Limit Check
    const limiter = this.rateLimiters[broker];
    if (limiter && !limiter.tryConsume(1)) {
      return {
        allowed: false,
        reason: `RATE_LIMIT_EXCEEDED: Exceeded max allowed rate of ${policy.maxOrdersPerSec} requests/second for ${broker}. Throttling active.`,
        policy,
      };
    }

    return {
      allowed: true,
      reason: 'COMPLIANCE_POLICY_PASSED',
      policy,
    };
  }
}

module.exports = {
  BROKER_READINESS,
  TokenBucketRateLimiter,
  BrokerCompliancePolicyEngine,
};
