const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const { N } = require('../services/notifier');

// Get Active Membership Plans
router.get('/plans', async (req, res) => {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const currentCost = Number(settings?.monthlyCost || 900);

    let plans = await prisma.membershipPlan.findMany({
      orderBy: { durationDays: 'asc' }
    });

    if (plans.length === 0) {
      const defaultPlan = await prisma.membershipPlan.create({
        data: {
          name: 'Monthly Membership',
          durationDays: 30,
          price: currentCost,
          description: 'Standard 30-Day Trading Terminal Access'
        }
      });
      plans = [defaultPlan];
    } else {
      // Keep single monthly plan price strictly synced with dynamic SystemSettings.monthlyCost
      plans = plans.map(p => ({
        ...p,
        price: p.durationDays === 30 ? currentCost : p.price
      }));
    }

    res.json({ success: true, plans, monthlyCost: currentCost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Membership Status
router.get('/', async (req, res) => {
  try {
    let membership = await prisma.membership.findFirst({
      where: { userId: req.user.id },
      orderBy: { expiresAt: 'desc' }
    });

    // Auto-expire: if expiresAt is past, update status to EXPIRED in DB
    if (membership && membership.status === 'ACTIVE' && new Date(membership.expiresAt) < new Date()) {
      membership = await prisma.membership.update({
        where: { id: membership.id },
        data: { status: 'EXPIRED' }
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });

    res.json({
      membership,
      trialStartedAt: user?.trialStartedAt || null,
      trialDays: settings?.trialDays || 4
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate Membership Plan
router.post('/activate', async (req, res) => {
  try {
    const { planId, durationDays: customDuration, price: customPrice } = req.body;
    let cost = 900;
    let durationDays = 30;
    let planName = 'Membership Plan';

    if (planId) {
      const targetPlan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
      if (targetPlan) {
        cost = targetPlan.price;
        durationDays = targetPlan.durationDays;
        planName = targetPlan.name;
      }
    } else if (customDuration && customPrice) {
      durationDays = Number(customDuration);
      cost = Number(customPrice);
    } else {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      cost = settings?.monthlyCost || 900;
      durationDays = settings?.membershipDuration || 30;
    }

    // Calc token balance from Ledger
    const ledgers = await prisma.ledger.findMany({
      where: {
        userId: req.user.id,
        walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] }
      }
    });
    const tokenBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    if (tokenBalance < cost) {
      return res.status(400).json({ error: `Insufficient Token Balance. Required: ₹${cost} tokens.` });
    }

    // Deduct tokens
    await prisma.ledger.create({
      data: {
        userId: req.user.id,
        walletType: 'TOKEN',
        amount: cost,
        type: 'DEBIT',
        reason: `MEMBERSHIP_ACTIVATION_${durationDays}_DAYS`
      }
    });

    // Determine current expiry to append to
    const existing = await prisma.membership.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
      orderBy: { expiresAt: 'desc' }
    });

    const now = new Date();
    const currentExpiry = existing && new Date(existing.expiresAt) > now ? new Date(existing.expiresAt).getTime() : now.getTime();
    const newExpiry = new Date(currentExpiry + durationDays * 24 * 60 * 60 * 1000);

    let updatedMembership;
    if (existing) {
      updatedMembership = await prisma.membership.update({
        where: { id: existing.id },
        data: { expiresAt: newExpiry, status: 'ACTIVE' }
      });
    } else {
      updatedMembership = await prisma.membership.create({
        data: {
          userId: req.user.id,
          expiresAt: newExpiry,
          status: 'ACTIVE',
          autoRenew: false
        }
      });
    }

    // Update Referral status to SUCCESS if PENDING and reward Referrer
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
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
          amount: settings?.referralReward || 200,
          type: 'CREDIT',
          reason: `REFERRAL_REWARD_${req.user.id}`
        }
      });
    }

    // Notify referral reward if applicable
    if (pendingReferral) {
      const referrer = await prisma.user.findUnique({ where: { id: pendingReferral.referrerId }, select: { name: true, studentId: true } });
      const activatingUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, studentId: true } });
      if (referrer) {
        N.referralRewardCredited({ referrerName: referrer.name, referrerId: referrer.studentId, amount: settings?.referralReward || 200, newUserName: activatingUser?.name || 'New Student' });
      }
    }

    // Notify membership activated
    const activatingUser2 = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, studentId: true } });
    N.membershipActivated({ studentName: activatingUser2?.name || 'Student', studentId: activatingUser2?.studentId || req.user.id, durationDays, expiresAt: newExpiry });

    res.json({ success: true, membership: updatedMembership, expiresAt: newExpiry, durationDays, planName });
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

// In-memory idempotency cache for payment requests
const idempotencyCache = new Map();

// Unlock 30-Day Premium AI Access Pass with 299 Cash Tokens (₹299)
router.post('/unlock-ai-pass', async (req, res) => {
  const userId = req.user.id;
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;

  // 1. Idempotency Check (Prevent duplicate deduction on network retries)
  if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
    return res.json(idempotencyCache.get(idempotencyKey));
  }

  const aiPassCost = 299;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Calculate token balance atomically inside transaction from Ledger
      const ledgers = await tx.ledger.findMany({
        where: { userId: userId, walletType: 'TOKEN' }
      });
      const tokenBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

      // Negative balance guard inside atomic transaction
      if (tokenBalance < aiPassCost) {
        throw new Error(`INSUFFICIENT_TOKENS: Current balance ₹${tokenBalance.toFixed(2)} is below required ₹${aiPassCost}`);
      }

      // Record Atomic Ledger DEBIT Entry
      await tx.ledger.create({
        data: {
          userId: userId,
          walletType: 'TOKEN',
          amount: aiPassCost,
          type: 'DEBIT',
          reason: 'PREMIUM_AI_PASS_ACTIVATION'
        }
      });

      // Extend or Create 30-Day Premium Membership
      const existing = await tx.membership.findFirst({
        where: { userId: userId, status: 'ACTIVE' },
        orderBy: { expiresAt: 'desc' }
      });

      const now = new Date();
      const currentExpiry = existing && existing.expiresAt > now ? existing.expiresAt.getTime() : now.getTime();
      const newExpiry = new Date(currentExpiry + 30 * 24 * 60 * 60 * 1000);

      let membership;
      if (existing) {
        membership = await tx.membership.update({
          where: { id: existing.id },
          data: { expiresAt: newExpiry, status: 'ACTIVE' }
        });
      } else {
        membership = await tx.membership.create({
          data: {
            userId: userId,
            expiresAt: newExpiry,
            status: 'ACTIVE',
            autoRenew: false
          }
        });
      }

      return {
        success: true,
        message: '30-Day Premium AI Access Pass Activated!',
        newBalance: tokenBalance - aiPassCost,
        expiresAt: newExpiry
      };
    });

    // Cache idempotency response for 10 minutes
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, result);
      setTimeout(() => idempotencyCache.delete(idempotencyKey), 10 * 60 * 1000);
    }

    return res.json(result);

  } catch (error) {
    if (error.message && error.message.startsWith('INSUFFICIENT_TOKENS')) {
      return res.status(400).json({ error: 'INSUFFICIENT_TOKENS', message: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
