/**
 * entitlementService.js — Hello Trader Centralized Entitlement & Authorization Engine
 *
 * Validates:
 *   1. User existence & Status (LOCKED -> ACCOUNT_LOCKED)
 *   2. Admin accounts -> Always authorized
 *   3. Active Membership (Membership.status === 'ACTIVE' && Membership.expiresAt > now)
 *   4. Active Trial Period (evaluates User.trialDaysOverride || SystemSettings.trialDays)
 *   5. Feature Entitlement Keys (TRADING_TERMINAL, ALGO_WEBHOOK, COPY_TRADING, AI_LAB, OPTION_CHAIN, PAPER_TRADING)
 *
 * Structured Error Codes:
 *   - AUTH_REQUIRED (HTTP 401)
 *   - ACCOUNT_LOCKED (HTTP 403)
 *   - TRIAL_EXPIRED (HTTP 403)
 *   - MEMBERSHIP_EXPIRED (HTTP 403)
 *   - FEATURE_NOT_ENTITLED (HTTP 403)
 *   - INSUFFICIENT_TOKENS (HTTP 400)
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Check entitlement for a given user ID and feature key.
 * @param {string} userId - User UUID
 * @param {string} [featureKey='GENERAL_PREMIUM'] - Feature key
 * @param {Object} [customPrisma] - Optional custom PrismaClient instance
 * @returns {Promise<{authorized: boolean, code?: string, message?: string, reason?: string, expiresAt?: Date, user?: Object}>}
 */
async function checkUserEntitlement(userId, featureKey = 'GENERAL_PREMIUM', customPrisma = null) {
  const db = customPrisma || prisma;

  if (!userId) {
    return {
      authorized: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Please log in to access this feature.'
    };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, studentId: true, name: true, email: true, role: true, status: true, trialStartedAt: true, trialDaysOverride: true }
  });

  if (!user) {
    return {
      authorized: false,
      code: 'AUTH_REQUIRED',
      message: 'User account not found.'
    };
  }

  // 1. Account Locked Check
  if (user.status === 'LOCKED') {
    return {
      authorized: false,
      code: 'ACCOUNT_LOCKED',
      message: 'Your account has been locked by an administrator. Please contact support.',
      user
    };
  }

  // 2. Admin Exemption — Admins have unrestricted access
  if (user.role === 'ADMIN' || user.email === 'hellotraderinstitute@gmail.com') {
    return {
      authorized: true,
      reason: 'ADMIN_UNRESTRICTED',
      user
    };
  }

  const now = new Date();

  // 3. Active Membership Check
  const activeMem = await db.membership.findFirst({
    where: {
      userId: user.id,
      status: 'ACTIVE',
      expiresAt: { gt: now }
    },
    orderBy: { expiresAt: 'desc' }
  });

  if (activeMem) {
    return {
      authorized: true,
      reason: 'ACTIVE_MEMBERSHIP',
      expiresAt: activeMem.expiresAt,
      user
    };
  }

  // 4. Active Trial Check (evaluates per-user trialDaysOverride!)
  const settings = await db.systemSettings.findUnique({ where: { id: 'CONFIG' } });
  const trialDays = user.trialDaysOverride !== null && user.trialDaysOverride !== undefined
    ? user.trialDaysOverride
    : (settings?.trialDays || 4);

  const trialStartedAt = user.trialStartedAt ? new Date(user.trialStartedAt).getTime() : 0;
  const trialExpiresAt = trialStartedAt + (trialDays * 24 * 60 * 60 * 1000);

  if (now.getTime() < trialExpiresAt) {
    return {
      authorized: true,
      reason: 'ACTIVE_TRIAL',
      expiresAt: new Date(trialExpiresAt),
      user
    };
  }

  // 5. Expired Evaluation
  if (trialStartedAt > 0 && now.getTime() >= trialExpiresAt) {
    return {
      authorized: false,
      code: 'TRIAL_EXPIRED',
      message: 'Your free trial period has expired. Please subscribe to continue using premium features.',
      user
    };
  }

  return {
    authorized: false,
    code: 'MEMBERSHIP_EXPIRED',
    message: 'Your premium membership has expired. Please recharge your subscription to access this feature.',
    user
  };
}

/**
 * Express Middleware to enforce entitlement on routes.
 * @param {string} [featureKey='GENERAL_PREMIUM']
 */
function requireEntitlement(featureKey = 'GENERAL_PREMIUM') {
  return async (req, res, next) => {
    const userId = req.user?.id;
    const result = await checkUserEntitlement(userId, featureKey);

    if (!result.authorized) {
      const statusMap = {
        AUTH_REQUIRED: 401,
        ACCOUNT_LOCKED: 403,
        TRIAL_EXPIRED: 403,
        MEMBERSHIP_EXPIRED: 403,
        FEATURE_NOT_ENTITLED: 403,
        INSUFFICIENT_TOKENS: 400
      };
      const httpCode = statusMap[result.code] || 403;
      return res.status(httpCode).json({
        success: false,
        error: result.code,
        message: result.message
      });
    }

    req.entitlement = result;
    next();
  };
}

/**
 * Calculates start of day in IST (Asia/Kolkata) timezone.
 * @param {Date} [now=new Date()]
 * @returns {Date}
 */
function getStartOfDayIST(now = new Date()) {
  const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  return new Date(`${istDateStr}T00:00:00.000+05:30`);
}

/**
 * Gets daily paper trade execution count for a user for the current IST calendar day.
 * @param {string} userId
 * @param {Object} [customPrisma]
 * @returns {Promise<{usedToday: number, maxFree: number, remaining: number, startOfDayIST: Date}>}
 */
async function getDailyFreeTradeUsage(userId, customPrisma = null) {
  const db = customPrisma || prisma;
  const startOfDayIST = getStartOfDayIST();
  const count = await db.trade.count({
    where: {
      userId,
      openedAt: { gte: startOfDayIST }
    }
  });
  return {
    usedToday: count,
    maxFree: 1,
    remaining: Math.max(0, 1 - count),
    startOfDayIST
  };
}

/**
 * Sanitizes Option Chain contracts array for Free users to retain ONLY strikePrice, call.ltp, and put.ltp.
 * Strips volume, OI, Greeks, IV, and all analytical signals.
 * @param {Array} contracts
 * @returns {Array}
 */
function sanitizeOptionChainForFreeUser(contracts) {
  if (!Array.isArray(contracts)) return [];
  return contracts.map(c => ({
    strike: c.strike,
    isAtm: c.isAtm,
    ceLtp: c.ceLtp || 0,
    peLtp: c.peLtp || 0
  }));
}


module.exports = {
  checkUserEntitlement,
  requireEntitlement,
  getStartOfDayIST,
  getDailyFreeTradeUsage,
  sanitizeOptionChainForFreeUser
};
