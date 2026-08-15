/**
 * CopyEngine — Hello Trader Enterprise Copy Trading Queue & Execution Service
 *
 * Flow:
 *   1. Master places trade (via Webhook, Trading Desk, or Master Broker API)
 *   2. Master order emitted to CopyEngine.broadcastTrade(masterId, tradeOrder)
 *   3. CopyEngine queries active, consented followers for this master
 *   4. For each follower:
 *      a. Check global kill switch + master kill switch + follower kill switch + emergency stop
 *      b. Calculate follower quantity (FIXED_QTY, MULTIPLIER, PERCENTAGE)
 *      c. Validate through RiskEngine (market hours, max daily loss, max open trades)
 *      d. Queue execution task (with retry backoff for broker failures)
 *      e. Execute via BrokerGateway.executeOrder(followerOrder, followerConnection)
 *      f. Record in CopyTradeLog & AuditLog
 *      g. Push real-time Socket.io update to follower
 */

const { PrismaClient } = require('@prisma/client');
const { BrokerGateway } = require('./brokerGateway/BrokerGateway');
const { RiskEngine } = require('./riskEngine');
const { AuditLogger, CATEGORIES } = require('./auditLogger');

const prisma = new PrismaClient();

class CopyEngine {
  /**
   * Broadcast a master trade to all followers and execute asynchronously.
   * @param {Object} params
   * @param {string} params.masterUserId - User ID of the master trader
   * @param {Object} params.masterOrder - Master's order details { symbol, exchange, side, quantity, price, orderType, productType, sl, target }
   * @param {Object} [params.io] - Socket.io instance for real-time notifications
   * @returns {Promise<{success: boolean, followersQueued: number, logs: Array}>}
   */
  static async broadcastTrade({ masterUserId, masterOrder, io }) {
    try {
      // 1. Find master record
      const master = await prisma.copyMaster.findUnique({
        where: { userId: masterUserId },
        include: {
          followers: {
            where: { isActive: true, killSwitchActive: false, emergencyStop: false, consentAccepted: true },
            include: {
              user: true,
            }
          }
        }
      });

      if (!masterProfile) {
        return { success: false, message: 'Master trader profile not found', followersQueued: 0, logs: [] };
      }

      if (!masterProfile.isActive || masterProfile.killSwitch) {
        await AuditLogger.log({
          userId: masterProfile.userId,
          category: CATEGORIES.COPY,
          action: 'MASTER_TRADE_BLOCKED',
          detail: `Master trade broadcast blocked — Master profile is ${!masterProfile.isActive ? 'INACTIVE' : 'KILLED'}`,
          meta: { masterOrder },
        });
        return { success: false, message: 'Master profile is inactive or killed', followersQueued: 0, logs: [] };
      }

      const followers = (masterProfile.followers && masterProfile.followers.length > 0)
        ? masterProfile.followers
        : await prisma.copyFollower.findMany({ where: { masterId, isActive: true } });

      if (!followers || followers.length === 0) {
        return { success: true, message: 'No active followers to copy', followersQueued: 0, logs: [] };
      }

      console.log(`[CopyEngine] Broadcasting trade from Master ${master.displayName} to ${followers.length} followers...`);

      const executionLogs = [];

      for (const follower of followers) {
        try {
          const followerLog = await this._processFollowerTrade({
            master,
            follower,
            masterOrder,
            masterCopyOrder: masterCopyOrder || masterOrder,
            masterCopyOrderId: masterCopyOrder?.id || null,
            io
          });
          executionLogs.push(followerLog);
        } catch (err) {
          console.error(`[CopyEngine] Error processing follower ${follower.id}:`, err);
        }
      }

      return {
        success: true,
        message: `Broadcast complete: ${followers.length} followers processed`,
        followersQueued: followers.length,
        logs: executionLogs,
      };
    } catch (err) {
      console.error('[CopyEngine] Broadcast error:', err);
      return { success: false, message: err.message, followersQueued: 0, logs: [] };
    }
  }

  /**
   * Process individual follower copy execution.
   */
  static async _processFollowerTrade({ master, follower, masterOrder, masterCopyOrder, io, masterCopyOrderId = null }) {
    const followerUserId = follower.userId;

    // 1. Find follower's broker connection
    const connection = await prisma.algoBrokerConnection.findFirst({
      where: { id: follower.connectionId, userId: followerUserId, isActive: true, killSwitchActive: false }
    });

    if (!connection) {
      const tradeLog = await prisma.copyTradeLog.create({
        data: {
          masterId:         master.id,
          followerId:       follower.id,
          masterCopyOrderId: masterCopyOrderId,
          symbol:           masterOrder.symbol,
          side:             masterOrder.side,
          quantity:         0,
          price:            masterOrder.price || 0,
          eventType:        masterOrder.eventType || 'ENTRY',
          status:           'FAILED',
          errorMessage:     'No active broker connection found for follower',
        }
      });
      return tradeLog;
    }

    // 2. Calculate follower quantity based on allocation mode
    let followerQty = 1;
    if (follower.allocationType === 'FIXED_QTY') {
      followerQty = Math.max(1, Math.round(follower.allocationValue));
    } else if (follower.allocationType === 'MULTIPLIER') {
      followerQty = Math.max(1, Math.round(masterOrder.quantity * follower.allocationValue));
    } else if (follower.allocationType === 'PERCENTAGE') {
      followerQty = Math.max(1, Math.round((masterOrder.quantity * follower.allocationValue) / 100));
    }

    // Follower position size risk cap
    if (follower.maxPositionSize && followerQty > follower.maxPositionSize) {
      followerQty = Math.floor(follower.maxPositionSize);
    }

    // 3. Construct follower order
    const followerOrder = {
      symbol: masterOrder.symbol,
      exchange: masterOrder.exchange || 'NSE',
      side: masterOrder.side,
      quantity: followerQty,
      orderType: masterOrder.orderType || 'MARKET',
      productType: masterOrder.productType || 'MIS',
      price: masterOrder.price || 0,
      triggerPrice: masterOrder.sl || 0,
      sl: masterOrder.sl,
      target: masterOrder.target,
    };

    // Determine Parent Source: MASTER_ALGO vs MASTER_MANUAL
    const parentSource = masterCopyOrder.tradeSource === 'ALGO' ? 'MASTER_ALGO' : 'MASTER_MANUAL';
    const webhookLogId = masterCopyOrder.webhookLogId || null;

    // 4. Validate through RiskEngine
    const riskResult = await RiskEngine.validate(followerOrder, connection);
    if (!riskResult.allowed) {
      const tradeLog = await prisma.copyTradeLog.create({
        data: {
          masterId:          master.id,
          followerId:        follower.id,
          masterCopyOrderId: masterCopyOrderId,
          symbol:            masterOrder.symbol,
          side:              masterOrder.side,
          quantity:          followerQty,
          price:             masterOrder.price || 0,
          eventType:         masterOrder.eventType || 'ENTRY',
          tradeSource:       'COPY',
          parentSource,
          webhookLogId,
          status:            'RISK_REJECTED',
          riskReason:        riskResult.reason,
        }
      });

      await AuditLogger.log({
        userId: followerUserId,
        category: CATEGORIES.COPY,
        action: 'COPY_RISK_REJECTED',
        detail: `Copy trade (${parentSource}) rejected for follower: ${riskResult.reason}`,
        meta: { masterId: master.id, followerId: follower.id, parentSource, riskResult },
      });

      if (io) {
        io.to(followerUserId).emit('copy_trade_update', {
          status: 'RISK_REJECTED',
          symbol: masterOrder.symbol,
          parentSource,
          reason: riskResult.reason,
        });
      }

      return tradeLog;
    }

    // 5. Create initial CopyTradeLog
    const tradeLog = await prisma.copyTradeLog.create({
      data: {
        masterId:          master.id,
        followerId:        follower.id,
        masterCopyOrderId: masterCopyOrderId,
        symbol:            masterOrder.symbol,
        side:              masterOrder.side,
        quantity:          followerQty,
        price:             masterOrder.price || 0,
        eventType:         masterOrder.eventType || 'ENTRY',
        tradeSource:       'COPY',
        parentSource,
        webhookLogId,
        status:            'QUEUED',
      }
    });

    // 6. Execute Order via BrokerGateway with retry backoff
    const execResult = await BrokerGateway.executeOrder(followerOrder, connection);

    // 7. Update CopyTradeLog
    const updatedLog = await prisma.copyTradeLog.update({
      where: { id: tradeLog.id },
      data: {
        status: execResult.success ? 'EXECUTED' : 'FAILED',
        followerOrderId: execResult.orderId || null,
        errorMessage: execResult.success ? null : execResult.message,
        retryCount: execResult.attempts || 1,
        executedAt: execResult.success ? new Date() : null,
      }
    });

    // 8. Audit Log
    await AuditLogger.log({
      userId: followerUserId,
      category: CATEGORIES.COPY,
      action: execResult.success ? 'COPY_TRADE_EXECUTED' : 'COPY_TRADE_FAILED',
      detail: execResult.success
        ? `Copied ${masterOrder.side} ${followerQty} ${masterOrder.symbol} from Master ${master.displayName}`
        : `Failed to copy trade from Master ${master.displayName}: ${execResult.message}`,
      meta: { masterId: master.id, followerId: follower.id, execResult },
    });

    // 9. Real-time Socket.io Notification
    if (io) {
      io.to(followerUserId).emit('copy_trade_update', {
        id: updatedLog.id,
        masterName: master.displayName,
        symbol: masterOrder.symbol,
        side: masterOrder.side,
        qty: followerQty,
        status: execResult.success ? 'EXECUTED' : 'FAILED',
        orderId: execResult.orderId,
        message: execResult.message,
      });
    }

    return updatedLog;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // replicateFill() — Broker-Poll Copy Trading (NEW)
  // Called by MasterOrderPoller when a real fill is detected on master's broker.
  // COMPLETELY INDEPENDENT from broadcastTrade() / Algo Trading webhook flow.
  // ─────────────────────────────────────────────────────────────────────────
  static async replicateFill({ master, masterCopyOrder, deltaQty, tradeSource, webhookLogId, io }) {
    try {
      const masterId = master.id || masterCopyOrder.masterId;
      const followers = (master.followers && master.followers.length > 0)
        ? master.followers
        : await prisma.copyFollower.findMany({
            where: { masterId, isActive: true, killSwitchActive: false, emergencyStop: false, consentAccepted: true }
          });

      if (!followers || followers.length === 0) {
        return { success: true, message: 'No active followers', followersProcessed: 0, logs: [] };
      }

      if (!deltaQty || deltaQty <= 0) {
        return { success: true, message: 'No new qty to replicate', followersProcessed: 0, logs: [] };
      }

      console.log(`[CopyEngine] replicateFill: ${masterCopyOrder.eventType} ${masterCopyOrder.side} Δ${deltaQty} ${masterCopyOrder.symbol} → ${followers.length} follower(s)`);

      const masterOrder = {
        symbol:      masterCopyOrder.symbol,
        exchange:    masterCopyOrder.exchange || 'NSE',
        side:        masterCopyOrder.side,
        quantity:    deltaQty,
        price:       masterCopyOrder.avgPrice || 0,
        orderType:   'MARKET',
        productType: masterCopyOrder.productType || 'MIS',
        sl:          null,
        target:      null,
        eventType:   masterCopyOrder.eventType,
      };

      const logs = [];
      for (const follower of followers) {
        try {
          const log = await this._processFollowerTrade({
            master,
            follower,
            masterOrder,
            masterCopyOrder,
            io,
            masterCopyOrderId: masterCopyOrder.id,
          });
          logs.push(log);
        } catch (err) {
          console.error(`[CopyEngine] replicateFill follower error ${follower.id}:`, err.message);
        }
      }

      await this._updateMasterStats(master.id);

      return {
        success: true,
        message: `Replicated to ${followers.length} follower(s)`,
        followersProcessed: followers.length,
        logs,
      };
    } catch (err) {
      console.error('[CopyEngine] replicateFill error:', err.message);
      return { success: false, message: err.message, followersProcessed: 0, logs: [] };
    }
  }

  static async _updateMasterStats(masterId) {
    try {
      const logs = await prisma.copyTradeLog.findMany({
        where: { masterId, status: { in: ['EXECUTED', 'FAILED'] } },
        select: { status: true }
      });
      const total = logs.length;
      const won   = logs.filter(l => l.status === 'EXECUTED').length;
      const winRate = total > 0 ? Math.round((won / total) * 100 * 10) / 10 : 0;
      await prisma.copyMaster.update({
        where: { id: masterId },
        data: { totalTrades: total, winRate }
      });
    } catch (err) {
      console.error('[CopyEngine] _updateMasterStats error:', err.message);
    }
  }
}

module.exports = { CopyEngine };

