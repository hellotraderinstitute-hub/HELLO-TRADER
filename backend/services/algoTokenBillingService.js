/**
 * algoTokenBillingService.js
 * Backend-only dynamic per-lot two-sided token billing for Algo Trading.
 * 
 * Dynamic Pricing Policy:
 *   - Entry Token Fee: Configured fee per lot (Default: 15 tokens/lot) debited ONLY after confirmed live entry fill.
 *   - Exit Token Fee: Configured fee per lot (Default: 15 tokens/lot) debited ONLY after confirmed live exit square-off.
 *   - Calculation:
 *       1 Lot Entry  = 15 tokens
 *       5 Lots Entry = 75 tokens
 *       5 Lots Exit  = 75 tokens
 *       Complete 5-Lot Round Trip = 150 tokens
 *   - Strict Exclusions: Failed, rejected, blocked, duplicate, manual, or connection charge records deduct 0 tokens.
 *   - User Wallet Statement: ALGO_ENTRY / ALGO_EXIT with symbol, CE/PE, lots, quantity, orderId, deducted, before & after balance.
 *   - Admin Reporting: User-wise Entry Trades, Exit Trades, Entry Lots, Exit Lots, Entry Tokens, Exit Tokens, Total Collected, Remaining.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AuditLogger, CATEGORIES } = require('./auditLogger');

class AlgoTokenBillingService {
  /**
   * Get configured per-lot token fees for entry and exit.
   * Default: 15 tokens/lot entry, 15 tokens/lot exit.
   */
  static async getConfiguredPerLotFees() {
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      let entryFeePerLot = 15;
      let exitFeePerLot = 15;

      if (settings?.algoBrokerageTiersJson) {
        const parsed = JSON.parse(settings.algoBrokerageTiersJson);
        if (parsed?.entryFeePerLot !== undefined) entryFeePerLot = Number(parsed.entryFeePerLot);
        else if (parsed?.perLotTokens !== undefined) {
          entryFeePerLot = Number(parsed.perLotTokens);
          exitFeePerLot = Number(parsed.perLotTokens);
        } else if (parsed?.perTradeTokens !== undefined) {
          entryFeePerLot = Number(parsed.perTradeTokens);
          exitFeePerLot = Number(parsed.perTradeTokens);
        } else if (parsed?.entryFee !== undefined) {
          entryFeePerLot = Number(parsed.entryFee);
        }

        if (parsed?.exitFeePerLot !== undefined) exitFeePerLot = Number(parsed.exitFeePerLot);
        else if (parsed?.exitFee !== undefined) exitFeePerLot = Number(parsed.exitFee);
      }

      return {
        entryFeePerLot,
        exitFeePerLot,
        roundTripPerLot: entryFeePerLot + exitFeePerLot
      };
    } catch (_) {
      return { entryFeePerLot: 15, exitFeePerLot: 15, roundTripPerLot: 30 };
    }
  }

  /**
   * Calculate entry tokens based on lot count.
   */
  static async calculateEntryTokens(lots) {
    const lotCount = Math.max(1, parseInt(lots || 1));
    const { entryFeePerLot } = await this.getConfiguredPerLotFees();
    return entryFeePerLot * lotCount;
  }

  /**
   * Calculate exit tokens based on lot count.
   */
  static async calculateExitTokens(lots) {
    const lotCount = Math.max(1, parseInt(lots || 1));
    const { exitFeePerLot } = await this.getConfiguredPerLotFees();
    return exitFeePerLot * lotCount;
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
   * Deduct Entry Token Fee (Configured Fee * Lots) upon successful live algo entry execution.
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
        detail: `Entry token debit skipped: Order ${brokerOrderId} on ${symbol} already billed (${existing.amount} tokens).`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const lotCount = lots || Math.max(1, Math.round((quantity || 65) / (symbol?.includes('BANKNIFTY') ? 15 : (symbol?.includes('FINNIFTY') ? 40 : 65))));
    const amount = await this.calculateEntryTokens(lotCount);
    const { entryFeePerLot } = await this.getConfiguredPerLotFees();

    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const optionType = symbol?.endsWith('CE') ? 'CE' : (symbol?.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason
    const ledgerMetadata = {
      type: 'ALGO_ENTRY',
      symbol,
      optionType,
      lots: lotCount,
      quantity: quantity || (lotCount * 65),
      brokerOrderId,
      tradeId: tradeId || null,
      tokensDeducted: amount,
      perLotFee: entryFeePerLot,
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
      detail: `Algo Entry Fee: Debited ${amount} tokens (${lotCount} lot(s) @ ${entryFeePerLot}/lot) for ${orderAction || 'BUY'} ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: amount,
      lots: lotCount,
      perLotFee: entryFeePerLot,
      balanceBefore,
      balanceAfter,
      ledgerId: ledgerEntry.id,
      reason: 'ENTRY_FEE_BILLED'
    };
  }

  /**
   * Deduct Exit Token Fee (Configured Fee * Lots) upon successful live algo exit square-off.
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
        detail: `Exit token debit skipped: Order ${brokerOrderId} on ${symbol} already billed (${existing.amount} tokens).`,
        meta: { brokerOrderId, symbol, idempotentRef }, req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const lotCount = lots || Math.max(1, Math.round((quantity || 65) / (symbol?.includes('BANKNIFTY') ? 15 : (symbol?.includes('FINNIFTY') ? 40 : 65))));
    const amount = await this.calculateExitTokens(lotCount);
    const { exitFeePerLot } = await this.getConfiguredPerLotFees();

    const balanceBefore = await this.getUserTokenBalance(userId);
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const optionType = symbol?.endsWith('CE') ? 'CE' : (symbol?.endsWith('PE') ? 'PE' : 'EQ');

    // 2. Format Structured Ledger Reason
    const ledgerMetadata = {
      type: 'ALGO_EXIT',
      symbol,
      optionType,
      lots: lotCount,
      quantity: quantity || (lotCount * 65),
      brokerOrderId,
      tradeId: tradeId || null,
      tokensDeducted: amount,
      perLotFee: exitFeePerLot,
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
      detail: `Algo Exit Fee: Debited ${amount} tokens (${lotCount} lot(s) @ ${exitFeePerLot}/lot) for EXIT on ${symbol} (OrderID: ${brokerOrderId}). Balance: ${balanceBefore} -> ${balanceAfter}.`,
      meta: { ...ledgerMetadata, ledgerId: ledgerEntry.id }, req
    });

    return {
      success: true,
      deducted: amount,
      lots: lotCount,
      perLotFee: exitFeePerLot,
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
      const lots = meta.lots || Math.max(1, Math.round((meta.quantity || 65) / (meta.symbol?.includes('BANKNIFTY') ? 15 : 65)));
      return {
        id: d.id,
        timestamp: d.timestamp,
        eventType: isEntry ? 'ALGO_ENTRY' : 'ALGO_EXIT',
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
   * Get Admin Two-Sided Token & Brokerage Usage Report
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
    let totalTradeFeeTokens = 0;
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
          entryTokens: 0,
          exitTokens: 0,
          tradeFeeTokens: 0,
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
        userSummary[uid].entryTokens += d.amount;
        userSummary[uid].tradeFeeTokens += d.amount;
        totalEntries += 1;
        totalEntryLots += lots;
        totalTradeFeeTokens += d.amount;
      } else if (isExit) {
        userSummary[uid].exitTrades += 1;
        userSummary[uid].exitLots += lots;
        userSummary[uid].exitTokens += d.amount;
        userSummary[uid].tradeFeeTokens += d.amount;
        totalExits += 1;
        totalExitLots += lots;
        totalTradeFeeTokens += d.amount;
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

    return {
      success: true,
      summary: {
        tradeFees: {
          totalAlgoEntries: totalEntries,
          totalAlgoExits: totalExits,
          totalEntryLots,
          totalExitLots,
          totalTrades: totalEntries + totalExits,
          totalTradeFeeTokens,
        },
        connectionCharges: {
          totalConnectionEvents,
          totalConnectionTokens,
        },
        grandTotalTokensCollected: totalTradeFeeTokens + totalConnectionTokens,
        uniqueUsersCount: userIds.length,
        feesConfig: await this.getConfiguredPerLotFees(),
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
          symbol: meta.symbol || (isConnection ? d.reason : 'N/A'),
          lots: isConnection ? null : lots,
          quantity: isConnection ? null : (meta.quantity || (lots * 65)),
          amount: d.amount,
          timestamp: d.timestamp,
          brokerOrderId: meta.brokerOrderId || d.reason.split(':')[3]?.split('|')[0] || 'N/A',
          balanceBefore: meta.balanceBefore,
        };
      })
    };
  }
}

module.exports = { AlgoTokenBillingService };
