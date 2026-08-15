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

    res.json({
      success: true,
      symbol,
      expiry,
      spotPrice: result.spotPrice,
      contracts: result.contracts,
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

// Helper to get Paper Balance
async function getPaperBalance(userId) {
  const ledgers = await prisma.ledger.findMany({
    where: { userId, walletType: 'PAPER' }
  });
  return ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);
}

// POST /place
router.post('/place', async (req, res) => {
  try {
    const { symbol, productType, orderType, quantity, entryPrice } = req.body;
    
    if (!symbol || !productType || !orderType || !quantity || !entryPrice) {
      return res.status(400).json({ error: 'Missing required trade parameters' });
    }

    if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be positive' });

    // Delivery short selling is not allowed in Indian markets.
    if (productType === 'DELIVERY' && orderType === 'SELL') {
      // In a real system, we'd check their holdings. For now, block naked delivery shorts.
      return res.status(400).json({ error: 'Delivery short selling is not permitted.' });
    }

    // Calculate required margin
    const tradeValue = entryPrice * quantity;
    const requiredMargin = productType === 'INTRADAY' ? tradeValue / 5 : tradeValue;

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
      // Block margin
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
          entryPrice,
          status: 'OPEN'
        }
      });
    });

    if (req.io) req.io.to(req.user.studentId).emit('trade_opened', trade);
    
    res.json({ success: true, trade, requiredMargin });
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

    // Calculate original margin used
    const tradeValue = trade.entryPrice * trade.quantity;
    const originalMargin = trade.productType === 'INTRADAY' ? tradeValue / 5 : tradeValue;

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
