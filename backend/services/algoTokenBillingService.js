/**
 * algoTokenBillingService.js
 * Backend-only dynamic upfront prepaid token billing for Algo Trading based on Admin saved settings.
 * 
 * Business Pricing Policy:
 *   - Upfront Round-Trip Prepaid Debit: At the moment an ALGO ENTRY order is confirmed filled by the broker,
 *     deduct BOTH ENTRY brokerage + expected EXIT brokerage upfront in a single round-trip charge.
 *   - Formula:
 *       totalEntryDebit = (buyTokensPerLot + sellTokensPerLot) * executedLots
 *   - Admin Tiers:
 *       1–2 lots:  BUY 10/lot + SELL 10/lot = 20 tokens/lot (1 Lot = 20T, 2 Lots = 40T)
 *       3–5 lots:  BUY 12/lot + SELL 12/lot = 24 tokens/lot (3 Lots = 72T, 5 Lots = 120T)
 *       6–10 lots: BUY 15/lot + SELL 15/lot = 30 tokens/lot (6 Lots = 180T, 10 Lots = 300T)
 *   - Exit Webhook: Does NOT debit any wallet tokens (0 tokens debited; prepaid at entry).
 *   - Connection Charges: 3,800 tokens (1-5 lots), 7,600 (6-10), 11,400 (11-15) ONE-TIME on activation ONLY.
 *   - Strict Exclusions: Failed, rejected, blocked, duplicate, or manual orders deduct 0 tokens.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AuditLogger, CATEGORIES } = require('./auditLogger');
const { getActiveCharges, getAlgoBrokerageForLots, DEFAULT_ALGO_BROKERAGE_TIERS } = require('./chargesService');

class AlgoTokenBillingService {
  /**
   * Get active brokerage tiers from Admin configuration or system defaults.
   */
  static async getActiveBrokerageTiers() {
    try {
      const charges = await getActiveCharges();
      return charges.algoBrokerage?.tiers || DEFAULT_ALGO_BROKERAGE_TIERS;
    } catch (_) {
      return DEFAULT_ALGO_BROKERAGE_TIERS;
    }
  }

  /**
   * Calculate total upfront prepaid round-trip tokens (BUY + SELL) for given lot count.
   * e.g., 1 lot = 20, 2 lots = 40, 3 lots = 72, 5 lots = 120, 10 lots = 300.
   */
  static async calculateEntryTokens(lots) {
    const lotCount = Math.max(1, parseInt(lots || 1));
    const tiers = await this.getActiveBrokerageTiers();
    const brokerage = getAlgoBrokerageForLots(lotCount, tiers);
    return brokerage.totalRequiredTokens; // buyTokens + sellTokens
  }

  /**
   * Calculate exit tokens (0 because exit is prepaid upfront at entry).
   */
  static async calculateExitTokens(lots) {
    return 0; // Prepaid upfront at entry
  }

  /**
   * Calculate detailed fee breakdown for given lot count.
   */
  static async getBrokerageBreakdown(lots) {
    const lotCount = Math.max(1, parseInt(lots || 1));
    const tiers = await this.getActiveBrokerageTiers();
    const brokerage = getAlgoBrokerageForLots(lotCount, tiers);
    return {
      lots: lotCount,
      ratePerLotBuy: brokerage.ratePerLotBuy,
      ratePerLotSell: brokerage.ratePerLotSell,
      buyTokens: brokerage.buyTokens,
      sellTokens: brokerage.sellTokens,
      totalTokens: brokerage.totalRequiredTokens
    };
  }

  /**
   * Compute current user token balance from wallet ledger.
   */
  static async getUserTokenBalance(userId) {
    const ledgers = await prisma.ledger.findMany({
      where: { userId, walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] } }
    });
    let balance = 0;
    ledgers.forEach(l => {
      balance += (l.type === 'CREDIT' ? l.amount : -l.amount);
    });
    return Math.max(0, balance);
  }

  /**
   * Deduct Upfront Round-Trip Prepaid Brokerage upon confirmed live algo entry execution.
   */
  static async deductEntryFee({ userId, connectionId, brokerOrderId, symbol, orderAction, quantity, lots, tradeId, req }) {
    if (!userId || !brokerOrderId) {
      return { success: false, deducted: 0, reason: 'MISSING_USER_OR_ORDER_ID' };
    }

    const idempotentRef = `ALGO_ENTRY:${userId}:${connectionId || 'default'}:${brokerOrderId}`;

    // 1. Idempotency Check
    const existing = await prisma.ledger.findFirst({
      where: { userId, walletType: 'TOKEN', reason: { startsWith: idempotentRef } }
    });

    if (existing) {
      await AuditLogger.log({
        userId, category: CATEGORIES.ALGO, action: 'TOKEN_DEBIT_SKIPPED',
        detail: `Prepaid brokerage debit skipped: Order ${brokerOrderId} on ${symbol} already billed (${existing.amount} tokens).`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const lotCount = lots || Math.max(1, Math.round((quantity || 65) / (symbol?.includes('BANKNIFTY') ? 15 : (symbol?.includes('FINNIFTY') ? 40 : 65))));
    const tiers = await this.getActiveBrokerageTiers();
    const brokerage = getAlgoBrokerageForLots(lotCount, tiers);
    const amount = brokerage.totalRequiredTokens; // Upfront Round-Trip (BUY + SELL)

    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const optionType = symbol?.endsWith('CE') ? 'CE' : (symbol?.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason with ALGO_TRADE_BROKERAGE_PREPAID
    const ledgerMetadata = {
      type: 'ALGO_TRADE_BROKERAGE_PREPAID',
      label: 'ALGO TRADE BROKERAGE (PREPAID ROUND-TRIP)',
      symbol,
      optionType,
      lots: lotCount,
      buyFee: brokerage.buyTokens,
      sellFee: brokerage.sellTokens,
      ratePerLotBuy: brokerage.ratePerLotBuy,
      ratePerLotSell: brokerage.ratePerLotSell,
      totalTokensDeducted: amount,
      quantity: quantity || (lotCount * 65),
      entryOrderId: brokerOrderId,
      brokerOrderId,
      tradeId: tradeId || null,
      balanceBefore,
      balanceAfter,
      timestamp: new Date().toISOString()
    };

    const structuredReason = `${idempotentRef}|${JSON.stringify(ledgerMetadata)}`;

    // 3. Create Ledger Entry
    const ledgerEntry = await prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount,
        type: 'DEBIT',
        reason: structuredReason
      }
    });

    // 4. Audit Log
    await AuditLogger.log({
      userId, category: CATEGORIES.ALGO, action: 'TOKEN_DEBITED',
      detail: `Algo Prepaid Round-Trip Brokerage: Debited ${amount} tokens (${lotCount} lot(s): ${brokerage.buyTokens} Buy + ${brokerage.sellTokens} Exit prepaid) for ${orderAction || 'BUY'} ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    // 5. Telegram Notification (Non-blocking)
    try {
      const { N } = require('./notifier');
      const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, studentId: true } });
      N.algoTokenDeducted({
        studentName: student?.name || 'Student',
        studentId: student?.studentId || userId,
        amount,
        reason: `Prepaid Algo Brokerage (${lotCount} Lots)`,
        balanceBefore,
        balanceAfter,
        orderId: brokerOrderId
      });
    } catch (_) {}

    return {
      success: true,
      deducted: amount,
      lots: lotCount,
      buyFee: brokerage.buyTokens,
      sellFee: brokerage.sellTokens,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'ROUND_TRIP_PREPAID_BILLED'
    };
  }

  /**
   * Exit Square-off Handler: NO SECOND WALLET DEBIT.
   * Exit fee was already prepaid upfront at entry.
   */
  static async deductExitFee({ userId, connectionId, brokerOrderId, symbol, orderAction, quantity, lots, tradeId, exitReason, req }) {
    if (!userId || !brokerOrderId) {
      return { success: false, deducted: 0, reason: 'MISSING_USER_OR_ORDER_ID' };
    }

    // Log informational audit trail (0 tokens deducted)
    await AuditLogger.log({
      userId, category: CATEGORIES.POSITION, action: 'EXIT_SQUARE_OFF_COMPLETED',
      detail: `Algo Exit: Position ${symbol} squared off (Exit Order: ${brokerOrderId}). 0 tokens debited (exit fee was prepaid upfront at entry).`,
      meta: { brokerOrderId, symbol, tradeId, exitReason, tokensDeducted: 0 }, req
    });

    return {
      success: true,
      deducted: 0,
      reason: 'PREPAID_AT_ENTRY',
      prepaid: true
    };
  }

  /**
   * Apply missing exit prepaid adjustment (for reconciliation of partial trades).
   */
  static async applyExitPrepaidAdjustment({ userId, connectionId, brokerOrderId, symbol, lots, quantity, tradeId, req }) {
    const idempotentRef = `ALGO_EXIT_PREPAID:${userId}:${connectionId || 'default'}:${brokerOrderId}`;

    const existing = await prisma.ledger.findFirst({
      where: { userId, walletType: 'TOKEN', reason: { startsWith: idempotentRef } }
    });

    if (existing) {
      return { success: true, deducted: 0, reason: 'ALREADY_ADJUSTED', isIdempotentDuplicate: true };
    }

    const lotCount = Math.max(1, parseInt(lots || 1));
    const tiers = await this.getActiveBrokerageTiers();
    const brokerage = getAlgoBrokerageForLots(lotCount, tiers);
    const amount = brokerage.sellTokens; // Missing exit prepaid component

    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const optionType = symbol?.endsWith('CE') ? 'CE' : (symbol?.endsWith('PE') ? 'PE' : 'EQ');

    const ledgerMetadata = {
      type: 'ALGO_TRADE_BROKERAGE_PREPAID',
      label: 'ALGO EXIT BROKERAGE (PREPAID ADJUSTMENT)',
      symbol,
      optionType,
      lots: lotCount,
      buyFee: 0,
      sellFee: amount,
      totalTokensDeducted: amount,
      quantity: quantity || (lotCount * 65),
      entryOrderId: brokerOrderId,
      brokerOrderId,
      tradeId: tradeId || null,
      balanceBefore,
      balanceAfter,
      timestamp: new Date().toISOString()
    };

    const structuredReason = `${idempotentRef}|${JSON.stringify(ledgerMetadata)}`;

    const ledgerEntry = await prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount,
        type: 'DEBIT',
        reason: structuredReason
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.ALGO, action: 'TOKEN_DEBITED',
      detail: `Algo Exit Prepaid Adjustment: Debited ${amount} tokens for ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: amount,
      lots: lotCount,
      sellFee: amount,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'EXIT_PREPAID_ADJUSTMENT_BILLED'
    };
  }

  /**
   * Get Admin Token & Brokerage Usage Report
   */
  static async getAdminTokenReport(filter = {}) {
    const where = {
      walletType: 'TOKEN',
      type: 'DEBIT',
      OR: [
        { reason: { startsWith: 'ALGO_ENTRY:' } },
        { reason: { startsWith: 'ALGO_EXIT:' } },
        { reason: { startsWith: 'ALGO_EXIT_PREPAID:' } },
        { reason: { startsWith: 'ALGO_CONNECTION_CHARGE_' } }
      ]
    };

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

    if (filter.dateStr) {
      const start = new Date(`${filter.dateStr}T00:00:00.000Z`);
      const end = new Date(`${filter.dateStr}T23:59:59.999Z`);
      where.timestamp = { gte: start, lte: end };
    }

    const debits = await prisma.ledger.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, studentId: true, phone: true } }
      },
      orderBy: { timestamp: 'desc' }
    });

    const userSummary = {};
    let totalEntries = 0;
    let totalExits = 0;
    let totalEntryLots = 0;
    let totalExitLots = 0;
    let totalBuyBrokerageTokens = 0;
    let totalSellBrokerageTokens = 0;
    let totalTradeBrokerageTokens = 0;
    let totalConnectionEvents = 0;
    let totalConnectionTokens = 0;

    for (const d of debits) {
      const uid = d.userId;
      const isEntry = d.reason.startsWith('ALGO_ENTRY:');
      const isExitPrepaid = d.reason.startsWith('ALGO_EXIT_PREPAID:');
      const isConnection = d.reason.startsWith('ALGO_CONNECTION_CHARGE_');

      let meta = {};
      try {
        const parts = d.reason.split('|');
        if (parts.length > 1) meta = JSON.parse(parts[1]);
      } catch (_) {}

      const lots = meta.lots || Math.max(1, Math.round((meta.quantity || 65) / (meta.symbol?.includes('BANKNIFTY') ? 15 : 65)));

      if (!userSummary[uid]) {
        userSummary[uid] = {
          userId: uid,
          name: d.user?.name || 'Unknown',
          email: d.user?.email || 'N/A',
          studentId: d.user?.studentId || 'N/A',
          phone: d.user?.phone || 'N/A',
          entryTrades: 0,
          exitTrades: 0,
          entryLots: 0,
          exitLots: 0,
          buyBrokerageTokens: 0,
          sellBrokerageTokens: 0,
          totalTradeBrokerage: 0,
          connectionChargeTokens: 0,
          connectionEvents: 0,
          totalTokensCollected: 0,
          todayUsage: 0,
          lastTradeAt: d.timestamp,
          lastBrokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
          transactions: []
        };
      }

      if (isEntry) {
        userSummary[uid].entryTrades += 1;
        userSummary[uid].entryLots += lots;
        
        let buyPortion = 0;
        let sellPortion = 0;

        if (meta.buyFee !== undefined && meta.sellFee !== undefined) {
          buyPortion = Number(meta.buyFee);
          sellPortion = Number(meta.sellFee);
        } else {
          // If transaction was a single-leg BUY debit (e.g. 10 tokens for 1 lot)
          const tiers = await this.getActiveBrokerageTiers();
          const brokerage = getAlgoBrokerageForLots(lots, tiers);
          if (d.amount === brokerage.buyTokens) {
            buyPortion = d.amount;
            sellPortion = 0;
          } else {
            buyPortion = Math.round(d.amount / 2);
            sellPortion = d.amount - buyPortion;
          }
        }

        userSummary[uid].buyBrokerageTokens += buyPortion;
        userSummary[uid].sellBrokerageTokens += sellPortion;
        userSummary[uid].totalTradeBrokerage += d.amount;
        totalEntries += 1;
        totalEntryLots += lots;
        totalBuyBrokerageTokens += buyPortion;
        totalSellBrokerageTokens += sellPortion;
        totalTradeBrokerageTokens += d.amount;
      } else if (isExitPrepaid) {
        userSummary[uid].sellBrokerageTokens += d.amount;
        userSummary[uid].totalTradeBrokerage += d.amount;
        totalSellBrokerageTokens += d.amount;
        totalTradeBrokerageTokens += d.amount;
      } else if (isConnection) {
        userSummary[uid].connectionEvents += 1;
        userSummary[uid].connectionChargeTokens += d.amount;
        totalConnectionEvents += 1;
        totalConnectionTokens += d.amount;
      }

      userSummary[uid].totalTokensCollected += d.amount;

      if (d.timestamp >= todayStart) {
        userSummary[uid].todayUsage += d.amount;
      }

      userSummary[uid].transactions.push({
        ledgerId: d.id,
        eventType: isEntry ? 'ALGO_TRADE_BROKERAGE_PREPAID' : (isExitPrepaid ? 'ALGO_EXIT_PREPAID' : 'ALGO_CONNECTION_CHARGE'),
        label: isEntry ? 'ALGO TRADE BROKERAGE (PREPAID ROUND-TRIP)' : (isExitPrepaid ? 'ALGO EXIT BROKERAGE (PREPAID ADJUSTMENT)' : 'ALGO CONNECTION CHARGE'),
        amount: d.amount,
        lots: isConnection ? null : lots,
        quantity: isConnection ? null : (meta.quantity || (lots * 65)),
        timestamp: d.timestamp,
        symbol: meta.symbol || (isConnection ? d.reason : 'N/A'),
        optionType: meta.optionType || 'N/A',
        brokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
        balanceBefore: meta.balanceBefore,
        balanceAfter: meta.balanceAfter
      });
    }

    // Fetch user current balances
    const userIds = Object.keys(userSummary);
    for (const uid of userIds) {
      userSummary[uid].remainingTokens = await this.getUserTokenBalance(uid);
    }

    const grandTotalTokensCollected = totalConnectionTokens + totalTradeBrokerageTokens;

    return {
      success: true,
      summary: {
        connectionCharges: {
          totalConnectionEvents,
          totalConnectionTokens,
        },
        tradeBrokerage: {
          totalAlgoEntries: totalEntries,
          totalAlgoExits: totalExits,
          totalEntryLots,
          totalExitLots,
          totalTrades: totalEntries + totalExits,
          buyBrokerageTokens: totalBuyBrokerageTokens,
          sellBrokerageTokens: totalSellBrokerageTokens,
          totalTradeBrokerageTokens,
        },
        grandTotalTokensCollected,
        uniqueUsersCount: userIds.length,
        brokerageTiers: await this.getActiveBrokerageTiers(),
        date: filter.dateStr || 'ALL_TIME'
      },
      users: Object.values(userSummary),
      recentDebits: debits.slice(0, 50).map(d => {
        let meta = {};
        try {
          const parts = d.reason.split('|');
          if (parts.length > 1) meta = JSON.parse(parts[1]);
        } catch (_) {}
        const isEntry = d.reason.startsWith('ALGO_ENTRY:');
        const isExitPrepaid = d.reason.startsWith('ALGO_EXIT_PREPAID:');
        const isConnection = d.reason.startsWith('ALGO_CONNECTION_CHARGE_');
        const lots = meta.lots || Math.max(1, Math.round((meta.quantity || 65) / (meta.symbol?.includes('BANKNIFTY') ? 15 : 65)));
        return {
          id: d.id,
          userId: d.userId,
          userName: d.user?.name,
          userEmail: d.user?.email,
          studentId: d.user?.studentId,
          eventType: isEntry ? 'ALGO_TRADE_BROKERAGE_PREPAID' : (isExitPrepaid ? 'ALGO_EXIT_PREPAID' : 'ALGO_CONNECTION_CHARGE'),
          label: isEntry ? 'ALGO TRADE BROKERAGE (PREPAID ROUND-TRIP)' : (isExitPrepaid ? 'ALGO EXIT BROKERAGE (PREPAID ADJUSTMENT)' : 'ALGO CONNECTION CHARGE'),
          symbol: meta.symbol || (isConnection ? d.reason : 'N/A'),
          lots: isConnection ? null : lots,
          quantity: isConnection ? null : (meta.quantity || (lots * 65)),
          amount: d.amount,
          timestamp: d.timestamp,
          brokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
          balanceBefore: meta.balanceBefore,
          balanceAfter: meta.balanceAfter
        };
      })
    };
  }
}

module.exports = { AlgoTokenBillingService };
