/**
 * algoTokenBillingService.js
 * Backend-only idempotent token billing for successful Algo Trading entries.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { AuditLogger, CATEGORIES } = require('./auditLogger');

class AlgoTokenBillingService {
  /**
   * Get configured token charge per successful trade entry.
   * Default: 15 tokens per entry (or from SystemSettings.algoBrokerageTiersJson).
   */
  static async getConfiguredTokensPerTrade() {
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      if (settings?.algoBrokerageTiersJson) {
        const parsed = JSON.parse(settings.algoBrokerageTiersJson);
        if (parsed?.perTradeTokens && Number(parsed.perTradeTokens) > 0) {
          return Number(parsed.perTradeTokens);
        }
      }
      return 15;
    } catch (_) {
      return 15;
    }
  }

  /**
   * Deduct tokens for a successful algo entry order with idempotency protection.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.connectionId
   * @param {string} params.brokerOrderId
   * @param {string} params.symbol
   * @param {string} params.orderAction
   * @param {number} [params.tokensToDeduct]
   * @param {Object} [params.req]
   * @returns {Promise<{ success: boolean, deducted: number, remainingBalance: number, reason: string }>}
   */
  static async deductEntryFee({ userId, connectionId, brokerOrderId, symbol, orderAction, tokensToDeduct, req }) {
    if (!userId || !brokerOrderId) {
      return { success: false, deducted: 0, reason: 'MISSING_USER_OR_ORDER_ID' };
    }

    const idempotentRef = `ALGO_ENTRY:${userId}:${connectionId || 'default'}:${brokerOrderId}`;

    // 1. Idempotency check: Ensure this exact broker order ID has not already been billed
    const existingLedger = await prisma.ledger.findFirst({
      where: {
        userId,
        walletType: 'TOKEN',
        reason: idempotentRef
      }
    });

    if (existingLedger) {
      await AuditLogger.log({
        userId,
        category: CATEGORIES.SETTINGS,
        action: 'TOKEN_DEBIT_SKIPPED',
        detail: `Token deduction skipped: Order ${brokerOrderId} on ${symbol} was already billed (${existingLedger.amount} tokens).`,
        meta: { brokerOrderId, symbol, idempotentRef },
        req
      });
      return { success: true, deducted: 0, reason: 'ALREADY_BILLED', isIdempotentDuplicate: true };
    }

    const amount = tokensToDeduct || await this.getConfiguredTokensPerTrade();

    // 2. Create Ledger DEBIT entry
    const ledgerEntry = await prisma.ledger.create({
      data: {
        userId,
        walletType: 'TOKEN',
        amount,
        type: 'DEBIT',
        reason: idempotentRef
      }
    });

    // 3. Compute remaining user token balance
    const userLedgers = await prisma.ledger.findMany({
      where: { userId, walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] } }
    });
    let remainingTokens = 0;
    userLedgers.forEach(l => {
      remainingTokens += (l.type === 'CREDIT' ? l.amount : -l.amount);
    });

    // 4. Audit Log
    await AuditLogger.log({
      userId,
      category: CATEGORIES.SETTINGS,
      action: 'TOKEN_DEBITED',
      detail: `Algo Entry Fee: Debited ${amount} tokens for ${orderAction} on ${symbol} (OrderID: ${brokerOrderId}). Remaining: ${remainingTokens} tokens.`,
      meta: {
        amount,
        brokerOrderId,
        symbol,
        orderAction,
        idempotentRef,
        remainingTokens,
        ledgerId: ledgerEntry.id
      },
      req
    });

    return {
      success: true,
      deducted: amount,
      remainingBalance: Math.max(0, remainingTokens),
      ledgerId: ledgerEntry.id,
      reason: 'ENTRY_FEE_BILLED'
    };
  }

  /**
   * Get Admin Token & Brokerage Usage Report
   * @param {Object} filter
   * @param {string} [filter.dateStr] "YYYY-MM-DD"
   * @returns {Promise<Object>}
   */
  static async getAdminTokenReport(filter = {}) {
    const where = {
      walletType: 'TOKEN',
      type: 'DEBIT',
      reason: { startsWith: 'ALGO_ENTRY:' }
    };

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
    let totalTokensUsed = 0;

    for (const d of debits) {
      const uid = d.userId;
      if (!userSummary[uid]) {
        userSummary[uid] = {
          userId: uid,
          name: d.user?.name || 'Unknown',
          email: d.user?.email || 'N/A',
          studentId: d.user?.studentId || 'N/A',
          phone: d.user?.phone || 'N/A',
          algoEntriesCount: 0,
          tokensUsed: 0,
          lastTradeAt: d.timestamp,
          lastBrokerOrderId: d.reason.split(':')[3] || 'N/A',
          transactions: []
        };
      }

      userSummary[uid].algoEntriesCount += 1;
      userSummary[uid].tokensUsed += d.amount;
      userSummary[uid].transactions.push({
        ledgerId: d.id,
        amount: d.amount,
        timestamp: d.timestamp,
        reason: d.reason,
        brokerOrderId: d.reason.split(':')[3] || 'N/A'
      });

      totalEntries += 1;
      totalTokensUsed += d.amount;
    }

    const userIds = Object.keys(userSummary);
    for (const uid of userIds) {
      const allUserLedgers = await prisma.ledger.findMany({
        where: { userId: uid, walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] } }
      });
      let bal = 0;
      allUserLedgers.forEach(l => {
        bal += (l.type === 'CREDIT' ? l.amount : -l.amount);
      });
      userSummary[uid].remainingTokens = Math.max(0, bal);
    }

    return {
      success: true,
      summary: {
        totalAlgoEntries: totalEntries,
        totalTokensUsed,
        totalTokensCollected: totalTokensUsed,
        uniqueUsersCount: userIds.length,
        date: filter.dateStr || 'ALL_TIME'
      },
      users: Object.values(userSummary),
      recentDebits: debits.slice(0, 50).map(d => ({
        id: d.id,
        userId: d.userId,
        userName: d.user?.name,
        userEmail: d.user?.email,
        studentId: d.user?.studentId,
        amount: d.amount,
        timestamp: d.timestamp,
        brokerOrderId: d.reason.split(':')[3] || 'N/A',
        reason: d.reason
      }))
    };
  }
}

module.exports = { AlgoTokenBillingService };
