/**
 * algoTokenBillingService.js
 * Backend-only idempotent two-sided token billing for Algo Trading.
 * 
 * Policy:
 *   - Entry Token Fee (Default: 15 tokens) debited ONLY after confirmed live entry execution.
 *   - Exit Token Fee (Default: 15 tokens) debited ONLY after confirmed live exit square-off.
 *   - Total Complete Trade Cost = 15 (Entry) + 15 (Exit) = 30 tokens.
 *   - Zero deductions for failed, duplicate, blocked, manual, or unconfirmed orders.
 *   - Complete audit trail with balanceBefore, balanceAfter, symbol, qty, CE/PE, and orderId.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AuditLogger, CATEGORIES } = require('./auditLogger');

class AlgoTokenBillingService {
  /**
   * Get configured token fees for entry and exit.
   * Default: 15 tokens per entry, 15 tokens per exit (Total: 30 tokens).
   */
  static async getConfiguredFees() {
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      let entryFee = 15;
      let exitFee = 15;

      if (settings?.algoBrokerageTiersJson) {
        const parsed = JSON.parse(settings.algoBrokerageTiersJson);
        if (parsed?.entryFee !== undefined) entryFee = Number(parsed.entryFee);
        else if (parsed?.perTradeTokens) entryFee = Number(parsed.perTradeTokens);

        if (parsed?.exitFee !== undefined) exitFee = Number(parsed.exitFee);
        else if (parsed?.perTradeTokens) exitFee = Number(parsed.perTradeTokens);
      }

      return { entryFee, exitFee, totalFee: entryFee + exitFee };
    } catch (_) {
      return { entryFee: 15, exitFee: 15, totalFee: 30 };
    }
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
   * Deduct Entry Token Fee (Default: 15) upon successful live algo entry execution.
   */
  static async deductEntryFee({ userId, connectionId, brokerOrderId, symbol, orderAction, quantity, tradeId, req }) {
    if (!userId || !brokerOrderId) {
      return { success: false, deducted: 0, reason: 'MISSING_USER_OR_ORDER_ID' };
    }

    const idempotentRef = `ALGO_ENTRY:${userId}:${connectionId || 'default'}:${brokerOrderId}`;

    // 1. Idempotency Check
    const existing = await prisma.ledger.findFirst({
      where: { userId, walletType: 'TOKEN', reason: { startsWith: `ALGO_ENTRY:${userId}:${connectionId || 'default'}:${brokerOrderId}` } }
    });

    if (existing) {
      await AuditLogger.log({
        userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBIT_SKIPPED',
        detail: `Entry token debit skipped: Order ${brokerOrderId} already billed.`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const { entryFee } = await this.getConfiguredFees();
    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - entryFee);
    const optionType = symbol.endsWith('CE') ? 'CE' : (symbol.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason
    const ledgerMetadata = {
      type: 'ALGO_ENTRY',
      symbol,
      optionType,
      quantity: quantity || 65,
      brokerOrderId,
      tradeId: tradeId || null,
      tokensDeducted: entryFee,
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
        amount: entryFee,
        type: 'DEBIT',
        reason: structuredReason
      }
    });

    // 4. Audit Log
    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBITED',
      detail: `Algo Entry Fee: Debited ${entryFee} tokens for ${orderAction || 'BUY'} ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: entryFee,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'ENTRY_FEE_BILLED'
    };
  }

  /**
   * Deduct Exit Token Fee (Default: 15) upon successful live algo exit square-off.
   */
  static async deductExitFee({ userId, connectionId, brokerOrderId, symbol, orderAction, quantity, tradeId, exitReason, req }) {
    if (!userId || !brokerOrderId) {
      return { success: false, deducted: 0, reason: 'MISSING_USER_OR_ORDER_ID' };
    }

    const idempotentRef = `ALGO_EXIT:${userId}:${connectionId || 'default'}:${brokerOrderId}`;

    // 1. Idempotency Check
    const existing = await prisma.ledger.findFirst({
      where: { userId, walletType: 'TOKEN', reason: { startsWith: `ALGO_EXIT:${userId}:${connectionId || 'default'}:${brokerOrderId}` } }
    });

    if (existing) {
      await AuditLogger.log({
        userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBIT_SKIPPED',
        detail: `Exit token debit skipped: Order ${brokerOrderId} already billed.`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const { exitFee } = await this.getConfiguredFees();
    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - exitFee);
    const optionType = symbol.endsWith('CE') ? 'CE' : (symbol.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason
    const ledgerMetadata = {
      type: 'ALGO_EXIT',
      symbol,
      optionType,
      quantity: quantity || 65,
      brokerOrderId,
      tradeId: tradeId || null,
      tokensDeducted: exitFee,
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
        amount: exitFee,
        type: 'DEBIT',
        reason: structuredReason
      }
    });

    // 4. Audit Log
    await AuditLogger.log({
      userId, category: CATEGORIES.SETTINGS, action: 'TOKEN_DEBITED',
      detail: `Algo Exit Fee: Debited ${exitFee} tokens for EXIT on ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: exitFee,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'EXIT_FEE_BILLED'
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
      return {
        id: d.id,
        timestamp: d.timestamp,
        eventType: isEntry ? 'ENTRY' : 'EXIT',
        symbol: meta.symbol || 'N/A',
        optionType: meta.optionType || (meta.symbol?.endsWith('CE') ? 'CE' : 'PE'),
        quantity: meta.quantity || 65,
        brokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
        tradeId: meta.tradeId || null,
        tokensDeducted: d.amount,
        balanceBefore: meta.balanceBefore !== undefined ? meta.balanceBefore : null,
        balanceAfter: meta.balanceAfter !== undefined ? meta.balanceAfter : null,
      };
    });
  }

  /**
   * Get Admin Two-Sided Token & Brokerage Usage Report
   */
  static async getAdminTokenReport(filter = {}) {
    const where = {
      walletType: 'TOKEN',
      type: 'DEBIT',
      OR: [
        { reason: { startsWith: 'ALGO_ENTRY:' } },
        { reason: { startsWith: 'ALGO_EXIT:' } }
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
    let totalTokensUsed = 0;

    for (const d of debits) {
      const uid = d.userId;
      const isEntry = d.reason.startsWith('ALGO_ENTRY:');
      let meta = {};
      try {
        const parts = d.reason.split('|');
        if (parts.length > 1) meta = JSON.parse(parts[1]);
      } catch (_) {}

      if (!userSummary[uid]) {
        userSummary[uid] = {
          userId: uid,
          name: d.user?.name || 'Unknown',
          email: d.user?.email || 'N/A',
          studentId: d.user?.studentId || 'N/A',
          phone: d.user?.phone || 'N/A',
          entryTradesCount: 0,
          exitTradesCount: 0,
          totalTradesCount: 0,
          entryTokens: 0,
          exitTokens: 0,
          tokensUsed: 0,
          todayUsage: 0,
          lastTradeAt: d.timestamp,
          lastBrokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
          transactions: []
        };
      }

      if (isEntry) {
        userSummary[uid].entryTradesCount += 1;
        userSummary[uid].entryTokens += d.amount;
        totalEntries += 1;
      } else {
        userSummary[uid].exitTradesCount += 1;
        userSummary[uid].exitTokens += d.amount;
        totalExits += 1;
      }

      userSummary[uid].totalTradesCount += 1;
      userSummary[uid].tokensUsed += d.amount;
      totalTokensUsed += d.amount;

      if (d.timestamp >= todayStart) {
        userSummary[uid].todayUsage += d.amount;
      }

      userSummary[uid].transactions.push({
        ledgerId: d.id,
        eventType: isEntry ? 'ENTRY' : 'EXIT',
        amount: d.amount,
        timestamp: d.timestamp,
        symbol: meta.symbol || 'N/A',
        optionType: meta.optionType || 'N/A',
        quantity: meta.quantity || 65,
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

    return {
      success: true,
      summary: {
        totalAlgoEntries: totalEntries,
        totalAlgoExits: totalExits,
        totalTrades: totalEntries + totalExits,
        totalTokensUsed,
        totalTokensCollected: totalTokensUsed,
        uniqueUsersCount: userIds.length,
        feesConfig: await this.getConfiguredFees(),
        date: filter.dateStr || 'ALL_TIME'
      },
      users: Object.values(userSummary),
      recentDebits: debits.slice(0, 50).map(d => {
        let meta = {};
        try {
          const parts = d.reason.split('|');
          if (parts.length > 1) meta = JSON.parse(parts[1]);
        } catch (_) {}
        return {
          id: d.id,
          userId: d.userId,
          userName: d.user?.name,
          userEmail: d.user?.email,
          studentId: d.user?.studentId,
          eventType: d.reason.startsWith('ALGO_ENTRY:') ? 'ENTRY' : 'EXIT',
          symbol: meta.symbol || 'N/A',
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
