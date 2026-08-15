/**
 * MasterOrderPoller — Hello Trader Copy Trading Source-of-Truth Engine
 *
 * PURPOSE:
 *   Poll each active master trader's broker account every N seconds during
 *   market hours. Detect newly filled, partially filled, or exited orders.
 *   Trigger CopyEngine.replicateFill() for each new event.
 *
 * DESIGN:
 *   - One interval per active master (stored in pollerMap)
 *   - Dedup via CopyMasterOrder table (masterId + brokerOrderId UNIQUE)
 *   - Partial fill delta tracking (lastFilledQty field)
 *   - Exit detection via opposite-side fill on same symbol
 *   - Market hours guard: IST 09:10 – 15:35 on weekdays only
 *   - Global kill switch + master kill switch respected
 *   - Completely independent from Algo Trading webhook flow
 *
 * DATA FLOW:
 *   [Scheduler / server boot]
 *         ↓
 *   MasterOrderPoller.startAll()
 *         ↓
 *   setInterval → _pollMaster(masterId) every pollIntervalSecs
 *         ↓
 *   BrokerGateway.getOrders(masterConnection)
 *         ↓
 *   Compare with CopyMasterOrder table
 *         ↓
 *   New fill? → CopyEngine.replicateFill(masterCopyOrder, master, io)
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const { BrokerGateway } = require('./brokerGateway/BrokerGateway');
const { AuditLogger, CATEGORIES } = require('./auditLogger');

const prisma = new PrismaClient();

// Map<masterId, intervalId> — tracks active pollers
const pollerMap = new Map();

// ─── Market Hours Guard ──────────────────────────────────────────────────────
// Poll only during NSE market hours (IST 09:10 – 15:35) on weekdays
function isMarketOpen() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);

  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours   = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const totalMin = hours * 60 + minutes;

  // 09:10 = 550 min,  15:35 = 935 min
  return totalMin >= 550 && totalMin <= 935;
}

// ─── Classify Order Event Type ───────────────────────────────────────────────
// Determines whether a broker order represents an ENTRY, EXIT, or PARTIAL_FILL
// by comparing against known open positions for this master.
async function classifyEvent(masterId, order, knownOpenPositions) {
  // If there is a known open position in the same symbol with opposite side → EXIT
  const openPos = knownOpenPositions.find(
    p => p.symbol === order.symbol && p.side !== order.side
  );
  if (openPos) return 'EXIT';

  // If already partially filled before → PARTIAL_FILL
  const existing = await prisma.copyMasterOrder.findUnique({
    where: { masterId_brokerOrderId: { masterId, brokerOrderId: order.orderId } }
  });
  if (existing && existing.filledQty > 0 && order.filledQty > existing.filledQty) {
    return 'PARTIAL_FILL';
  }

  return 'ENTRY';
}

// ─── Core Poll Tick ──────────────────────────────────────────────────────────
async function _pollMaster(masterId, io) {
  try {
    // 1. Re-fetch master to check kill switch / active state
    const master = await prisma.copyMaster.findUnique({
      where: { id: masterId },
      include: {
        user: { select: { id: true, name: true, studentId: true } },
        followers: {
          where: { isActive: true, killSwitchActive: false, emergencyStop: false, consentAccepted: true },
          include: { user: true }
        }
      }
    });

    if (!master) {
      console.warn(`[Poller] Master ${masterId} not found — stopping poller`);
      stopMaster(masterId);
      return;
    }

    if (!master.isActive || master.killSwitch || !master.pollingEnabled) {
      console.log(`[Poller] Master ${master.displayName} inactive/killed/polling-off — stopping`);
      stopMaster(masterId);
      return;
    }

    // 2. Global kill switch
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (settings?.globalKillSwitch) {
      console.log('[Poller] Global kill switch active — all polling paused');
      return; // Don't stop, just skip this tick
    }

    // 3. Market hours check
    if (!isMarketOpen()) return;

    // 4. Get master's broker connection
    const connection = await prisma.algoBrokerConnection.findFirst({
      where: { id: master.connectionId, userId: master.userId, isActive: true, killSwitchActive: false }
    });

    if (!connection) {
      console.warn(`[Poller] Master ${master.displayName} has no active broker connection`);
      return;
    }

    // 5. Fetch today's orders from master's broker
    const brokerOrders = await BrokerGateway.getOrders(connection);

    if (!brokerOrders || brokerOrders.length === 0) return;

    // 6. Update master's lastPolledAt timestamp
    await prisma.copyMaster.update({
      where: { id: masterId },
      data: { lastPolledAt: new Date() }
    });

    // 7. Load today's known open CopyMasterOrders to classify exits
    const knownOrders = await prisma.copyMasterOrder.findMany({
      where: { masterId, status: { in: ['FILLED', 'PARTIALLY_FILLED'] } }
    });
    const openPositions = knownOrders.map(o => ({ symbol: o.symbol, side: o.side }));

    // 8. Process each broker order — detect new events
    for (const brokerOrder of brokerOrders) {
      await _processOrder({ master, connection, brokerOrder, openPositions, io });
    }

  } catch (err) {
    console.error(`[Poller] Error polling master ${masterId}:`, err.message);
  }
}

// ─── Process One Broker Order ────────────────────────────────────────────────
async function _processOrder({ master, connection, brokerOrder, openPositions, io }) {
  const masterId = master.id;
  const { orderId, symbol, exchange, side, totalQty, filledQty, avgPrice,
          status, productType, orderType } = brokerOrder;

  // Only process orders that have actual fills
  if (filledQty === 0) return;
  // Skip cancelled/rejected entirely
  if (status === 'CANCELLED' || status === 'REJECTED') {
    // Mark existing record as cancelled if it exists
    try {
      await prisma.copyMasterOrder.updateMany({
        where: { masterId, brokerOrderId: orderId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        data: { status }
      });
    } catch (_) {}
    return;
  }

  try {
    // 1. Upsert CopyMasterOrder — create or get existing
    let masterCopyOrder = await prisma.copyMasterOrder.findUnique({
      where: { masterId_brokerOrderId: { masterId, brokerOrderId: orderId } }
    });

    if (!masterCopyOrder) {
      // Brand new order seen for first time with fills
      const eventType = await classifyEvent(masterId, brokerOrder, openPositions);

      // Source Classification: Check if order exists in AlgoWebhookLog / AlgoPosition
      const algoLog = await prisma.algoWebhookLog.findFirst({
        where: { connectionId: master.connectionId, brokerOrderId: orderId }
      });
      const tradeSource = algoLog ? 'ALGO' : 'MANUAL';
      const webhookLogId = algoLog ? algoLog.id : null;

      masterCopyOrder = await prisma.copyMasterOrder.create({
        data: {
          masterId,
          brokerOrderId: orderId,
          symbol,
          exchange: exchange || 'NSE',
          side,
          totalQty,
          filledQty,
          avgPrice,
          productType: productType || 'MIS',
          orderType: orderType || 'MARKET',
          status,
          eventType,
          tradeSource,
          webhookLogId,
          lastFilledQty: 0,  // Will be updated after dispatch
          copyDispatched: false,
        }
      });

      console.log(`[Poller] NEW ${eventType} [SOURCE: ${tradeSource}]: ${side} ${filledQty}/${totalQty} ${symbol} @ ₹${avgPrice} (Master: ${master.displayName})`);

      // Dispatch to copy engine
      await _dispatchToFollowers({ master, masterCopyOrder, deltaQty: filledQty, tradeSource, webhookLogId, io });

    } else {
      // Known order — check for partial fill delta
      const prevFilledQty = masterCopyOrder.lastFilledQty;
      const deltaQty = filledQty - prevFilledQty;

      if (deltaQty <= 0) return; // No new fills since last poll

      // Update master order record
      await prisma.copyMasterOrder.update({
        where: { id: masterCopyOrder.id },
        data: {
          filledQty,
          avgPrice,
          status,
          lastPolledAt: new Date(),
          eventType: 'PARTIAL_FILL',
        }
      });

      console.log(`[Poller] PARTIAL_FILL delta +${deltaQty} ${symbol} (Master: ${master.displayName})`);

      // Dispatch only the delta qty
      await _dispatchToFollowers({
        master,
        masterCopyOrder: { ...masterCopyOrder, filledQty, avgPrice, eventType: 'PARTIAL_FILL' },
        deltaQty,
        io
      });
    }

  } catch (err) {
    if (err.code === 'P2002') {
      // Unique constraint race — another tick already created this record, safe to ignore
      return;
    }
    console.error(`[Poller] _processOrder error for ${orderId}:`, err.message);
  }
}

// ─── Dispatch to CopyEngine ──────────────────────────────────────────────────
async function _dispatchToFollowers({ master, masterCopyOrder, deltaQty, io }) {
  try {
    // Lazy-load CopyEngine to avoid circular dependency
    const { CopyEngine } = require('./copyEngine');

    await CopyEngine.replicateFill({
      master,
      masterCopyOrder,
      deltaQty,
      io,
    });

    // Mark last dispatched qty
    await prisma.copyMasterOrder.update({
      where: { id: masterCopyOrder.id },
      data: {
        lastFilledQty: masterCopyOrder.filledQty,
        copyDispatched: true,
      }
    });

    // Emit real-time update to master's room
    if (io) {
      io.to(master.userId).emit('copy_master_poll', {
        type: 'ORDER_DETECTED',
        order: {
          symbol: masterCopyOrder.symbol,
          side: masterCopyOrder.side,
          filledQty: masterCopyOrder.filledQty,
          avgPrice: masterCopyOrder.avgPrice,
          eventType: masterCopyOrder.eventType,
          status: masterCopyOrder.status,
        },
        followersCount: master.followers?.length || 0,
        timestamp: new Date().toISOString(),
      });
    }

    await AuditLogger.log({
      userId: master.userId,
      category: CATEGORIES.COPY,
      action: 'MASTER_ORDER_DETECTED',
      detail: `[Poll] ${masterCopyOrder.eventType}: ${masterCopyOrder.side} ${deltaQty}/${masterCopyOrder.totalQty} ${masterCopyOrder.symbol} @ ₹${masterCopyOrder.avgPrice}`,
      meta: {
        masterId: master.id,
        brokerOrderId: masterCopyOrder.brokerOrderId,
        deltaQty,
        eventType: masterCopyOrder.eventType,
      }
    });

  } catch (err) {
    console.error(`[Poller] _dispatchToFollowers error:`, err.message);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start polling for a specific master.
 * Safe to call multiple times — will not create duplicate pollers.
 */
function startMaster(masterId, io, intervalSecs = 5) {
  if (pollerMap.has(masterId)) {
    console.log(`[Poller] Master ${masterId} already polling`);
    return;
  }

  const intervalMs = Math.max(3, intervalSecs) * 1000; // Minimum 3s
  const intervalId = setInterval(() => _pollMaster(masterId, io), intervalMs);
  pollerMap.set(masterId, intervalId);

  console.log(`[Poller] Started polling master ${masterId} every ${intervalSecs}s`);
}

/**
 * Stop polling for a specific master.
 */
function stopMaster(masterId) {
  if (pollerMap.has(masterId)) {
    clearInterval(pollerMap.get(masterId));
    pollerMap.delete(masterId);
    console.log(`[Poller] Stopped polling master ${masterId}`);
  }
}

/**
 * Start polling for all masters that have pollingEnabled=true.
 * Called on server boot.
 */
async function startAll(io) {
  try {
    const activeMasters = await prisma.copyMaster.findMany({
      where: { isActive: true, killSwitch: false }
    });

    for (const master of activeMasters) {
      startMaster(master.id, io, master.pollIntervalSecs || 5);
    }

    console.log(`[Poller] Auto-started ${activeMasters.length} master poller(s) on boot`);
  } catch (err) {
    console.error('[Poller] startAll() error:', err.message);
  }
}

/**
 * Stop all pollers (e.g., on graceful shutdown).
 */
function stopAll() {
  for (const [masterId, intervalId] of pollerMap) {
    clearInterval(intervalId);
    console.log(`[Poller] Stopped master ${masterId}`);
  }
  pollerMap.clear();
}

/**
 * Get list of currently active master IDs being polled.
 */
function getActivePollers() {
  return Array.from(pollerMap.keys());
}

module.exports = {
  startMaster,
  stopMaster,
  startAll,
  stopAll,
  getActivePollers,
};
