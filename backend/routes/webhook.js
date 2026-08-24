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
const AlgoOptionResolver = require('../services/algoOptionResolver');

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

      // 4.5. User Entitlement Check (Block webhooks for expired or locked accounts)
      const { checkUserEntitlement } = require('../services/entitlementService');
      const entitlement = await checkUserEntitlement(userId, 'ALGO_WEBHOOK', prisma);
      if (!entitlement.authorized) {
        await updateLog(webhookLog.id, 'SKIPPED', null, `ENTITLEMENT_DENIED: ${entitlement.code}`);
        await AuditLogger.log({ userId, category: CATEGORIES.AUTH, action: 'WEBHOOK_BLOCKED_ENTITLEMENT',
          detail: `Webhook blocked — User entitlement check failed: ${entitlement.code}`, meta: { webhookLogId: webhookLog.id, code: entitlement.code } });
        emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: entitlement.code });
        return;
      }

      // 5. Parse payload & determine Mode (Mode A: Explicit Symbol vs Mode B: Saved User Configuration)
      // 5. Parse payload & determine Signal Direction vs Mode
      const body = req.body;
      const rawInput = (body.direction || body.action || body.signal || body.side || '').toUpperCase().trim();
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

      if (!rawInput) {
        await updateLog(webhookLog.id, 'FAILED', null, 'MISSING_REQUIRED_FIELD: action/signal/direction');
        return;
      }

      // Check for EXIT signal
      const isExitSignal = ['EXIT', 'CLOSE', 'SQUAREOFF', 'SQUARE_OFF'].includes(rawInput);

      // Determine Signal Direction (TradingView Signal Direction Only)
      let signalDirection = null;
      if (['UP', 'UPSIDE', 'BUY', 'LONG', 'CALL', 'BULL', 'BUY_SIGNAL'].includes(rawInput)) {
        signalDirection = 'UPSIDE';
      } else if (['DOWN', 'DOWNSIDE', 'SELL', 'SHORT', 'PUT', 'BEAR', 'SELL_SIGNAL'].includes(rawInput)) {
        signalDirection = 'DOWNSIDE';
      }

      // Check if explicit contract symbol provided (Mode A) e.g. "NIFTY25AUG24400CE"
      const isExplicitSymbol = rawSymbol && (
        rawSymbol.endsWith('CE') || rawSymbol.endsWith('PE') ||
        rawSymbol.endsWith('FUT') || rawSymbol.length > 8 ||
        (!['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(rawSymbol.toUpperCase()) && rawSymbol.length > 0)
      );

      let finalSymbol = rawSymbol;
      let signalPrice = null;
      let resolvedContractStr = null;
      let orderAction = 'BUY'; // The actual broker transaction action (from terminal config)

      const AlgoOptionResolver = require('../services/algoOptionResolver');

      let resolved = null;

      if (!isExitSignal && !isExplicitSymbol && signalDirection) {
        // ── MODE B: Saved User Terminal UP / DOWN Trigger Configuration ───────────────
        const triggerConfig = await prisma.algoTriggerConfig.findUnique({
          where: { connectionId_direction: { connectionId: connection.id, direction: signalDirection } }
        });

        if (!triggerConfig || !triggerConfig.enabled) {
          const reason = `SIGNAL_DISABLED: ${signalDirection} trigger configuration is disabled or not configured in user terminal.`;
          await updateLog(webhookLog.id, 'SKIPPED', null, reason);
          await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'CONFIG_DISABLED', detail: reason, meta: { signalDirection } });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason });
          return;
        }

        // Auto-close opposite open positions if exitOnOpposite is enabled
        if (triggerConfig.exitOnOpposite) {
          const openPositions = await prisma.algoPosition.findMany({
            where: { userId, connectionId: connection.id, status: 'OPEN' }
          });
          for (const openPos of openPositions) {
            console.log(`[Webhook] Exit-on-Opposite: Closing open ${openPos.side} position for ${openPos.symbol}...`);
            const exitSide = openPos.side === 'BUY' ? 'SELL' : 'BUY';
            const exitOrder = {
              symbol: openPos.symbol,
              securityId: openPos.securityId || openPos.symbolToken || '',
              symbolToken: openPos.symbolToken || openPos.securityId || '',
              exchange: openPos.exchange || 'NFO',
              side: exitSide,
              quantity: openPos.quantity,
              orderType: 'MARKET',
              productType: openPos.productType
            };
            await BrokerGateway.executeOrder(exitOrder, connection).catch(() => {});
            await prisma.algoPosition.update({
              where: { id: openPos.id },
              data: { status: 'MANUALLY_CLOSED', closedAt: new Date() }
            }).catch(() => {});
          }
        }

        // Extract payload spot price if provided in TradingView webhook
        const payloadSpot = parseFloat(body.price || body.spot || body.ltp || body.close || body.spotPrice || 0) || null;
        const signalContext = {
          payloadSpot,
          signalReceivedAt: receivedAt.toISOString(),
          broker: connection.broker,
          symbol: rawSymbol || triggerConfig.symbol || 'NIFTY',
          time: body.time || body.timestamp || Date.now()
        };

        // Resolve Dynamic Option Contract from user's terminal trigger configuration
        resolved = await AlgoOptionResolver.resolveContract(triggerConfig, signalContext);
        if (!resolved.success || !resolved.tradingSymbol) {
          const reason = resolved.error || 'OPTION_CONTRACT_NOT_AVAILABLE: Could not resolve option contract.';
          await updateLog(webhookLog.id, 'FAILED', null, reason);
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason });
          return;
        }

        finalSymbol  = resolved.tradingSymbol;
        securityId   = resolved.securityId || resolved.symbolToken || '';
        qty          = resolved.quantity; // Derived from user configured lots
        exchange     = resolved.exchange;
        product      = resolved.productType;
        orderType    = 'MARKET';
        signalPrice  = resolved.spotPrice;
        orderAction  = (triggerConfig.orderSide || 'BUY').toUpperCase(); // USER TERMINAL SOURCE OF TRUTH
        resolvedContractStr = `${resolved.tradingSymbol} (${resolved.optionType} ${resolved.strike} ${orderAction})`;

        console.log(`[Webhook] Terminal Trigger Mode B Resolved: Direction=${signalDirection} -> Contract=${finalSymbol} Action=${orderAction} (Lots: ${triggerConfig.lots}, Qty: ${qty}, Spot: ${signalPrice})`);
      } else if (!isExitSignal) {
        // ── MODE A: Explicit Symbol Provided ──────────────────────────────────
        finalSymbol = rawSymbol;
        orderAction = (rawInput === 'SELL' || rawInput === 'SHORT' || rawInput === 'PUT') ? 'SELL' : 'BUY';
        const spotInfo = await AlgoOptionResolver.getSpotPrice(rawSymbol || 'NIFTY', { payloadSpot: parseFloat(body.price || body.spot || 0) || null }).catch(() => ({ spotPrice: null }));
        signalPrice = spotInfo.spotPrice;
        resolvedContractStr = rawSymbol;

        // Dynamic securityId resolution for Mode A option contract symbols
        if (!securityId && rawSymbol) {
          const parsed = AlgoOptionResolver.parseOptionSymbol(rawSymbol);
          if (parsed) {
            const dhanOptionChainService = require('../services/dhanOptionChainService');
            try {
              const chainResult = await dhanOptionChainService.getOptionChain(parsed.underlying, parsed.expiryDate);
              if (chainResult.success && chainResult.contracts) {
                const contract = chainResult.contracts.find(
                  c => Math.abs(c.strike - parsed.strike) < 2
                );
                if (contract) {
                  securityId = parsed.optionType === 'CE' ? contract.ceSecurityId : contract.peSecurityId;
                  console.log(`[Webhook] Mode A Dynamic Security ID resolved: ${securityId} for ${rawSymbol}`);
                }
              }
            } catch (err) {
              console.warn(`[Webhook] Mode A Security ID lookup failed for ${rawSymbol}: ${err.message}`);
            }
          }
        }
      }

      // Update log with parsed & resolved values
      await prisma.algoWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          parsedSymbol: finalSymbol,
          parsedAction: orderAction,
          parsedQty: qty,
          parsedSL: sl,
          parsedTarget: target,
          parsedProduct: product,
          parsedOrderType: orderType,
          signalPrice,
          resolvedContract: resolvedContractStr,
        }
      });

      if (!isExitSignal && (!orderAction || !finalSymbol || !qty || qty <= 0)) {
        await updateLog(webhookLog.id, 'FAILED', null, 'MISSING_REQUIRED_FIELDS: orderAction, symbol, qty');
        await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'PARSE_FAILED',
          detail: 'Webhook payload missing required fields', meta: { orderAction, finalSymbol, qty } });
        return;
      }

      // 6. Idempotency: dedup within sliding 5s window
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const existing = await prisma.algoWebhookLog.findFirst({
        where: {
          connectionId: connection.id,
          parsedSymbol: finalSymbol,
          parsedAction: orderAction,
          id: { not: webhookLog.id },
          receivedAt: { gte: fiveSecondsAgo },
          executionStatus: { in: ['PENDING', 'EXECUTED', 'SIMULATION_EXECUTED'] }
        }
      });
      if (existing) {
        await updateLog(webhookLog.id, 'SKIPPED', null, 'DUPLICATE_WITHIN_5S_WINDOW');
        await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'DUPLICATE_SKIPPED',
          detail: `Duplicate webhook skipped: ${finalSymbol} ${orderAction}`, meta: { parsedSymbol: finalSymbol, orderAction } });
        return;
      }
      const idempotencyKey = `${connection.id}:${finalSymbol}:${orderAction}:${Date.now()}`;
      await prisma.algoWebhookLog.update({ where: { id: webhookLog.id }, data: { idempotencyKey } });

      // 7. Handle EXIT action
      if (isExitSignal) {
        const openPos = await prisma.algoPosition.findFirst({
          where: { userId, connectionId: connection.id, status: 'OPEN' }
        });
        if (openPos) {
          const exitSide = openPos.side === 'BUY' ? 'SELL' : 'BUY';
          const AngelScripMaster = require('../services/angelScripMaster');
          const exitToken = openPos.symbolToken || openPos.securityId || AngelScripMaster.resolveToken(openPos.symbol, '', 0, 'CE');
          const exitOrder = {
            symbol: openPos.symbol,
            securityId: exitToken,
            symbolToken: exitToken,
            exchange: openPos.exchange || exchange,
            side: exitSide,
            quantity: openPos.quantity,
            orderType: 'MARKET',
            productType: openPos.productType,
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
        } else {
          await updateLog(webhookLog.id, 'SKIPPED', null, 'NO_OPEN_POSITION_TO_EXIT');
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: 'NO_OPEN_POSITION' });
        }
        return;
      }

      // 7.5. Validate Security ID
      if (!securityId && (exchange === 'NSE' || exchange === 'NFO' || exchange === 'BSE' || exchange === 'BFO')) {
        await updateLog(webhookLog.id, 'FAILED', null, `MISSING_SECURITY_ID: Could not resolve securityId for option contract ${finalSymbol}`);
        await AuditLogger.log({ userId, category: CATEGORIES.WEBHOOK, action: 'VALIDATION_FAILED',
          detail: `Webhook blocked — Missing securityId for option contract ${finalSymbol}`, meta: { finalSymbol } });
        emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason: 'MISSING_SECURITY_ID' });
        return;
      }

      // ─── 8. DYNAMIC PRE-TRADE VALIDATION & TERMINAL TRADING GATE ───────────
      const { ControlledLivePilotGate } = require('../services/compliance/ControlledLivePilotGate');
      const { MarketPreflightService } = require('../services/compliance/MarketPreflightService');
      const userRecord = await prisma.user.findUnique({ where: { id: userId } });
      const staticIpAssignment = await prisma.clientStaticIpAssignment.findFirst({
        where: { userId, broker: connection.broker, status: 'VERIFIED' }
      });
      const userRiskSettings = await prisma.agentRiskSettings.findUnique({ where: { userId } });

      const candidateOrder = {
        symbol: finalSymbol,
        securityId: resolved?.securityId || securityId || '',
        symbolToken: resolved?.symbolToken || resolved?.securityId || securityId || '',
        exchange,
        side: orderAction, // USER TERMINAL CONTROLLED ORDER ACTION
        quantity: qty,     // USER TERMINAL CONTROLLED QUANTITY
        orderType,
        productType: product,
        price: orderType === 'MARKET' ? null : (parseFloat(body.orderPrice || body.optionPrice || 0) || null),
        triggerPrice: sl,
        sl,
        target,
      };

      // Anti-Pyramiding: Prevent duplicate open positions on same contract
      if (!isExitSignal && (orderAction === 'BUY' || orderAction === 'SELL')) {
        const existingOpenPos = await prisma.algoPosition.findFirst({
          where: { userId, connectionId: connection.id, symbol: finalSymbol, status: 'OPEN' }
        });
        if (existingOpenPos) {
          const duplicateReason = `DUPLICATE_OPEN_POSITION_BLOCKED: Open position already exists for ${finalSymbol} (Position ID: ${existingOpenPos.id})`;
          await updateLog(webhookLog.id, 'SKIPPED', null, duplicateReason);
          await AuditLogger.log({
            userId, category: CATEGORIES.POSITION, action: 'DUPLICATE_POSITION_BLOCKED',
            detail: duplicateReason, meta: { existingOpenPosId: existingOpenPos.id, symbol: finalSymbol }
          });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: 'DUPLICATE_OPEN_POSITION' });
          return;
        }
      }

      const preTradeGate = ControlledLivePilotGate.evaluateLivePilotGate({
        user: userRecord,
        brokerConnection: connection,
        staticIpAssignment,
        riskSettings: userRiskSettings || {},
        order: candidateOrder,
        globalKillSwitch: !!settings?.globalKillSwitch,
      });

      const isLiveExecutionAllowed = preTradeGate.allowed && (preTradeGate.isLive || preTradeGate.isLivePilot);

      // Enforce connection status for Live Orders
      if (isLiveExecutionAllowed) {
        if (!connection.isActive || connection.testStatus === 'FAILED' || connection.killSwitchActive) {
          const offlineReason = `BROKER_CONNECTION_INACTIVE: Connection to ${connection.broker} is offline or not tested. Order blocked.`;
          await updateLog(webhookLog.id, 'SKIPPED', null, offlineReason);
          await AuditLogger.log({ userId, category: CATEGORIES.BROKER, action: 'ORDER_BLOCKED_DISCONNECTED', detail: offlineReason });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: 'BROKER_DISCONNECTED' });
          return;
        }

        // Validate symbolToken before calling broker API
        if (!candidateOrder.symbolToken && (candidateOrder.exchange === 'NFO' || candidateOrder.exchange === 'BFO')) {
          const tokenBlockReason = `MISSING_OR_INVALID_SYMBOL_TOKEN: Valid symbolToken is required for ${connection.broker} order on ${finalSymbol}`;
          await updateLog(webhookLog.id, 'FAILED', null, tokenBlockReason);
          await AuditLogger.log({ userId, category: CATEGORIES.ORDER, action: 'ORDER_BLOCKED_NO_TOKEN', detail: tokenBlockReason });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason: 'MISSING_OR_INVALID_SYMBOL_TOKEN' });
          return;
        }

        // ─── 8.1. EXECUTE LIVE ORDER ON CONNECTED BROKER (TERMINAL LIVE ON) ─────
        // Enforce Market Pre-Flight Gate (MANDATORY for live trading session)
        const isPreflightPassed = MarketPreflightService.isPreflightPassedToday(userId);
        if (!isPreflightPassed) {
          const preflightBlockReason = 'PREFLIGHT_NOT_PASSED: Market-open pre-flight check has not passed for today\'s trading session. Live order blocked.';
          await AuditLogger.log({
            userId, category: CATEGORIES.ORDER, action: 'LIVE_ORDER_BLOCKED_NO_PREFLIGHT',
            detail: `Live Order Blocked: ${finalSymbol} ${orderAction} — ${preflightBlockReason}`,
            meta: { candidateOrder, preTradeGate, webhookLogId: webhookLog.id },
            req,
          });

          await prisma.algoWebhookLog.update({
            where: { id: webhookLog.id },
            data: {
              executionStatus: 'FAILED',
              errorMessage: preflightBlockReason,
              executedAt: new Date(),
            }
          });

          emitUpdate('algo_webhook', {
            id: webhookLog.id,
            status: 'FAILED',
            broker: connection.broker,
            reason: 'PREFLIGHT_NOT_PASSED',
            message: preflightBlockReason,
          });

          return;
        }

        await AuditLogger.log({
          userId, category: CATEGORIES.ORDER, action: 'LIVE_ORDER_INITIATED',
          detail: `Live Terminal Order: ${finalSymbol} ${orderAction} qty:${qty} (Max Lots: ${preTradeGate.userMaxLots || 1}) via Proxy ${preTradeGate.egressIp}`,
          meta: { candidateOrder, preTradeGate, webhookLogId: webhookLog.id },
          req,
        });

        const execResult = await BrokerGateway.executeOrder(candidateOrder, connection);

        const actualFillPrice = execResult.success
          ? (parseFloat(execResult.rawResponse?.averageTradedPrice || execResult.rawResponse?.price || execResult.rawResponse?.fillPrice || 0) || null)
          : null;

        await AuditLogger.log({
          userId, category: CATEGORIES.ORDER,
          action: execResult.success ? 'LIVE_ORDER_ACCEPTED' : 'LIVE_ORDER_REJECTED',
          detail: execResult.success
            ? `Live Execution: Broker ${connection.broker} accepted order ${execResult.orderId} via Proxy ${preTradeGate.egressIp}`
            : `Live Execution: Broker ${connection.broker} rejected order: ${execResult.message}`,
          meta: { execResult, preTradeGate, webhookLogId: webhookLog.id },
          req,
        });

        await prisma.algoWebhookLog.update({
          where: { id: webhookLog.id },
          data: {
            executionStatus: execResult.success ? 'LIVE_EXECUTED' : 'FAILED',
            brokerOrderId: execResult.orderId || null,
            errorMessage: execResult.success ? null : execResult.message,
            actualFillPrice,
            executedAt: new Date(),
          }
        });

        // Create confirmed open position for live executed order
        if (execResult.success && orderAction !== 'EXIT') {
          const position = await prisma.algoPosition.create({
            data: {
              userId,
              connectionId: connection.id,
              symbol: finalSymbol,
              exchange,
              side: orderAction,
              quantity: qty,
              entryPrice: actualFillPrice || 0,
              productType: product,
              slPrice: sl,
              targetPrice: target,
              trailSL,
              trailOffset,
              currentSL: sl,
              status: 'OPEN',
              brokerOrderId: execResult.orderId,
            }
          });

          await AuditLogger.log({
            userId, category: CATEGORIES.POSITION, action: 'LIVE_POSITION_OPENED',
            detail: `Live Position opened: ${orderAction} ${qty} ${finalSymbol} @ broker ${connection.broker} (OrderID: ${execResult.orderId})`,
            meta: { positionId: position.id, orderId: execResult.orderId, actualFillPrice }
          });

          emitUpdate('algo_position', {
            type: 'OPENED',
            position: {
              id: position.id,
              symbol: finalSymbol,
              side: orderAction,
              qty,
              status: 'OPEN',
              fillPrice: actualFillPrice,
              orderId: execResult.orderId
            }
          });
        }

        emitUpdate('algo_execution', {
          id: webhookLog.id, symbol: finalSymbol, action: orderAction, qty,
          status: execResult.success ? 'LIVE_EXECUTED' : 'FAILED',
          orderId: execResult.orderId,
          broker: connection.broker,
          isLive: true,
          egressIp: preTradeGate.egressIp,
          fillPrice: actualFillPrice,
        });

        return; // Live execution complete
      }

      // ─── 8.2. CLIENT EXECUTION AGENT DISPATCH ROUTE (SIMULATION) ───────────
      const { agentTunnelServer } = require('../services/agentTunnelServer');
      const agentTunnel = req.agentTunnelServer || agentTunnelServer;
      const isAgentOnline = agentTunnel.isAgentOnline(userId);

      if (isAgentOnline) {
        const signalEnvelope = {
          type: 'WEBHOOK_SIGNAL_DISPATCH',
          signalId: `sig_${webhookLog.id}`,
          broker: connection.broker,
          symbol: finalSymbol,
          securityId,
          exchange,
          action: orderAction,
          quantity: qty,
          orderType,
          productType: product,
          price: signalPrice || parseFloat(body.price || 0) || null,
          sl,
          target,
          isSimulation: true, // Strictly simulation for non-pilot clients
          dispatchedAt: Date.now(),
          timestamp: new Date().toISOString(),
        };

        const agentResult = await agentTunnel.dispatchSignalToAgent(userId, signalEnvelope);

        await prisma.algoWebhookLog.update({
          where: { id: webhookLog.id },
          data: {
            executionStatus: agentResult.success ? 'SIMULATION_EXECUTED' : 'FAILED',
            brokerOrderId: agentResult.orderId || null,
            errorMessage: agentResult.success ? null : (agentResult.reason || agentResult.message),
            executedAt: new Date(),
          }
        });

        emitUpdate('algo_webhook', {
          id: webhookLog.id,
          status: agentResult.success ? 'SIMULATION_EXECUTED' : 'FAILED',
          orderId: agentResult.orderId,
          broker: connection.broker,
          reason: agentResult.reason,
          isAgentRouted: true,
        });

        return; // Complete simulation path
      }

      // ─── 9. LEGACY CLOUD EXECUTION (FALLBACK) ──────────────────────────────
      // 9.1. Risk Engine Validation
      const funds = await BrokerGateway.getFunds(connection).catch(() => null);
      const order = { symbol: finalSymbol, securityId, exchange, side: orderAction, quantity: qty, orderType, productType: product,
                      price: parseFloat(body.price || 0) || null, triggerPrice: sl, sl, target };
      const riskResult = await RiskEngine.validate(order, connection, funds);

      await AuditLogger.log({
        userId, category: CATEGORIES.RISK,
        action: riskResult.allowed ? 'RISK_PASSED' : 'RISK_FAILED',
        detail: riskResult.allowed ? `Risk check passed for ${finalSymbol} ${orderAction}` : `Risk check FAILED: ${riskResult.reason}`,
        meta: { symbol: finalSymbol, action: orderAction, qty, riskResult, webhookLogId: webhookLog.id }
      });

      if (!riskResult.allowed) {
        await updateLog(webhookLog.id, 'RISK_REJECTED', null, riskResult.reason);
        await prisma.algoWebhookLog.update({ where: { id: webhookLog.id }, data: { riskReason: riskResult.reason } });
        emitUpdate('algo_webhook', { id: webhookLog.id, status: 'RISK_REJECTED', reason: riskResult.reason });
        return;
      }

      // 9.2. Algo Brokerage Token Safety Check (Token ONLY)
      const { getActiveCharges, getAlgoBrokerageForLots } = require('../services/chargesService');
      const charges = await getActiveCharges();
      const lotCount = Math.max(1, Math.ceil(qty / 65));
      const brokerage = getAlgoBrokerageForLots(lotCount, charges.algoBrokerage.tiers);

      // Check user token balance
      const ledgers = await prisma.ledger.findMany({
        where: { userId, walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] } }
      });
      const tokenBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

      if (orderAction === 'BUY') {
        if (tokenBalance < brokerage.totalRequiredTokens) {
          const reason = `INSUFFICIENT_ALGO_BROKERAGE_TOKENS: Required BUY+SELL brokerage ${brokerage.totalRequiredTokens} tokens for ${lotCount} lots, Available: ${tokenBalance} tokens`;
          await updateLog(webhookLog.id, 'RISK_REJECTED', null, reason);
          await prisma.algoWebhookLog.update({ where: { id: webhookLog.id }, data: { riskReason: reason } });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'RISK_REJECTED', reason: 'INSUFFICIENT_ALGO_BROKERAGE_TOKENS' });
          return;
        }
      }

      emitUpdate('algo_webhook', { id: webhookLog.id, status: 'RISK_PASSED', symbol: finalSymbol, action: orderAction });

      // 9.3. Execute Order via BrokerGateway
      await AuditLogger.log({ userId, category: CATEGORIES.ORDER, action: 'ORDER_SENT',
        detail: `Sending ${orderAction} order for ${finalSymbol} qty:${qty} to ${connection.broker}`,
        meta: { order, connectionId: connection.id } });

      const execResult = await BrokerGateway.executeOrder(order, connection);

      if (execResult.success) {
        const debitTokens = orderAction === 'BUY' ? brokerage.buyTokens : brokerage.sellTokens;
        if (debitTokens > 0) {
          await prisma.ledger.create({
            data: {
              userId,
              walletType: 'TOKEN',
              amount: debitTokens,
              type: 'DEBIT',
              reason: `ALGO_BROKERAGE_${orderAction}_${finalSymbol}_${lotCount}_LOTS`
            }
          });
        }
      }

      const actualFillPrice = execResult.success
        ? (parseFloat(execResult.rawResponse?.averageTradedPrice || execResult.rawResponse?.price || execResult.rawResponse?.fillPrice || 0) || null)
        : null;

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
        id: webhookLog.id, symbol: finalSymbol, action: orderAction, qty,
        status: execResult.success ? 'EXECUTED' : 'FAILED',
        orderId: execResult.orderId,
        broker: connection.broker,
        message: execResult.message,
      });

      // 10. Create position record if executed
      if (execResult.success && orderAction !== 'EXIT') {
        const position = await prisma.algoPosition.create({
          data: {
            userId, connectionId: connection.id,
            symbol: finalSymbol, exchange, side: orderAction,
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
          detail: `Position opened: ${orderAction} ${qty} ${finalSymbol} @ broker ${connection.broker}`,
          meta: { positionId: position.id, orderId: execResult.orderId } });

        emitUpdate('algo_position', { type: 'OPENED', position: { id: position.id, symbol: finalSymbol, side: orderAction, qty, status: 'OPEN' } });
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
