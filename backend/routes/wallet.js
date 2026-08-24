const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const { N } = require('../services/notifier');

// Get Public Payment Configuration for User Display
router.get('/payment-config', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'CONFIG' } });
    }

    res.json({
      success: true,
      tokenPrice: settings.tokenPrice || 1,
      upiEnabled: settings.upiEnabled ?? true,
      upiId: settings.upiId || '7665977937@ybl',
      upiHolderName: settings.upiHolderName || 'Hello Trader Institute',

      qrEnabled: settings.qrEnabled ?? true,
      qrImageUrl: settings.qrImageUrl || '/images/payment_qr.png',

      bankEnabled: settings.bankEnabled ?? true,
      bankName: settings.bankName || 'Bank of Baroda',
      bankAccountName: settings.bankAccountName || 'Hello Trader Institute',
      bankAccountNumber: settings.bankAccountNumber || '28668100005444',
      bankIfsc: settings.bankIfsc || 'BARB0SHIVBS',
      bankBranch: settings.bankBranch || 'Main Branch'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Wallet Balance and Ledger
router.get('/', async (req, res) => {
  try {
    const rawLedgers = await prisma.ledger.findMany({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'desc' }
    });

    const paymentHistory = await prisma.paymentRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'desc' }
    });

    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });

    let tokenBalance = 0;
    let paperBalance = 0;
    let referralBalance = 0;

    const paperLedgers = rawLedgers.filter(l => l.walletType === 'PAPER');
    if (paperLedgers.length === 0) {
      const initialCapital = settings?.paperBalance || 5000000;
      try {
        const welcomeLedger = await prisma.ledger.create({
          data: {
            userId: req.user.id,
            walletType: 'PAPER',
            amount: initialCapital,
            type: 'CREDIT',
            reason: 'WELCOME_PAPER_MARGIN'
          }
        });
        rawLedgers.unshift(welcomeLedger);
        paperBalance = initialCapital;
      } catch (_) {
        paperBalance = initialCapital;
      }
    } else {
      paperLedgers.forEach(l => {
        paperBalance += (l.type === 'CREDIT' ? l.amount : -l.amount);
      });
    }

    rawLedgers.forEach(l => {
      const amt = l.type === 'CREDIT' ? l.amount : -l.amount;
      if (['TOKEN', 'RECHARGE', 'BONUS'].includes(l.walletType)) tokenBalance += amt;
      if (l.walletType === 'REFERRAL') referralBalance += amt;
    });

    // Format ledgers with parsed metadata for Algo trades
    const ledgers = rawLedgers.map(l => {
      let algoMeta = null;
      let displayReason = l.reason;

      if (l.reason.startsWith('ALGO_ENTRY:') || l.reason.startsWith('ALGO_EXIT:')) {
        try {
          const parts = l.reason.split('|');
          if (parts.length > 1) {
            algoMeta = JSON.parse(parts[1]);
            const eventLabel = algoMeta.type === 'ALGO_ENTRY' ? 'ALGO ENTRY' : 'ALGO EXIT';
            displayReason = `${eventLabel}: ${algoMeta.symbol} (${algoMeta.lots} Lot${algoMeta.lots > 1 ? 's' : ''} / ${algoMeta.quantity} Qty) | Order: ${algoMeta.brokerOrderId}`;
          } else {
            const isEntry = l.reason.startsWith('ALGO_ENTRY:');
            const orderId = l.reason.split(':')[3] || 'N/A';
            displayReason = `${isEntry ? 'ALGO ENTRY' : 'ALGO EXIT'}: Order ${orderId}`;
          }
        } catch (_) {}
      }

      return {
        ...l,
        displayReason,
        algoMeta
      };
    });

    res.json({
      tokenBalance: Math.max(0, tokenBalance),
      rawLedgerTokenBalance: tokenBalance,
      paperBalance: Math.max(0, paperBalance),
      referralBalance: Math.max(0, referralBalance),
      tokenPrice: settings?.tokenPrice || 1,
      ledger: ledgers,
      paymentHistory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit Payment Proof (Buy Tokens)
router.post('/payment-proof', async (req, res) => {
  try {
    const { amount, method, utr, screenshotUrl } = req.body;
    
    if (!utr && !screenshotUrl) {
      return res.status(400).json({ error: 'Please upload a screenshot or enter a valid UTR Number.' });
    }

    if (utr) {
      const existing = await prisma.paymentRequest.findUnique({ where: { utr } });
      if (existing) {
        return res.status(400).json({ error: 'Duplicate UTR detected. This payment has already been used.' });
      }
    }

    const request = await prisma.paymentRequest.create({
      data: {
        userId: req.user.id,
        amount: Number(amount) || 0,
        method,
        utr,
        screenshotUrl
      }
    });

    // Fetch student info for notification
    const student = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, studentId: true } });
    N.newPaymentRequest({ studentName: student?.name || 'Unknown', studentId: student?.studentId || req.user.id, amount: Number(amount) || 0, method, utr });

    res.json({ success: true, request });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/wallet/algo-statements ──────────────────────────
// Detailed user ledger statements for Algo Trading entry & exit token debits
router.get('/algo-statements', async (req, res) => {
  try {
    const { AlgoTokenBillingService } = require('../services/algoTokenBillingService');
    const statements = await AlgoTokenBillingService.getUserAlgoStatements(req.user.id);
    const balance = await AlgoTokenBillingService.getUserTokenBalance(req.user.id);
    res.json({ success: true, statements, currentTokenBalance: balance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
