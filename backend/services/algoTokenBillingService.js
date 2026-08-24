/**
 * algoTokenBillingService.js
 * Backend-only dynamic tiered token billing for Algo Trading based on Admin saved settings.
 * 
 * Pricing Architecture:
 *   A. Connection Fee Tiers (One-Time per Broker Terminal Activation):
 *      - 1–5 lots   = 3,800 tokens
 *      - 6–10 lots  = 7,600 tokens
 *      - 11–15 lots = 11,400 tokens
 *      (Charged ONLY ONCE when a new broker connection is activated; NEVER per trade)
 * 
 *   B. BUY & SELL Brokerage Tiers (Per Trade based on matching lot tier):
 *      - 1–2 lots   = BUY 10 tokens | SELL 10 tokens (Round-Trip: 20 tokens)
 *      - 3–5 lots   = BUY 12 tokens | SELL 12 tokens (Round-Trip: 24 tokens)
 *      - 6–10 lots  = BUY 15 tokens | SELL 15 tokens (Round-Trip: 30 tokens)
 *      (Flat tier amount per trade, NOT multiplied by lot count)
 * 
 *   C. Strict Exclusions (0 Tokens):
 *      - Failed, rejected, blocked, duplicate, or manual positions deduct 0 tokens.
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
   * Calculate BUY entry brokerage tokens for given lot count.
   * e.g., 1-2 lots = 10 tokens, 3-5 lots = 12 tokens, 6-10 lots = 15 tokens.
   */
  static async calculateEntryTokens(lots) {
    const lotCount = Math.max(1, parseInt(lots || 1));
    const tiers = await this.getActiveBrokerageTiers();
    const brokerage = getAlgoBrokerageForLots(lotCount, tiers);
    return brokerage.buyTokens;
  }

  /**
   * Calculate SELL exit brokerage tokens for given lot count.
   * e.g., 1-2 lots = 10 tokens, 3-5 lots = 12 tokens, 6-10 lots = 15 tokens.
   */
  static async calculateExitTokens(lots) {
    const lotCount = Math.max(1, parseInt(lots || 1));
    const tiers = await this.getActiveBrokerageTiers();
    const brokerage = getAlgoBrokerageForLots(lotCount, tiers);
    return brokerage.sellTokens;
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
   * Deduct BUY Brokerage upon confirmed live algo entry execution.
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
        userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBIT_SKIPPED',
        detail: `BUY brokerage debit skipped: Order ${brokerOrderId} on ${symbol} already billed (${existing.amount} tokens).`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const lotCount = lots || Math.max(1, Math.round((quantity || 65) / (symbol?.includes('BANKNIFTY') ? 15 : (symbol?.includes('FINNIFTY') ? 40 : 65))));
    const amount = await this.calculateEntryTokens(lotCount);

    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const optionType = symbol?.endsWith('CE') ? 'CE' : (symbol?.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason
    const ledgerMetadata = {
      type: 'ALGO_ENTRY',
      label: 'ALGO BUY BROKERAGE',
      symbol,
      optionType,
      lots: lotCount,
      quantity: quantity || (lotCount * 65),
      brokerOrderId,
      tradeId: tradeId || null,
      tokensDeducted: amount,
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
      userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBITED',
      detail: `Algo BUY Brokerage: Debited ${amount} tokens (${lotCount} lot(s) tier) for ${orderAction || 'BUY'} ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: amount,
      lots: lotCount,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'BUY_BROKERAGE_BILLED'
    };
  }

  /**
   * Deduct SELL Brokerage upon confirmed live algo exit square-off.
   */
  static async deductExitFee({ userId, connectionId, brokerOrderId, symbol, orderAction, quantity, lots, tradeId, exitReason, req }) {
    if (!userId || !brokerOrderId) {
      return { success: false, deducted: 0, reason: 'MISSING_USER_OR_ORDER_ID' };
    }

    const idempotentRef = `ALGO_EXIT:${userId}:${connectionId || 'default'}:${brokerOrderId}`;

    // 1. Idempotency Check
    const existing = await prisma.ledger.findFirst({
      where: { userId, walletType: 'TOKEN', reason: { startsWith: idempotentRef } }
    });

    if (existing) {
      await AuditLogger.log({
        userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBIT_SKIPPED',
        detail: `SELL brokerage debit skipped: Order ${brokerOrderId} on ${symbol} already billed (${existing.amount} tokens).`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const lotCount = lots || Math.max(1, Math.round((quantity || 65) / (symbol?.includes('BANKNIFTY') ? 15 : (symbol?.includes('FINNIFTY') ? 40 : 65))));
    const amount = await this.calculateExitTokens(lotCount);

    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const optionType = symbol?.endsWith('CE') ? 'CE' : (symbol?.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason
    const ledgerMetadata = {
      type: 'ALGO_EXIT',
      label: 'ALGO SELL BROKERAGE',
      symbol,
      optionType,
      lots: lotCount,
      quantity: quantity || (lotCount * 65),
      brokerOrderId,
      tradeId: tradeId || null,
      tokensDeducted: amount,
      balanceBefore,
      balanceAfter,
      exitReason: exitReason || 'SIGNAL_EXIT',
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
      userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBITED',
      detail: `Algo SELL Brokerage: Debited ${amount} tokens (${lotCount} lot(s) tier) for EXIT on ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: amount,
      lots: lotCount,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'SELL_BROKERAGE_BILLED'
    };
  }

  /**
   * Get User Detailed Wallet Statement for Algo Trading Debits.
   */
  static async getUserAlgoStatements(userId) {
    const debits = await prisma.ledger.findMany({
      where: {
        userId,
        walletType: 'TOKEN',
        type: 'DEBIT',
        OR: [
          { reason: { startsWith: 'ALGO_ENTRY:' } },
          { reason: { startsWith: 'ALGO_EXIT:' } }
        ]
      },
      orderBy: { timestamp: 'desc' }
    });

    return debits.map(d => {
      let meta = {};
      try {
        const parts = d.reason.split('|');
        if (parts.length > 1) {
          meta = JSON.parse(parts[1]);
        }
      } catch (_) {}

      const isEntry = d.reason.startsWith('ALGO_ENTRY:');
      const lots = meta.lots || Math.max(1, Math.round((meta.quantity || 65) / (meta.symbol?.includes('BANKNIFTY') ? 15 : 65)));
      return {
        id: d.id,
        timestamp: d.timestamp,
        eventType: isEntry ? 'ALGO_ENTRY' : 'ALGO_EXIT',
        label: isEntry ? 'ALGO BUY BROKERAGE' : 'ALGO SELL BROKERAGE',
        symbol: meta.symbol || 'N/A',
        optionType: meta.optionType || (meta.symbol?.endsWith('CE') ? 'CE' : 'PE'),
        lots: lots,
        quantity: meta.quantity || (lots * 65),
        brokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
        tradeId: meta.tradeId || null,
        tokensDeducted: d.amount,
        balanceBefore: meta.balanceBefore !== undefined ? meta.balanceBefore : null,
        balanceAfter: meta.balanceAfter !== undefined ? meta.balanceAfter : null,
      };
    });
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
    let totalConnectionEvents = 0;
    let totalConnectionTokens = 0;

    for (const d of debits) {
      const uid = d.userId;
      const isEntry = d.reason.startsWith('ALGO_ENTRY:');
      const isExit = d.reason.startsWith('ALGO_EXIT:');
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
        userSummary[uid].buyBrokerageTokens += d.amount;
        userSummary[uid].totalTradeBrokerage += d.amount;
        totalEntries += 1;
        totalEntryLots += lots;
        totalBuyBrokerageTokens += d.amount;
      } else if (isExit) {
        userSummary[uid].exitTrades += 1;
        userSummary[uid].exitLots += lots;
        userSummary[uid].sellBrokerageTokens += d.amount;
        userSummary[uid].totalTradeBrokerage += d.amount;
        totalExits += 1;
        totalExitLots += lots;
        totalSellBrokerageTokens += d.amount;
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
        eventType: isEntry ? 'ALGO_ENTRY' : (isExit ? 'ALGO_EXIT' : 'ALGO_CONNECTION_CHARGE'),
        label: isEntry ? 'ALGO BUY BROKERAGE' : (isExit ? 'ALGO SELL BROKERAGE' : 'ALGO CONNECTION CHARGE'),
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

    const totalTradeBrokerageTokens = totalBuyBrokerageTokens + totalSellBrokerageTokens;
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
        const isExit = d.reason.startsWith('ALGO_EXIT:');
        const isConnection = d.reason.startsWith('ALGO_CONNECTION_CHARGE_');
        const lots = meta.lots || Math.max(1, Math.round((meta.quantity || 65) / (meta.symbol?.includes('BANKNIFTY') ? 15 : 65)));
        return {
          id: d.id,
          userId: d.userId,
          userName: d.user?.name,
          userEmail: d.user?.email,
          studentId: d.user?.studentId,
          eventType: isEntry ? 'ALGO_ENTRY' : (isExit ? 'ALGO_EXIT' : 'ALGO_CONNECTION_CHARGE'),
          label: isEntry ? 'ALGO BUY BROKERAGE' : (isExit ? 'ALGO SELL BROKERAGE' : 'ALGO CONNECTION CHARGE'),
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
