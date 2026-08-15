/**
 * RiskEngine — Hello Trader Pre-Execution Risk Validator
 *
 * Every order MUST pass through the Risk Engine before broker execution.
 *
 * Checks performed:
 *   1. Market hours (NSE: 09:15 - 15:30 IST)
 *   2. Emergency stop flag
 *   3. Max open trades limit
 *   4. Max daily loss limit
 *   5. Position size sanity check (qty > 0)
 *   6. Available capital check
 *   7. Duplicate/idempotent order check
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Market Hours Check (NSE) ────────────────────────────────────────────────
function isMarketOpen() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false; // Weekend
  const h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30; // 09:15 to 15:30
}

// ─── Risk Engine ─────────────────────────────────────────────────────────────
class RiskEngine {
  /**
   * Validate an incoming order against all risk rules.
   * @param {Object} order - Parsed order from webhook
   * @param {Object} connection - AlgoBrokerConnection from DB (with riskConfig)
   * @param {Object} [funds] - Broker funds { available, used, total }
   * @returns {Promise<{allowed: boolean, reason: string|null}>}
   */
  static async validate(order, connection, funds = null) {
    // 1. Market Hours
    if (!isMarketOpen()) {
      return { allowed: false, reason: 'MARKET_CLOSED: NSE market is not open (09:15–15:30 IST, Mon–Fri)' };
    }

    // 2. Emergency Stop
    if (connection.emergencyStop) {
      return { allowed: false, reason: 'EMERGENCY_STOP: Emergency stop is active for this connection' };
    }

    // 3. Quantity sanity
    if (!order.quantity || order.quantity <= 0) {
      return { allowed: false, reason: 'INVALID_QTY: Order quantity must be greater than 0' };
    }

    // 4. Max Open Trades
    if (connection.maxOpenTrades) {
      const openCount = await prisma.algoPosition.count({
        where: { userId: connection.userId, brokerId: connection.id, status: 'OPEN' }
      });
      if (openCount >= connection.maxOpenTrades) {
        return { allowed: false, reason: `MAX_OPEN_TRADES: Already at limit of ${connection.maxOpenTrades} open positions` };
      }
    }

    // 5. Max Daily Loss
    if (connection.maxDailyLoss && connection.maxDailyLoss > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayLoss = await prisma.algoPosition.aggregate({
        where: {
          userId: connection.userId,
          brokerId: connection.id,
          status: { in: ['CLOSED', 'SL_HIT'] },
          closedAt: { gte: todayStart },
          pnl: { lt: 0 },
        },
        _sum: { pnl: true }
      });
      const totalLoss = Math.abs(todayLoss._sum.pnl || 0);
      if (totalLoss >= connection.maxDailyLoss) {
        return { allowed: false, reason: `MAX_DAILY_LOSS: Daily loss of ₹${totalLoss.toFixed(0)} has reached the limit of ₹${connection.maxDailyLoss}` };
      }
    }

    // 6. Capital Check (if funds available)
    if (funds && funds.available !== undefined) {
      const estimatedCost = (order.price || 0) * order.quantity;
      if (estimatedCost > 0 && funds.available < estimatedCost * 0.9) {
        // Allow 10% margin buffer — MARKET orders don't need exact price
        if (order.orderType === 'LIMIT') {
          return { allowed: false, reason: `INSUFFICIENT_FUNDS: Available ₹${funds.available.toFixed(0)} < Required ₹${estimatedCost.toFixed(0)}` };
        }
      }
    }

    return { allowed: true, reason: null };
  }

  /**
   * Check if an incoming webhook is a duplicate (idempotency).
   * Uses a unique combination of webhookToken + symbol + action + timestamp window (5s).
   * @param {string} webhookToken
   * @param {string} symbol
   * @param {string} action
   * @returns {Promise<boolean>} isDuplicate
   */
  static async isDuplicateWebhook(webhookToken, symbol, action) {
    const windowMs = 5000; // 5 second dedup window
    const cutoff = new Date(Date.now() - windowMs);
    const existing = await prisma.algoWebhookLog.findFirst({
      where: {
        connection: { webhookToken },
        parsedSymbol: symbol,
        parsedAction: action,
        receivedAt: { gte: cutoff },
        executionStatus: { in: ['PENDING', 'EXECUTED'] },
      }
    });
    return !!existing;
  }
}

module.exports = { RiskEngine, isMarketOpen };
