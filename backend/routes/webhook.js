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
const { N } = require('../services/notifier');

const prisma = new PrismaClient();

/**
 * Normalize raw broker rejection message into a standardized reason code and readable detail.
 * @param {string} rawMessage
 * @returns {{ normalizedReason: string, formattedErrorMessage: string, rawDetail: string }}
 */
function normalizeBrokerRejectionReason(rawMessage) {
  if (!rawMessage) {
    return {
      normalizedReason: 'BROKER_ORDER_REJECTED',
      formattedErrorMessage: 'Reason: BROKER_ORDER_REJECTED\nBroker Rejection: Order rejected by broker.',
      rawDetail: 'Order rejected by broker'
    };
  }
  const rawStr = String(rawMessage).trim();
  const upper = rawStr.toUpperCase();

  const isInsufficientFunds =
    upper.includes('INSUFFICIENT') ||
    upper.includes('MARGIN') ||
    upper.includes('FUNDS') ||
    upper.includes('BALANCE') ||
    upper.includes('SHORTFALL') ||
    upper.includes('AB1004') ||
    upper.includes('RMS') ||
    upper.includes('LIMIT EXCEEDED') ||
    upper.includes('NOT ENOUGH');

  if (isInsufficientFunds) {
    return {
      normalizedReason: 'INSUFFICIENT_BALANCE',
      formattedErrorMessage: `Reason: INSUFFICIENT_BALANCE\nBroker Rejection: ${rawStr}`,
      rawDetail: rawStr
    };
  }

  return {
    normalizedReason: 'BROKER_ORDER_REJECTED',
    formattedErrorMessage: `Reason: BROKER_ORDER_REJECTED\nBroker Rejection: ${rawStr}`,
    rawDetail: rawStr
  };
}

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

      // ─── 6. PARSE ACTION & DETERMINE SIGNAL TYPE (ENTRY vs EXIT) ───────────
      const exitActionKeywords = [
        'EXIT', 'CLOSE', 'SQUAREOFF', 'SQUARE_OFF', 'FLATTEN',
        'EXIT_LONG', 'EXIT_SHORT', 'CLOSE_BUY', 'CLOSE_SELL',
        'SL', 'STOP_LOSS', 'STOPLOSS', 'SL_EXIT', 'TARGET', 'TP',
        'TAKE_PROFIT', 'TARGET_EXIT', 'TRAIL_SL', 'TRAILING_STOP',
        'TRAILING_STOP_LOSS', 'EXIT_SL', 'EXIT_TARGET', 'EXIT_TRAIL_SL'
      ];

      const isExplicitExitFlag = body.is_exit === true || body.exit === true || body.isExit === true || body.close === true;
      const rawReason = (body.exit_reason || body.exitReason || body.reason || body.comment || '').toUpperCase().trim();

      const isExitSignal = exitActionKeywords.includes(rawInput) ||
                           isExplicitExitFlag ||
                           (rawInput === 'SELL' && (rawReason.includes('SL') || rawReason.includes('TARGET') || rawReason.includes('STOP') || rawReason.includes('TRAIL') || rawReason.includes('EXIT') || isExplicitExitFlag));

      let exitReason = 'STRATEGY_EXIT';
      if (rawReason.includes('TRAIL') || rawInput.includes('TRAIL')) exitReason = 'TRAIL_SL';
      else if (rawReason.includes('SL') || rawReason.includes('STOP') || rawInput.includes('SL') || rawInput.includes('STOP')) exitReason = 'SL';
      else if (rawReason.includes('TARGET') || rawReason.includes('TP') || rawReason.includes('PROFIT') || rawInput.includes('TARGET') || rawInput.includes('TP')) exitReason = 'TARGET';
      else if (rawReason.includes('REVERSAL') || rawInput.includes('REVERSAL')) exitReason = 'REVERSAL';
      else if (rawReason) exitReason = rawReason;

      // Determine Signal Direction for Directional Entries
      let signalDirection = null;
      if (!isExitSignal) {
        if (['UP', 'UPSIDE', 'BUY', 'LONG', 'CALL', 'BULL', 'BUY_SIGNAL'].includes(rawInput)) {
          signalDirection = 'UPSIDE';
        } else if (['DOWN', 'DOWNSIDE', 'SELL', 'SHORT', 'PUT', 'BEAR', 'SELL_SIGNAL'].includes(rawInput)) {
          signalDirection = 'DOWNSIDE';
        }
      }

      // Trigger non-blocking webhook received notification
      try {
        N.algoWebhookReceived({
          action: isExitSignal ? `EXIT (${exitReason})` : rawInput,
          symbol: rawSymbol || 'NIFTY',
          strike: body.strike || 'ATM',
          spotPrice: body.price || body.spotPrice || null,
          source: 'TradingView Webhook'
        });
      } catch (_) {}

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

      // ─── 7. HANDLE STRATEGY EXIT SIGNALS (STRICTLY CLOSES EXISTING POSITIONS, NEVER BUYS) ───
      if (isExitSignal) {
        const openPositions = await prisma.algoPosition.findMany({
          where: { userId, connectionId: connection.id, status: 'OPEN' }
        });

        if (openPositions.length > 0) {
          const AngelScripMaster = require('../services/angelScripMaster');
          for (const openPos of openPositions) {
            const exitSide = openPos.side === 'BUY' ? 'SELL' : 'BUY';
            let exitToken = openPos.symbolToken || openPos.securityId;
            if (!AngelScripMaster.isValidToken(exitToken)) {
              exitToken = AngelScripMaster.resolveTokenFromSymbol(openPos.symbol);
            }

            if (!exitToken && (openPos.exchange === 'NFO' || openPos.exchange === 'BFO')) {
              await updateLog(webhookLog.id, 'FAILED', null, `EXIT_BLOCKED_MISSING_TOKEN: Could not resolve valid symbolToken for ${openPos.symbol}. Aborting square-off.`);
              await AuditLogger.log({
                userId, category: CATEGORIES.POSITION, action: 'EXIT_BLOCKED_NO_TOKEN',
                detail: `Strategy EXIT (${exitReason}) blocked: Missing symbolToken for ${openPos.symbol}`,
                meta: { positionId: openPos.id, symbol: openPos.symbol }
              });
              continue;
            }

            const exitOrder = {
              symbol: openPos.symbol,
              securityId: exitToken || '',
              symbolToken: exitToken || '',
              exchange: openPos.exchange || 'NFO',
              side: exitSide,
              quantity: openPos.quantity,
              orderType: 'MARKET',
              productType: openPos.productType || 'INTRADAY',
            };

            const exitResult = await BrokerGateway.executeOrder(exitOrder, connection);
            if (exitResult.success) {
              const exitFillPrice = parseFloat(exitResult.fillPrice || exitResult.price || body.price || openPos.currentPrice || 0) || null;
              let realizedPnl = null;
              if (exitFillPrice && openPos.entryPrice) {
                realizedPnl = openPos.side === 'BUY'
                  ? (exitFillPrice - openPos.entryPrice) * openPos.quantity
                  : (openPos.entryPrice - exitFillPrice) * openPos.quantity;
              }

              await prisma.algoPosition.update({
                where: { id: openPos.id },
                data: {
                  status: 'CLOSED',
                  exitOrderId: exitResult.orderId,
                  exitPrice: exitFillPrice,
                  pnl: realizedPnl != null ? Math.round(realizedPnl * 100) / 100 : null,
                  closedAt: new Date()
                }
              }).catch(() => {});

              await AuditLogger.log({
                userId,
                category: CATEGORIES.POSITION,
                action: 'STRATEGY_EXIT',
                detail: `Strategy EXIT (${exitReason}): Squared off open position ${openPos.symbol} (OrderID: ${exitResult.orderId || 'N/A'}, ExitPrice: ₹${exitFillPrice || 'MKT'}, PnL: ${realizedPnl != null ? (realizedPnl >= 0 ? '+' : '') + '₹' + realizedPnl.toFixed(2) : 'N/A'})`,
                meta: {
                  positionId: openPos.id,
                  symbol: openPos.symbol,
                  quantity: openPos.quantity,
                  exitOrderId: exitResult.orderId,
                  exitReason,
                  exitFillPrice,
                  realizedPnl,
                  isStrategyGenerated: true
                },
                req,
              });

              // Telegram Notification (Non-blocking)
              try {
                const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, studentId: true } });
                const posLots = openPos.lots || Math.max(1, Math.round((openPos.quantity || 65) / (openPos.symbol.includes('BANKNIFTY') ? 15 : 65)));
                N.algoExitExecuted({
                  studentName: student?.name || 'Student',
                  studentId: student?.studentId || userId,
                  symbol: openPos.symbol,
                  lots: posLots,
                  quantity: openPos.quantity,
                  price: exitFillPrice,
                  orderId: exitResult.orderId || 'STRATEGY_EXIT',
                  exitReason: `Strategy ${exitReason}`,
                  realizedPnl: realizedPnl
                });
              } catch (_) {}

              emitUpdate('algo_position', {
                type: 'CLOSED',
                position: {
                  id: openPos.id,
                  symbol: openPos.symbol,
                  status: 'CLOSED',
                  exitPrice: exitFillPrice,
                  pnl: realizedPnl,
                  exitOrderId: exitResult.orderId
                }
              });
            } else {
              // Broker execution failed — DO NOT falsely mark position as CLOSED in DB!
              await updateLog(webhookLog.id, 'FAILED', null, `EXIT_EXECUTION_FAILED: ${exitResult.error || exitResult.message || 'Broker rejection'}`);
              await AuditLogger.log({
                userId,
                category: CATEGORIES.POSITION,
                action: 'EXIT_EXECUTION_FAILED',
                detail: `Strategy EXIT (${exitReason}) FAILED at broker for ${openPos.symbol}: ${exitResult.error || exitResult.message}`,
                meta: { positionId: openPos.id, symbol: openPos.symbol, error: exitResult.error || exitResult.message },
                req,
              });
            }
          }

          await updateLog(webhookLog.id, 'EXECUTED', null, `STRATEGY_EXIT_PROCESSED: ${exitReason}`);
          emitUpdate('algo_execution', { action: 'EXIT', status: 'EXECUTED', exitReason });
        } else {
          // Idempotent: If no open position exists, skip cleanly without placing orders or mutating data
          await updateLog(webhookLog.id, 'SKIPPED', null, 'NO_OPEN_ALGO_POSITION_TO_EXIT');
          await AuditLogger.log({
            userId,
            category: CATEGORIES.POSITION,
            action: 'EXIT_SIGNAL_SKIPPED',
            detail: `Strategy EXIT (${exitReason}) received, but no open position was found. Zero broker orders placed.`,
            meta: { connectionId: connection.id, exitReason },
            req,
          });
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'SKIPPED', reason: 'NO_OPEN_POSITION' });
        }
        return; // CRITICAL: Stop processing! Never resolve contracts or create new entries!
      }

      // ─── 8. DIRECTIONAL ENTRY STATE MACHINE (BUY -> CE, SELL -> PE) ─────────
      if (!isExplicitSymbol && signalDirection) {
        // Mode B: User Terminal Directional Trigger Configuration
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

        // 8.1. Check & Square Off Opposite Algo-Owned Positions (Reversal Square-off)
        // In directional option buying (CE vs PE), opposite positions MUST be squared off before entering new direction.
        const shouldExitOpposite = triggerConfig.exitOnOpposite !== false;
        if (shouldExitOpposite) {
          const openAlgoPositions = await prisma.algoPosition.findMany({
            where: { userId, connectionId: connection.id, status: 'OPEN' }
          });

          // Identify opposite positions: (e.g. if UPSIDE/CE arriving, opposite is PE; if DOWNSIDE/PE arriving, opposite is CE)
          const oppositePositions = openAlgoPositions.filter(p => {
            const isCall = p.symbol.endsWith('CE');
            const isPut = p.symbol.endsWith('PE');
            if (signalDirection === 'UPSIDE' && isPut) return true;
            if (signalDirection === 'DOWNSIDE' && isCall) return true;
            return false;
          });

          if (oppositePositions.length > 0) {
            for (const oppPos of oppositePositions) {
              await AuditLogger.log({
                userId,
                category: CATEGORIES.POSITION,
                action: 'REVERSAL_EXIT_STARTED',
                detail: `Trend Reversal to ${signalDirection}: Squaring off opposite position ${oppPos.symbol} (ID: ${oppPos.id})`,
                meta: { positionId: oppPos.id, symbol: oppPos.symbol, reversalDirection: signalDirection },
                req,
              });

              const AngelScripMaster = require('../services/angelScripMaster');
              const oppExitSide = oppPos.side === 'BUY' ? 'SELL' : 'BUY';
              let oppExitToken = oppPos.symbolToken || oppPos.securityId;
              if (!AngelScripMaster.isValidToken(oppExitToken)) {
                oppExitToken = AngelScripMaster.resolveTokenFromSymbol(oppPos.symbol);
              }

              if (!oppExitToken && (oppPos.exchange === 'NFO' || oppPos.exchange === 'BFO')) {
                const failReason = `REVERSAL_BLOCKED: Could not resolve valid symbolToken for existing open position ${oppPos.symbol}. Aborting new opposite entry.`;
                await updateLog(webhookLog.id, 'FAILED', null, failReason);
                await AuditLogger.log({
                  userId, category: CATEGORIES.POSITION, action: 'OPPOSITE_EXIT_FAILED',
                  detail: failReason, meta: { positionId: oppPos.id, symbol: oppPos.symbol }
                });
                emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason: 'REVERSAL_EXIT_FAILED' });
                return;
              }

              const oppExitOrder = {
                symbol: oppPos.symbol,
                securityId: oppExitToken || '',
                symbolToken: oppExitToken || '',
                exchange: oppPos.exchange || 'NFO',
                side: oppExitSide,
                quantity: oppPos.quantity,
                orderType: 'MARKET',
                productType: oppPos.productType || 'INTRADAY'
              };

              const oppExec = await BrokerGateway.executeOrder(oppExitOrder, connection).catch(e => ({ success: false, message: e.message }));
              
              if (oppExec.success) {
                const oppExitFillPrice = parseFloat(oppExec.fillPrice || oppExec.price || body.price || oppPos.currentPrice || 0) || null;
                let oppRealizedPnl = null;
                if (oppExitFillPrice && oppPos.entryPrice) {
                  oppRealizedPnl = oppPos.side === 'BUY'
                    ? (oppExitFillPrice - oppPos.entryPrice) * oppPos.quantity
                    : (oppPos.entryPrice - oppExitFillPrice) * oppPos.quantity;
                }

                await prisma.algoPosition.update({
                  where: { id: oppPos.id },
                  data: {
                    status: 'CLOSED',
                    closedAt: new Date(),
                    exitOrderId: oppExec.orderId || null,
                    exitPrice: oppExitFillPrice,
                    pnl: oppRealizedPnl != null ? Math.round(oppRealizedPnl * 100) / 100 : null
                  }
                }).catch(() => {});

                // Telegram Notification for Reversal Exit (Non-blocking)
                try {
                  const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, studentId: true } });
                  const oppLots = oppPos.lots || Math.max(1, Math.round((oppPos.quantity || 65) / (oppPos.symbol.includes('BANKNIFTY') ? 15 : 65)));
                  N.algoExitExecuted({
                    studentName: student?.name || 'Student',
                    studentId: student?.studentId || userId,
                    symbol: oppPos.symbol,
                    lots: oppLots,
                    quantity: oppPos.quantity,
                    price: oppExitFillPrice,
                    orderId: oppExec.orderId || 'REVERSAL_EXIT',
                    exitReason: 'Trend Reversal',
                    realizedPnl: oppRealizedPnl
                  });
                } catch (_) {}

                emitUpdate('algo_position', {
                  type: 'CLOSED',
                  position: {
                    id: oppPos.id,
                    symbol: oppPos.symbol,
                    status: 'CLOSED',
                    exitPrice: oppExitFillPrice,
                    pnl: oppRealizedPnl,
                    exitOrderId: oppExec.orderId
                  }
                });

                await AuditLogger.log({
                  userId,
                  category: CATEGORIES.POSITION,
                  action: 'OPPOSITE_EXIT_CONFIRMED',
                  detail: `Opposite position ${oppPos.symbol} successfully squared off before entering ${signalDirection} trade. (ExitPrice: ₹${oppExitFillPrice || 'MKT'}, PnL: ${oppRealizedPnl != null ? (oppRealizedPnl >= 0 ? '+' : '') + '₹' + oppRealizedPnl.toFixed(2) : 'N/A'})`,
                  meta: { positionId: oppPos.id, symbol: oppPos.symbol, exitOrderId: oppExec.orderId, realizedPnl: oppRealizedPnl },
                  req,
                });
              } else {
                const failReason = `REVERSAL_BLOCKED: Could not square off existing open position ${oppPos.symbol} at broker (${oppExec.error || oppExec.message}). Aborting new opposite entry.`;
                await updateLog(webhookLog.id, 'FAILED', null, failReason);
                await AuditLogger.log({
                  userId,
                  category: CATEGORIES.POSITION,
                  action: 'OPPOSITE_EXIT_FAILED',
                  detail: failReason,
                  meta: { positionId: oppPos.id, symbol: oppPos.symbol, error: oppExec.error || oppExec.message },
                  req,
                });
                emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason: 'REVERSAL_EXIT_FAILED' });
                return; // Strictly abort new entry if opposite exit failed!
              }
            }
          }

          // 8.2. Protect Non-Algo / Manually-Held Broker Positions
          try {
            const liveBrokerPositions = await BrokerGateway.getPositions(connection);
            const algoOpenSymbols = new Set(openAlgoPositions.map(p => p.symbol));
            for (const lbp of liveBrokerPositions) {
              const netQ = Math.abs(parseInt(lbp.netqty || lbp.quantity || 0));
              if (netQ > 0 && !algoOpenSymbols.has(lbp.symbol)) {
                await AuditLogger.log({
                  userId,
                  category: CATEGORIES.POSITION,
                  action: 'MANUAL_POSITION_PROTECTED',
                  detail: `Protected manually-held position ${lbp.symbol} (NetQty: ${netQ}) from algo auto-squareoff.`,
                  meta: { manualSymbol: lbp.symbol, netQty: netQ },
                  req,
                });
              }
            }
          } catch (_) {}
        }

        // 8.3. Resolve NEW Current ATM / Offset Strike After Exit Confirmation
        const payloadSpot = parseFloat(body.price || body.spot || body.ltp || body.close || body.spotPrice || 0) || null;
        const signalContext = {
          payloadSpot,
          signalReceivedAt: receivedAt.toISOString(),
          broker: connection.broker,
          symbol: rawSymbol || triggerConfig.symbol || 'NIFTY',
          time: body.time || body.timestamp || Date.now()
        };

        resolved = await AlgoOptionResolver.resolveContract(triggerConfig, signalContext);
        if (!resolved.success || !resolved.tradingSymbol) {
          const reason = resolved.error || 'OPTION_CONTRACT_NOT_AVAILABLE: Could not resolve option contract.';
          await updateLog(webhookLog.id, 'FAILED', null, reason);
          emitUpdate('algo_webhook', { id: webhookLog.id, status: 'FAILED', reason });
          return;
        }

        finalSymbol  = resolved.tradingSymbol;
        securityId   = resolved.securityId || resolved.symbolToken || '';
        qty          = resolved.quantity;
        exchange     = resolved.exchange;
        product      = resolved.productType;
        orderType    = 'MARKET';
        signalPrice  = resolved.spotPrice;
        orderAction  = (triggerConfig.orderSide || 'BUY').toUpperCase();
        resolvedContractStr = `${resolved.tradingSymbol} (${resolved.optionType} ${resolved.strike} ${orderAction})`;

        await AuditLogger.log({
          userId,
          category: CATEGORIES.ORDER,
          action: 'NEW_ENTRY_AFTER_REVERSAL',
          detail: `Resolved fresh ATM/Offset contract: ${finalSymbol} (Strike: ${resolved.strike}, Spot: ${signalPrice}, Action: ${orderAction})`,
          meta: { finalSymbol, strike: resolved.strike, spotPrice: signalPrice, direction: signalDirection },
          req,
        });
      } else if (!isExitSignal) {
        // Mode A: Explicit Symbol Provided
        finalSymbol = rawSymbol;
        orderAction = (rawInput === 'SELL' || rawInput === 'SHORT' || rawInput === 'PUT') ? 'SELL' : 'BUY';
        const spotInfo = await AlgoOptionResolver.getSpotPrice(rawSymbol || 'NIFTY', { payloadSpot: parseFloat(body.price || body.spot || 0) || null }).catch(() => ({ spotPrice: null }));
        signalPrice = spotInfo.spotPrice;
        resolvedContractStr = rawSymbol;
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

      // ─── 8.4. ENFORCE CONFIGURED MAX ALLOWED LOTS ON EVERY ENTRY ────────────
      const userRisk = await prisma.agentRiskSettings.findUnique({ where: { userId } });
      const maxAllowedLots = userRisk?.maxLots || 1;
      const lotSize = (finalSymbol || '').includes('BANKNIFTY') ? 15 : 65;
      const maxAllowedQty = maxAllowedLots * lotSize;
      if (qty > maxAllowedQty) {
        console.log(`[Webhook] Clamping requested qty ${qty} to Max Allowed Qty ${maxAllowedQty} (${maxAllowedLots} lots)`);
        qty = maxAllowedQty;
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
        // Enforce Market Pre-Flight Gate (Persistent Session & Zero Unnecessary Delay)
        // 1. If today's pre-flight is already READY (in memory cache or DB): executes immediately with 0 delay.
        // 2. If new trading day and pre-flight hasn't run yet: auto-runs pre-flight safely and CONTINUES THE SAME SIGNAL upon PASS.
        // 3. If pre-flight fails: strictly blocks live order and logs actual failure reason.
        const preflightGate = await MarketPreflightService.ensurePreflightPassed(userId, {
          prismaClient: prisma,
          brokerConnectionId: connection.id
        });

        if (!preflightGate.allowed) {
          const actualReason = preflightGate.reason || preflightGate.result?.message || 'Pre-flight check failed';
          const preflightBlockReason = `PREFLIGHT_NOT_PASSED: ${actualReason}. Live order blocked.`;
          await AuditLogger.log({
            userId, category: CATEGORIES.ORDER, action: 'LIVE_ORDER_BLOCKED_NO_PREFLIGHT',
            detail: `Live Order Blocked: ${finalSymbol} ${orderAction} — ${preflightBlockReason}`,
            meta: { candidateOrder, preTradeGate, preflightResult: preflightGate.result, webhookLogId: webhookLog.id },
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
          ? (parseFloat(execResult.fillPrice || execResult.rawResponse?.data?.averageprice || execResult.rawResponse?.averageprice || execResult.rawResponse?.averageTradedPrice || execResult.rawResponse?.price || execResult.rawResponse?.fillPrice || 0) || null)
          : null;

        const normalizedError = !execResult.success ? normalizeBrokerRejectionReason(execResult.message || execResult.error) : null;
        const finalErrorMessage = execResult.success ? null : normalizedError.formattedErrorMessage;

        await AuditLogger.log({
          userId, category: CATEGORIES.ORDER,
          action: execResult.success ? 'LIVE_ORDER_ACCEPTED' : 'LIVE_ORDER_REJECTED',
          detail: execResult.success
            ? `Live Execution: Broker ${connection.broker} accepted order ${execResult.orderId} via Proxy ${preTradeGate.egressIp}`
            : `Live Execution: Broker ${connection.broker} rejected order (${normalizedError.normalizedReason}): ${normalizedError.rawDetail}`,
          meta: { execResult, preTradeGate, webhookLogId: webhookLog.id, reason: normalizedError?.normalizedReason },
          req,
        });

        await prisma.algoWebhookLog.update({
          where: { id: webhookLog.id },
          data: {
            executionStatus: execResult.success ? 'LIVE_EXECUTED' : 'FAILED',
            brokerOrderId: execResult.orderId || null,
            errorMessage: finalErrorMessage,
            riskReason: execResult.success ? null : normalizedError.normalizedReason,
            actualFillPrice,
            executedAt: new Date(),
          }
        });

        // Create confirmed open position for live executed order
        if (execResult.success && orderAction !== 'EXIT') {
          const posToken = candidateOrder.symbolToken || candidateOrder.securityId || resolved?.symbolToken || resolved?.securityId || securityId || '';
          const position = await prisma.algoPosition.create({
            data: {
              userId,
              connectionId: connection.id,
              symbol: finalSymbol,
              symbolToken: posToken,
              securityId: posToken,
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

          // Deduct Token Fee for successful live algo entry
          try {
            const { AlgoTokenBillingService } = require('../services/algoTokenBillingService');
            const entryLots = Math.max(1, Math.round(qty / (finalSymbol.includes('BANKNIFTY') ? 15 : (finalSymbol.includes('FINNIFTY') ? 40 : 65))));
            await AlgoTokenBillingService.deductEntryFee({
              userId,
              connectionId: connection.id,
              brokerOrderId: execResult.orderId,
              symbol: finalSymbol,
              orderAction,
              quantity: qty,
              lots: entryLots,
              tradeId: position.id,
              req
            });
          } catch (billingErr) {
            console.error('[Webhook] Token fee deduction error:', billingErr.message);
          }

          // Telegram Notification (Non-blocking)
          try {
            const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, studentId: true } });
            const entryLots = Math.max(1, Math.round(qty / (finalSymbol.includes('BANKNIFTY') ? 15 : (finalSymbol.includes('FINNIFTY') ? 40 : 65))));
            if (orderAction === 'BUY') {
              N.algoBuyExecuted({
                studentName: student?.name || 'Student',
                studentId: student?.studentId || userId,
                symbol: finalSymbol,
                lots: entryLots,
                quantity: qty,
                price: actualFillPrice,
                orderId: execResult.orderId,
                tokensDebited: 0,
                balanceAfter: 0
              });
            } else {
              N.algoSellExecuted({
                studentName: student?.name || 'Student',
                studentId: student?.studentId || userId,
                symbol: finalSymbol,
                lots: entryLots,
                quantity: qty,
                price: actualFillPrice,
                orderId: execResult.orderId,
                tokensDebited: 0,
                balanceAfter: 0
              });
            }
          } catch (_) {}

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
          reason: execResult.success ? null : normalizedError.normalizedReason,
          errorMessage: finalErrorMessage,
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
        ? (parseFloat(execResult.fillPrice || execResult.rawResponse?.data?.averageprice || execResult.rawResponse?.averageprice || execResult.rawResponse?.averageTradedPrice || execResult.rawResponse?.price || execResult.rawResponse?.fillPrice || 0) || null)
        : null;

      const normalizedError = !execResult.success ? normalizeBrokerRejectionReason(execResult.message || execResult.error) : null;
      const finalErrorMessage = execResult.success ? null : normalizedError.formattedErrorMessage;

      await AuditLogger.log({
        userId, category: CATEGORIES.ORDER,
        action: execResult.success ? 'ORDER_ACCEPTED' : 'ORDER_REJECTED',
        detail: execResult.success
          ? `Broker ${connection.broker} accepted order. OrderID: ${execResult.orderId}`
          : `Broker ${connection.broker} rejected order (${normalizedError.normalizedReason}): ${normalizedError.rawDetail}`,
        meta: { execResult, webhookLogId: webhookLog.id, reason: normalizedError?.normalizedReason }
      });

      await prisma.algoWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          executionStatus: execResult.success ? 'EXECUTED' : 'FAILED',
          brokerOrderId: execResult.orderId || null,
          errorMessage: finalErrorMessage,
          riskReason: execResult.success ? null : normalizedError.normalizedReason,
          actualFillPrice,
          executedAt: new Date(),
        }
      });

      emitUpdate('algo_execution', {
        id: webhookLog.id, symbol: finalSymbol, action: orderAction, qty,
        status: execResult.success ? 'EXECUTED' : 'FAILED',
        orderId: execResult.orderId,
        broker: connection.broker,
        message: finalErrorMessage,
        reason: execResult.success ? null : normalizedError.normalizedReason,
        errorMessage: finalErrorMessage,
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
