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
    const ledgers = await prisma.ledger.findMany({
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

    ledgers.forEach(l => {
      const amt = l.type === 'CREDIT' ? l.amount : -l.amount;
      if (['TOKEN', 'RECHARGE', 'BONUS'].includes(l.walletType)) tokenBalance += amt;
      if (l.walletType === 'PAPER') paperBalance += amt;
      if (l.walletType === 'REFERRAL') referralBalance += amt;
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

module.exports = router;
