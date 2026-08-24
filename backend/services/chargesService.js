/**
 * chargesService.js — Hello Trader Charges & Fee Management Service
 *
 * Central Single Source of Truth for:
 *   1. Premium Membership: 30 Days = 900 Tokens
 *   2. Algo Connection Charges (Lot-tier based)
 *   3. Algo Brokerage Charges (Lot-tier based, Token ONLY)
 *   4. Referral Rules (₹50 referred token benefit, ₹200 approved-recharge referrer reward)
 *   5. Paper Welcome Bonus (₹50,00,000 Starting Margin)
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_ALGO_CONNECTION_TIERS = [
  { minLots: 1, maxLots: 5, tokens: 3800 },
  { minLots: 6, maxLots: 10, tokens: 7600 },
  { minLots: 11, maxLots: 15, tokens: 11400 }
];

const DEFAULT_ALGO_BROKERAGE_TIERS = [
  { minLots: 1, maxLots: 2, buyTokens: 10, sellTokens: 10 },
  { minLots: 3, maxLots: 5, buyTokens: 12, sellTokens: 12 },
  { minLots: 6, maxLots: 10, buyTokens: 15, sellTokens: 15 }
];

/**
 * Get all current active platform charges.
 * @param {Object} [customPrisma] - Optional custom PrismaClient instance
 */
async function getActiveCharges(customPrisma = null) {
  const db = customPrisma || prisma;
  let settings = await db.systemSettings.findUnique({ where: { id: 'CONFIG' } });
  if (!settings) {
    settings = await db.systemSettings.create({ data: { id: 'CONFIG' } });
  }

  let connectionTiers = DEFAULT_ALGO_CONNECTION_TIERS;
  let brokerageTiers = DEFAULT_ALGO_BROKERAGE_TIERS;

  if (settings.algoConnectionTiersJson) {
    try { connectionTiers = JSON.parse(settings.algoConnectionTiersJson); } catch (_) {}
  }
  if (settings.algoBrokerageTiersJson) {
    try { brokerageTiers = JSON.parse(settings.algoBrokerageTiersJson); } catch (_) {}
  }

  return {
    premiumMembership: {
      durationDays: 30,
      tokens: Number(settings.monthlyCost || 900),
      description: '900 Tokens = 30 Days Complete Premium Access (Unlocks AI Lab & Terminal)'
    },
    algoConnectionCharges: {
      defaultTokens: 3800,
      tiers: connectionTiers
    },
    algoBrokerage: {
      lotSize: 65, // NIFTY standard lot size
      currency: 'TOKEN',
      tiers: brokerageTiers
    },
    referralRules: {
      referredTokenBenefit: 50, // ₹50 referral token for referred user on link signup
      referrerReward: 200      // ₹200 cash reward for referrer on admin-approved recharge
    },
    paperWelcomeBonus: {
      paperCapital: 5000000 // ₹50,00,000 starting margin
    }
  };
}

/**
 * Calculate connection charge tokens for given lot capacity.
 */
function getAlgoConnectionChargeForLots(lots, tiers) {
  const lotCount = Math.max(1, parseInt(lots || 1));
  const activeTiers = tiers && tiers.length > 0 ? tiers : DEFAULT_ALGO_CONNECTION_TIERS;
  const matchedTier = activeTiers.find(t => lotCount >= t.minLots && lotCount <= t.maxLots);
  if (matchedTier) return matchedTier.tokens;
  const highestTier = activeTiers[activeTiers.length - 1];
  return Math.ceil((lotCount / (highestTier.maxLots || 15)) * (highestTier.tokens || 11400));
}

/**
 * Calculate BUY and SELL brokerage tokens for given lot count (Tier Rate Per Lot × Executed Lots).
 */
function getAlgoBrokerageForLots(lots, tiers) {
  const lotCount = Math.max(1, parseInt(lots || 1));
  const activeTiers = tiers && tiers.length > 0 ? tiers : DEFAULT_ALGO_BROKERAGE_TIERS;
  const matchedTier = activeTiers.find(t => lotCount >= t.minLots && lotCount <= t.maxLots);
  
  if (matchedTier) {
    const buyTokens = matchedTier.buyTokens * lotCount;
    const sellTokens = matchedTier.sellTokens * lotCount;
    return {
      ratePerLotBuy: matchedTier.buyTokens,
      ratePerLotSell: matchedTier.sellTokens,
      buyTokens,
      sellTokens,
      totalRequiredTokens: buyTokens + sellTokens
    };
  }
  
  const highestTier = activeTiers[activeTiers.length - 1];
  const rateBuy = highestTier.buyTokens;
  const rateSell = highestTier.sellTokens;
  const buyTokens = rateBuy * lotCount;
  const sellTokens = rateSell * lotCount;
  
  return {
    ratePerLotBuy: rateBuy,
    ratePerLotSell: rateSell,
    buyTokens,
    sellTokens,
    totalRequiredTokens: buyTokens + sellTokens
  };
}

module.exports = {
  getActiveCharges,
  getAlgoConnectionChargeForLots,
  getAlgoBrokerageForLots,
  DEFAULT_ALGO_CONNECTION_TIERS,
  DEFAULT_ALGO_BROKERAGE_TIERS
};
