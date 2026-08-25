const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const dhanOptionChainService = require('../services/dhanOptionChainService');

// ══════════════════════════════════════════════════════════════════════
// OPTION CHAIN ENDPOINTS — Real Authenticated Market Data
// Rate-limited, server-cached, credential-isolated
// ══════════════════════════════════════════════════════════════════════

// GET /option-chain/expiries?symbol=NIFTY
router.get('/option-chain/expiries', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();
    const result = await dhanOptionChainService.getExpiries(symbol);

    if (!result.success && !result.expiries?.length) {
      return res.json({
        success: false,
        symbol,
        expiries: [],
        error: result.error || 'EXPIRY_DATA_UNAVAILABLE',
      });
    }

    res.json({
      success: true,
      symbol,
      expiries: result.expiries || [],
      cached: result.cached || false,
      lastUpdated: result.lastUpdated || null,
      fetchLatencyMs: result.fetchLatencyMs || null,
    });
  } catch (err) {
    res.json({ success: false, symbol: req.query.symbol, expiries: [], error: 'SERVER_ERROR' });
  }
});

const { checkUserEntitlement, requireEntitlement, getDailyFreeTradeUsage, sanitizeOptionChainForFreeUser } = require('../services/entitlementService');

// GET /option-chain?symbol=NIFTY&expiry=2026-08-13
router.get('/option-chain', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();
    const expiry = req.query.expiry;

    if (!expiry) {
      return res.json({ success: false, error: 'EXPIRY_REQUIRED', contracts: null });
    }

    const result = await dhanOptionChainService.getOptionChain(symbol, expiry);

    if (!result.success || !result.contracts || result.contracts.length === 0) {
      return res.json({
        success: false,
        symbol,
        expiry,
        spotPrice: null,
        contracts: null,
        dataTime: null,
        lastUpdated: null,
        fetchLatencyMs: null,
        snapshotAgeMs: null,
        error: result.error || 'OPTION_CHAIN_DATA_UNAVAILABLE',
      });
    }

    // Evaluate entitlement for option chain data tier
    const userId = req.user?.id;
    const entitlement = userId ? await checkUserEntitlement(userId, 'OPTION_CHAIN') : { authorized: false };
    const isPremium = entitlement.authorized;

    const contractsPayload = isPremium
      ? result.contracts
      : sanitizeOptionChainForFreeUser(result.contracts);

    res.json({
      success: true,
      tier: isPremium ? 'PREMIUM' : 'FREE',
      symbol,
      expiry,
      spotPrice: result.spotPrice,
      contracts: contractsPayload,
      totalStrikes: result.totalStrikes || result.contracts.length,
      dataTime: result.dataTime,
      lastUpdated: result.lastUpdated,
      fetchLatencyMs: result.fetchLatencyMs,
      snapshotAgeMs: result.snapshotAgeMs,
      cached: result.cached || false,
      stale: result.stale || false,
    });
  } catch (err) {
    res.json({ success: false, error: 'SERVER_ERROR', contracts: null });
  }
});

// GET /option-chain/status — Service health diagnostics (admin only)
router.get('/option-chain/status', async (req, res) => {
  try {
    const status = dhanOptionChainService.getServiceStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /daily-trade-status — Check daily free paper trade limit status
router.get('/daily-trade-status', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const entitlement = await checkUserEntitlement(userId, 'PAPER_TRADING');
    const isPremium = entitlement.authorized;
    const usage = await getDailyFreeTradeUsage(userId);

    res.json({
      success: true,
      isPremium,
      usedToday: usage.usedToday,
      maxFree: 1,
      remainingFree: isPremium ? 'UNLIMITED' : usage.remaining,
      startOfDayIST: usage.startOfDayIST
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to get Paper Balance
async function getPaperBalance(userId) {
  const ledgers = await prisma.ledger.findMany({
    where: { userId, walletType: 'PAPER' }
  });

  if (ledgers.length === 0) {
    // New user: auto-seed standard initial virtual paper capital
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const initialCapital = settings?.paperBalance || 5000000;
    try {
      await prisma.ledger.create({
        data: {
          userId,
          walletType: 'PAPER',
          amount: initialCapital,
          type: 'CREDIT',
          reason: 'WELCOME_PAPER_MARGIN'
        }
      });
      return initialCapital;
    } catch (_) {
      return initialCapital;
    }
  }

  return ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);
}

function isOptionContract(symbol) {
  if (!symbol) return false;
  const s = String(symbol).trim().toUpperCase();
  return /\s+(CE|PE)$/i.test(s) || /\d+(CE|PE)$/i.test(s) || /[-_](CE|PE)$/i.test(s);
}

function calculateMargin(symbol, productType, orderType, entryPrice, quantity) {
  const tradeValue = entryPrice * quantity;
  const isOption = isOptionContract(symbol);
  // Option BUY (Long Options) requires 100% upfront premium (1x leverage / 0 leverage)
  if (isOption && orderType === 'BUY') {
    return tradeValue;
  }
  // Generic Equity Intraday allows 5x leverage
  if (productType === 'INTRADAY') {
    return tradeValue / 5;
  }
  return tradeValue;
}

// POST /place — Order Execution (Free 1-Trade/Day IST Limit Enforced)
router.post('/place', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    // 1. Check Entitlement Tier & Daily Limit
    const entitlement = await checkUserEntitlement(userId, 'PAPER_TRADING');
    const isPremium = entitlement.authorized;

    if (!isPremium) {
      const usage = await getDailyFreeTradeUsage(userId);
      if (usage.usedToday >= 1) {
        return res.status(403).json({
          success: false,
          error: 'FREE_DAILY_TRADE_LIMIT_REACHED',
          message: 'Free daily paper trade limit reached (1/1 used today). Upgrade to Premium Membership for unlimited paper trading.',
          dailyUsage: usage
        });
      }
    }
    const { symbol, productType, orderType, quantity, entryPrice, orderExecutionType, limitPrice, currentMarketPrice } = req.body;

    if (!symbol || !productType || !orderType || !quantity || !entryPrice) {
      return res.status(400).json({ error: 'Missing required trade parameters' });
    }

    if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be positive' });

    // Delivery short selling is not allowed in Indian markets.
    if (productType === 'DELIVERY' && orderType === 'SELL') {
      return res.status(400).json({ error: 'Delivery short selling is not permitted.' });
    }

    // Determine if order should be OPEN (filled immediately) or PENDING (waiting for limit trigger)
    const isLimitOrder = orderExecutionType === 'LIMIT' && limitPrice != null;
    let initialStatus = 'OPEN';
    const effectiveEntryPrice = isLimitOrder ? Number(limitPrice) : Number(entryPrice);

    if (isLimitOrder && currentMarketPrice != null) {
      const cmp = Number(currentMarketPrice);
      const lp = Number(limitPrice);
      if (orderType === 'BUY' && cmp > lp) {
        initialStatus = 'PENDING';
      } else if (orderType === 'SELL' && cmp < lp) {
        initialStatus = 'PENDING';
      }
    }

    // Calculate required margin (Option BUY requires 100% premium, Intraday equity gets 5x)
    const requiredMargin = calculateMargin(symbol, productType, orderType, effectiveEntryPrice, quantity);

    // Check balance
    const currentBalance = await getPaperBalance(req.user.id);
    if (currentBalance < requiredMargin) {
      return res.status(400).json({ 
        error: `Insufficient Paper Balance. Required: ₹${requiredMargin.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}` 
      });
    }

    // Process Transaction (Deduct Margin and Create Trade)
    let trade;
    await prisma.$transaction(async (tx) => {
      // Block margin for the order
      await tx.ledger.create({
        data: {
          userId: req.user.id,
          walletType: 'PAPER',
          amount: requiredMargin,
          type: 'DEBIT',
          reason: `TRADE_MARGIN_BLOCKED_${symbol}`
        }
      });

      // Create Trade
      trade = await tx.trade.create({
        data: {
          userId: req.user.id,
          symbol,
          productType,
          orderType,
          quantity,
          entryPrice: effectiveEntryPrice,
          status: initialStatus
        }
      });
    });

    if (req.io) req.io.to(req.user.studentId).emit(initialStatus === 'PENDING' ? 'order_placed' : 'trade_opened', trade);
    
    res.json({ success: true, trade, requiredMargin, isPending: initialStatus === 'PENDING' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /cancel-order — Cancel PENDING limit order and refund blocked margin
router.post('/cancel-order', async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: 'Missing tradeId' });

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.userId !== req.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (trade.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending orders can be cancelled' });
    }

    const marginToRefund = calculateMargin(trade.symbol, trade.productType, trade.orderType, trade.entryPrice, trade.quantity);

    let cancelledTrade;
    await prisma.$transaction(async (tx) => {
      cancelledTrade = await tx.trade.update({
        where: { id: tradeId },
        data: { status: 'CANCELLED', closedAt: new Date() }
      });

      await tx.ledger.create({
        data: {
          userId: req.user.id,
          walletType: 'PAPER',
          amount: marginToRefund,
          type: 'CREDIT',
          reason: `TRADE_CANCELLED_MARGIN_REFUND_${trade.symbol}`
        }
      });
    });

    res.json({ success: true, trade: cancelledTrade, refundedMargin: marginToRefund });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper / Route to trigger pending limit orders when market price reaches limit
async function processPendingOrders(symbol, currentMarketPrice) {
  const pendingTrades = await prisma.trade.findMany({
    where: {
      symbol,
      status: 'PENDING'
    }
  });

  const filledTrades = [];
  for (const t of pendingTrades) {
    let shouldFill = false;
    if (t.orderType === 'BUY' && currentMarketPrice <= t.entryPrice) {
      shouldFill = true;
    } else if (t.orderType === 'SELL' && currentMarketPrice >= t.entryPrice) {
      shouldFill = true;
    }

    if (shouldFill) {
      const updated = await prisma.trade.update({
        where: { id: t.id },
        data: { status: 'OPEN', openedAt: new Date() }
      });
      filledTrades.push(updated);
    }
  }
  return filledTrades;
}

router.post('/trigger-pending', async (req, res) => {
  try {
    const { symbol, currentPrice } = req.body;
    if (!symbol || currentPrice == null) return res.status(400).json({ error: 'Missing parameters' });
    const filled = await processPendingOrders(symbol, Number(currentPrice));
    res.json({ success: true, filledCount: filled.length, filledTrades: filled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /close
router.post('/close', async (req, res) => {
  try {
    const { tradeId, exitPrice } = req.body;
    
    if (!tradeId || !exitPrice) return res.status(400).json({ error: 'Missing parameters' });

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.userId !== req.user.id) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    if (trade.status === 'CLOSED') {
      return res.status(400).json({ error: 'Trade is already closed' });
    }

    const isBuy = trade.orderType === 'BUY';
    const pnl = isBuy 
      ? (exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - exitPrice) * trade.quantity;

    // Calculate original margin used (Option BUY was 100% premium, Intraday equity was 5x)
    const originalMargin = calculateMargin(trade.symbol, trade.productType, trade.orderType, trade.entryPrice, trade.quantity);

    const totalRefund = originalMargin + pnl;

    let closedTrade;
    await prisma.$transaction(async (tx) => {
      // Update Trade
      closedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: { status: 'CLOSED', exitPrice, pnl, closedAt: new Date() }
      });

      // Refund margin + PnL
      if (totalRefund > 0) {
        await tx.ledger.create({
          data: {
            userId: req.user.id,
            walletType: 'PAPER',
            amount: totalRefund,
            type: 'CREDIT',
            reason: `TRADE_CLOSED_SETTLEMENT_${trade.symbol}`
          }
        });
      } else if (totalRefund < 0) {
        // Technically if PnL is so negative it eats margin, we need to debit more.
        await tx.ledger.create({
          data: {
            userId: req.user.id,
            walletType: 'PAPER',
            amount: Math.abs(totalRefund),
            type: 'DEBIT',
            reason: `TRADE_CLOSED_SETTLEMENT_LOSS_${trade.symbol}`
          }
        });
      }
    });

    if (req.io) req.io.to(req.user.studentId).emit('trade_closed', closedTrade);
    
    res.json({ success: true, trade: closedTrade });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /positions
router.get('/positions', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const trades = await prisma.trade.findMany({ 
      where: { 
        userId: req.user.id,
        OR: [
          { status: 'OPEN' },
          { status: 'CLOSED', closedAt: { gte: today } } // Only today's closed trades in positions
        ]
      },
      orderBy: { openedAt: 'desc' }
    });

    const openPositions = trades.filter(t => t.status === 'OPEN');
    const closedPositions = trades.filter(t => t.status === 'CLOSED');

    res.json({ openPositions, closedPositions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /history (Full History)
router.get('/history', async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({ 
      where: { userId: req.user.id, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' }
    });
    res.json({ trades });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
