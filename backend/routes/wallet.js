const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// Get Wallet Balance and Ledger
router.get('/', async (req, res) => {
  try {
    const ledgers = await prisma.ledger.findMany({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'desc' }
    });

    const paymentHistory = await prisma.paymentRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'desc' }
    });

    let tokenBalance = 0;
    let paperBalance = 0;
    let referralBalance = 0;

    ledgers.forEach(l => {
      const amt = l.type === 'CREDIT' ? l.amount : -l.amount;
      if (l.walletType === 'TOKEN') tokenBalance += amt;
      if (l.walletType === 'PAPER') paperBalance += amt;
      if (l.walletType === 'REFERRAL') referralBalance += amt;
    });

    res.json({ tokenBalance, paperBalance, referralBalance, ledger: ledgers, paymentHistory });
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
    res.json({ success: true, request });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
