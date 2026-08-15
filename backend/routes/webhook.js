/**
 * webhook.js — TradingView Webhook Receiver
 *
 * PUBLIC endpoint (no JWT auth) — secured via per-connection webhookToken.
 *
 * Flow:
 *   1. TradingView POST /webhook/tv/:webhookToken
 *   2. Lookup connection by webhookToken
 *   3. Check global kill switch → connection kill switch
 *   4. Idempotency check (dedup within 5s window)
 *   5. Parse & validate payload
 *   6. Risk Engine validation
 *   7. Execute via BrokerGateway
 *   8. Log everything to AuditLog + AlgoWebhookLog
 *   9. Emit real-time Socket.io event to user's room
 *
 * COMPLIANCE:
 *   - Every webhook, risk decision, broker request, and response is logged.
 *   - Idempotent processing prevents duplicate orders.
 *   - Kill switch at connection level AND global level.
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { BrokerGateway } = require('../services/brokerGateway/BrokerGateway');
const { RiskEngine } = require('../services/riskEngine');
const { AuditLogger, CATEGORIES } = require('../services/auditLogger');

const prisma = new PrismaClient();

// ─── POST /webhook/tv/:webhookToken ──────────────────────────
router.post('/tv/:webhookToken', async (req, res) => {
  const { webhookToken } = req.params;
  const rawPayload = JSON.stringify(req.body);
  const receivedAt = new Date();

  // Immediately ACK TradingView (must respond within 10s)
  res.status(200).json({ status: 'received', timestamp: receivedAt.toISOString() });

  // Process asynchronously
  setImmediate(async () => {
    let webhookLog = null;

    try {
      // 1. Find connection by webhookToken
      const connection = await prisma.algoBrokerConnection.findUnique({
        where: { webhookToken }
      });

      if (!connection) {
        console.warn(`[Webhook] Unknown token: ${webhookToken.slice(0, 8)}...`);
        return;
      }

      const userId = connection.userId;
      const io = req.io;

      const emitUpdate = (event, data) => {
        if (io) io.to(userId).emit(event, data);
      };

      // 2. Log receipt immediately (raw payload preserved for audit)
      webhookLog = await prisma.algoWebhookLog.create({
        data: {
          userId,
          connectionId: connection.id,
          rawPayload,
          executionStatus: 'PENDING',
          receivedAt,
        }
      });

      await AuditLogger.log({
        userId, category: CATEGORIES.WEBHOOK, action: 'WEBHOOK_RECEIVED',
        detail: `Webhook received for ${connection.broker} (${connection.displayName})`,
        meta: { connectionId: connection.id, webhookLogId: webhookLog.id, rawPayload },
      });

      emitUpdate('algo_webhook', {
        id: webhookLog.id, broker: connection.broker,
        status: 'RECEIVED', receivedAt, rawPayload: req.body,
      });

      // 3. Global kill switch check
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      if (settings?.globalKillSwitch) {
        await updateLog(webhookLog.id, 'SKIPPED', null, 'GLOBAL_KILL_SWITCH_ACTIVE');
        await AuditLogger.log({ userId, category: CATEGORIES.KILL, action: 'WEBHOOK_BLOCKED',
          detail: 'Webhook blocked — Global Kill Switch is active', meta: { webhookLogId: webhookLog.id } });
        emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: 'GLOBAL_KILL_SWITCH' });
        return;
      }

      // 4. Connection kill switch check
      if (connection.killSwitchActive) {
        await updateLog(webhookLog.id, 'SKIPPED', null, 'CONNECTION_KILL_SWITCH_ACTIVE');
        await AuditLogger.log({ userId, category: CATEGORIES.KILL, action: 'WEBHOOK_BLOCKED',
          detail: `Webhook blocked — Kill switch active on ${connection.broker}`, meta: { webhookLogId: webhookLog.id } });
        emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: 'CONNECTION_KILL_SWITCH' });
        return;
      }

      // 5. Parse payload & determine Mode (Mode A: Explicit Symbol vs Mode B: Saved User Configuration)
      const body = req.body;
      const action = (body.action || body.side || '').toUpperCase(); // BUY | SELL | EXIT
      let rawSymbol = body.symbol || body.ticker || '';
      let qty       = parseInt(body.qty || body.quantity || 0);
      let sl        = parseFloat(body.sl || body.stoploss || 0) || null;
      let target    = parseFloat(body.target || body.tp || 0) || null;
      let product   = (body.product || body.productType || 'MIS').toUpperCase();
      let orderType = (body.order_type || body.orderType || 'MARKET').toUpperCase();
      let exchange  = (body.exchange || 'NSE').toUpperCase();
      let securityId = body.securityId || '';

      const trailSL     = !!(body.trail_sl || body.trailSL);
      const trailOffset = parseFloat(body.trail_offset || body.trailOffset || 0) || null;

      if (!action) {
        await updateLog(webhookLog.id, 'FAILED', null, 'MISSING_REQUIRED_FIELD: action (BUY | SELL | EXIT)');
        return;
      }

      // Check if explicit contract symbol provided (Mode A) e.g. "NIFTY25AUG24400CE" or specific ticker
      const isExplicitSymbol = rawSymbol && (
        rawSymbol.endsWith('CE') || rawSymbol.endsWith('PE') ||
        rawSymbol.endsWith('FUT') || rawSymbol.length > 8 ||
        (!['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(rawSymbol.toUpperCase()) && rawSymbol.length > 0)
      );

      let finalSymbol = rawSymbol;
      let signalPrice = null;
      let resolvedContractStr = null;

      const AlgoOptionResolver = require('../services/algoOptionResolver');

      if (!isExplicitSymbol && (action === 'BUY' || action === 'SELL')) {
        // ── MODE B: Saved User BUY / SELL Configuration ───────────────
        const direction = action === 'BUY' ? 'UPSIDE' : 'DOWNSIDE';

        const triggerConfig = await prisma.algoTriggerConfig.findUnique({
          where: { connectionId_direction: { connectionId: connection.id, direction } }
        });

        if (!triggerConfig || !triggerConfig.enabled) {
          const reason = `SIGNAL_DISABLED: ${direction} (${action}) signal configuration is disabled or not configured.`;
          await updateLog(webhookLog.id, 'SKIPPED', null, reason);
          await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'CONFIG_DISABLED', detail: reason, meta: { direction } });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason });
          return;
        }

        // Auto-close opposite open position if exitOnOpposite is enabled
        if (triggerConfig.exitOnOpposite) {
          const oppositeSide = action === 'BUY' ? 'SELL' : 'BUY';
          const oppositePos = await prisma.algoPosition.findFirst({
            where: { userId, connectionId: connection.id, status: 'OPEN' }
          });
          if (oppositePos && oppositePos.side === oppositeSide) {
            console.log(`[Webhook] Exit-on-Opposite: Closing open ${oppositePos.side} position for ${oppositePos.symbol}...`);
            const exitOrder = {
              symbol: oppositePos.symbol, exchange: oppositePos.exchange || 'NFO',
              side: action === 'BUY' ? 'SELL' : 'BUY', quantity: oppositePos.quantity,
              orderType: 'MARKET', productType: oppositePos.productType
            };
            await BrokerGateway.executeOrder(exitOrder, connection).catch(() => {});
            await prisma.algoPosition.update({
              where: { id: oppositePos.id },
              data: { status: 'MANUALLY_CLOSED', closedAt: new Date() }
            }).catch(() => {});
          }
        }

        // Resolve Dynamic Option Contract
        const resolved = await AlgoOptionResolver.resolveContract(triggerConfig);
        if (!resolved.success || !resolved.tradingSymbol) {
          const reason = resolved.error || 'OPTION_CONTRACT_NOT_AVAILABLE: Could not resolve option contract.';
          await updateLog(webhookLog.id, 'FAILED', null, reason);
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason });
          return;
        }

        finalSymbol  = resolved.tradingSymbol;
        securityId   = resolved.securityId || '';
        qty          = resolved.quantity;
        exchange     = resolved.exchange;
        product      = resolved.productType;
        orderType    = 'MARKET';
        signalPrice  = resolved.spotPrice;
        resolvedContractStr = `${resolved.tradingSymbol} (${resolved.optionType} ${resolved.strike})`;

        console.log(`[Webhook] Mode B Resolved: ${action} -> ${finalSymbol} (Qty: ${qty}, Spot: ${signalPrice})`);
      } else {
        // ── MODE A: Explicit Symbol ──────────────────────────────────
        signalPrice = await AlgoOptionResolver.getSpotPrice(rawSymbol || 'NIFTY').catch(() => null);
        resolvedContractStr = rawSymbol;
      }

      // Update log with parsed & resolved values
      await prisma.algoWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          parsedSymbol: finalSymbol, parsedAction: action,
          parsedQty: qty, parsedSL: sl, parsedTarget: target,
          parsedProduct: product, parsedOrderType: orderType,
          signalPrice, resolvedContract: resolvedContractStr,
        }
      });

      if (!action || !finalSymbol || !qty || qty <= 0) {
        await updateLog(webhookLog.id, 'FAILED', null, 'MISSING_REQUIRED_FIELDS: action, symbol, qty');
        await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'PARSE_FAILED',
          detail: 'Webhook payload missing required fields', meta: { action, finalSymbol, qty } });
        return;
      }

      // 6. Idempotency: dedup within 5s
      const idempotencyKey = `${connection.id}:${finalSymbol}:${action}:${Math.floor(Date.now() / 5000)}`;
      const existing = await prisma.algoWebhookLog.findFirst({
        where: {
          idempotencyKey,
          id: { not: webhookLog.id },
          executionStatus: { in: ['PENDING', 'EXECUTED'] }
        }
      });
      if (existing) {
        await updateLog(webhookLog.id, 'SKIPPED', null, 'DUPLICATE_WITHIN_5S_WINDOW');
        await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'DUPLICATE_SKIPPED',
          detail: `Duplicate webhook skipped: ${finalSymbol} ${action}`, meta: { idempotencyKey } });
        return;
      }
      await prisma.algoWebhookLog.update({ where: { id: webhookLog.id }, data: { idempotencyKey } });

      // 7. Handle EXIT action
      if (action === 'EXIT') {
        const openPos = await prisma.algoPosition.findFirst({
          where: { userId, connectionId: connection.id, status: 'OPEN' }
        });
        if (openPos) {
          const exitSide = openPos.side === 'BUY' ? 'SELL' : 'BUY';
          const exitOrder = {
            symbol: openPos.symbol, exchange: openPos.exchange || exchange, side: exitSide,
            quantity: openPos.quantity, orderType: 'MARKET', productType: openPos.productType,
          };
          const exitResult = await BrokerGateway.executeOrder(exitOrder, connection);
          if (exitResult.success) {
            await prisma.algoPosition.update({
              where: { id: openPos.id },
              data: { status: 'MANUALLY_CLOSED', exitOrderId: exitResult.orderId, closedAt: new Date() }
            });
          }
          await updateLog(webhookLog.id, exitResult.success ? 'EXECUTED' : 'FAILED',
            exitResult.orderId, exitResult.success ? null : exitResult.message);
          await AuditLogger.log({ userId, category: CATEGORIES.POSITION, action: exitResult.success ? 'POSITION_CLOSED' : 'CLOSE_FAILED',
            detail: `EXIT signal: ${openPos.symbol}. ${exitResult.message}`, meta: { positionId: openPos.id, exitResult } });
          emitUpdate('algo_execution', { symbol: openPos.symbol, action: 'EXIT', status: exitResult.success ? 'EXECUTED' : 'FAILED' });
        }
        return;
      }

      // 8. Risk Engine Validation
      const funds = await BrokerGateway.getFunds(connection).catch(() => null);
      const order = { symbol: finalSymbol, securityId, exchange, side: action, quantity: qty, orderType, productType: product,
                      price: parseFloat(body.price || 0) || null, triggerPrice: sl, sl, target };
      const riskResult = await RiskEngine.validate(order, connection, funds);

      await AuditLogger.log({
        userId, category: CATEGORIES.RISK,
        action: riskResult.allowed ? 'RISK_PASSED' : 'RISK_FAILED',
        detail: riskResult.allowed ? `Risk check passed for ${finalSymbol} ${action}` : `Risk check FAILED: ${riskResult.reason}`,
        meta: { symbol: finalSymbol, action, qty, riskResult, webhookLogId: webhookLog.id }
      });

      if (!riskResult.allowed) {
        await updateLog(webhookLog.id, 'RISK_REJECTED', null, riskResult.reason);
        await prisma.algoWebhookLog.update({ where: { id: webhookLog.id }, data: { riskReason: riskResult.reason } });
        emitUpdate('algo_webhook', { id: webhookLog.id, status: 'RISK_REJECTED', reason: riskResult.reason });
        return;
      }

      emitUpdate('algo_webhook', { id: webhookLog.id, status: 'RISK_PASSED', symbol: finalSymbol, action });

      // 9. Execute Order via BrokerGateway
      await AuditLogger.log({ userId, category: CATEGORIES.ORDER, action: 'ORDER_SENT',
        detail: `Sending ${action} order for ${finalSymbol} qty:${qty} to ${connection.broker}`,
        meta: { order, connectionId: connection.id } });

      const execResult = await BrokerGateway.executeOrder(order, connection);

      const actualFillPrice = execResult.rawResponse?.averageTradedPrice || execResult.rawResponse?.price || order.price || null;

      await AuditLogger.log({
        userId, category: CATEGORIES.ORDER,
        action: execResult.success ? 'ORDER_ACCEPTED' : 'ORDER_REJECTED',
        detail: execResult.success
          ? `Broker ${connection.broker} accepted order. OrderID: ${execResult.orderId}`
          : `Broker ${connection.broker} rejected order: ${execResult.message}`,
        meta: { execResult, webhookLogId: webhookLog.id }
      });

      await prisma.algoWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          executionStatus: execResult.success ? 'EXECUTED' : 'FAILED',
          brokerOrderId: execResult.orderId || null,
          errorMessage: execResult.success ? null : execResult.message,
          actualFillPrice,
          executedAt: new Date(),
        }
      });

      emitUpdate('algo_execution', {
        id: webhookLog.id, symbol, action, qty,
        status: execResult.success ? 'EXECUTED' : 'FAILED',
        orderId: execResult.orderId,
        broker: connection.broker,
        message: execResult.message,
      });

      // 10. Create position record if executed
      if (execResult.success && action !== 'EXIT') {
        const position = await prisma.algoPosition.create({
          data: {
            userId, connectionId: connection.id,
            symbol, exchange, side: action,
            quantity: qty, entryPrice: parseFloat(body.price || 0),
            productType: product,
            slPrice: sl, targetPrice: target,
            trailSL, trailOffset,
            currentSL: sl,
            status: 'OPEN',
            brokerOrderId: execResult.orderId,
          }
        });

        await AuditLogger.log({ userId, category: CATEGORIES.POSITION, action: 'POSITION_OPENED',
          detail: `Position opened: ${action} ${qty} ${symbol} @ broker ${connection.broker}`,
          meta: { positionId: position.id, orderId: execResult.orderId } });

        emitUpdate('algo_position', { type: 'OPENED', position: { id: position.id, symbol, side: action, qty, status: 'OPEN' } });
      }

    } catch (err) {
      console.error('[Webhook] Processing error:', err);
      if (webhookLog) {
        await updateLog(webhookLog.id, 'FAILED', null, `Internal error: ${err.message}`).catch(() => {});
      }
    }
  });
});

async function updateLog(id, status, orderId, errorMessage) {
  return prisma.algoWebhookLog.update({
    where: { id },
    data: {
      executionStatus: status,
      brokerOrderId: orderId,
      errorMessage: errorMessage,
      executedAt: new Date(),
    }
  });
}

module.exports = router;
