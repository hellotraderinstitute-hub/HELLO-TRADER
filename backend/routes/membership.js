const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// Get Membership Status
router.get('/', async (req, res) => {
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id },
      orderBy: { expiresAt: 'desc' }
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });

    res.json({
      membership,
      trialStartedAt: user.trialStartedAt,
      trialDays: settings.trialDays
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate Membership
router.post('/activate', async (req, res) => {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });

    // Calc token balance from Ledger
    const ledgers = await prisma.ledger.findMany({
      where: { userId: req.user.id, walletType: 'TOKEN' }
    });
    const tokenBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    if (tokenBalance < settings.monthlyCost) {
      return res.status(400).json({ error: 'Insufficient Token Balance.' });
    }

    // Deduct tokens
    await prisma.ledger.create({
      data: {
        userId: req.user.id,
        walletType: 'TOKEN',
        amount: settings.monthlyCost,
        type: 'DEBIT',
        reason: 'MEMBERSHIP_ACTIVATION'
      }
    });

    // Determine current expiry to append to
    const existing = await prisma.membership.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      orderBy: { expiresAt: 'desc' }
    });

    const now = new Date();
    const currentExpiry = existing && existing.expiresAt > now ? existing.expiresAt.getTime() : now.getTime();
    const newExpiry = new Date(currentExpiry + settings.membershipDuration * 24 * 60 * 60 * 1000);

    if (existing) {
      await prisma.membership.update({
        where: { id: existing.id },
        data: { expiresAt: newExpiry }
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: req.user.id,
          expiresAt: newExpiry,
          autoRenew: false
        }
      });
    }

    // Update Referral status to SUCCESS if PENDING and reward Referrer
    const pendingReferral = await prisma.referral.findFirst({
      where: { referredId: req.user.id, status: 'PENDING' }
    });

    if (pendingReferral) {
      await prisma.referral.update({
        where: { id: pendingReferral.id },
        data: { status: 'SUCCESS', successAt: new Date() }
      });

      // 200 Referral Tokens to referrer
      await prisma.ledger.create({
        data: {
          userId: pendingReferral.referrerId,
          walletType: 'REFERRAL',
          amount: settings.referralReward || 200, // Typically 200 based on requirements
          type: 'CREDIT',
          reason: `REFERRAL_REWARD_${req.user.id}`
        }
      });
    }

    res.json({ success: true, expiresAt: newExpiry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle Auto-Renew
router.post('/auto-renew', async (req, res) => {
  try {
    const { autoRenew } = req.body;
    const existing = await prisma.membership.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' }
    });
    if (!existing) return res.status(400).json({ error: 'No active membership.' });

    await prisma.membership.update({
      where: { id: existing.id },
      data: { autoRenew }
    });
    res.json({ success: true, autoRenew });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
