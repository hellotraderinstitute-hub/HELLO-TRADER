const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// Get Referral Stats
router.get('/', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    
    // Stats:
    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.id }
    });

    const totalRegistrations = referrals.length;
    const pending = referrals.filter(r => r.status === 'PENDING').length;
    const success = referrals.filter(r => r.status === 'SUCCESS').length;
    const rejected = referrals.filter(r => r.status === 'REJECTED' || r.status === 'INVALID').length;

    // Check last 30 days success count
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSuccessReferrals = referrals.filter(r => 
      r.status === 'SUCCESS' && r.successAt && r.successAt >= thirtyDaysAgo
    );
    const recentSuccessCount = recentSuccessReferrals.length;

    // Unclaimed successful referrals for special bonus (3 required)
    const unclaimedForBonus = recentSuccessReferrals.filter(r => !r.bonusClaimed);

    // Get Referral Balance
    const ledgers = await prisma.ledger.findMany({
      where: { userId: user.id, walletType: 'REFERRAL' }
    });
    const referralBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    res.json({
      referralCode: user.referralCode,
      stats: { totalRegistrations, pending, success, rejected, recentSuccessCount },
      referralBalance,
      canWithdraw: recentSuccessCount >= 3,
      eligibleForSpecialBonus: unclaimedForBonus.length >= 3,
      unclaimedBonusReferrals: unclaimedForBonus.map(r => r.id)
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert Referral Tokens to Trading Tokens
router.post('/convert', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const ledgers = await prisma.ledger.findMany({
      where: { userId: req.user.id, walletType: 'REFERRAL' }
    });
    const referralBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    if (referralBalance < amount) return res.status(400).json({ error: 'Insufficient Referral Balance' });

    await prisma.$transaction([
      prisma.ledger.create({
        data: {
          userId: req.user.id,
          walletType: 'REFERRAL',
          amount: amount,
          type: 'DEBIT',
          reason: 'CONVERT_TO_TRADING'
        }
      }),
      prisma.ledger.create({
        data: {
          userId: req.user.id,
          walletType: 'TOKEN',
          amount: amount,
          type: 'CREDIT',
          reason: 'REFERRAL_CONVERSION'
        }
      })
    ]);

    res.json({ success: true, amount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Request Withdrawal
router.post('/withdraw', async (req, res) => {
  try {
    const { amount } = req.body;
    
    // Check 30-day rule again securely
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSuccessCount = await prisma.referral.count({
      where: { 
        referrerId: req.user.id, 
        status: 'SUCCESS',
        successAt: { gte: thirtyDaysAgo }
      }
    });

    if (recentSuccessCount < 3) {
      return res.status(403).json({ error: 'Withdrawal locked. Must have 3 successful referrals in last 30 days.' });
    }

    const ledgers = await prisma.ledger.findMany({
      where: { userId: req.user.id, walletType: 'REFERRAL' }
    });
    const referralBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    if (referralBalance < amount) return res.status(400).json({ error: 'Insufficient Referral Balance' });

    await prisma.ledger.create({
      data: {
        userId: req.user.id,
        walletType: 'REFERRAL',
        amount: amount,
        type: 'DEBIT',
        reason: 'WITHDRAWAL_REQUEST'
      }
    });

    res.json({ success: true, amount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Claim Special Bonus
router.post('/claim-special-bonus', async (req, res) => {
  try {
    const { rewardOption, referralIds } = req.body; // rewardOption: 'FREE_MONTH' or 'CASH_600'
    
    if (!['FREE_MONTH', 'CASH_600'].includes(rewardOption)) {
      return res.status(400).json({ error: 'Invalid reward option' });
    }
    
    if (!referralIds || referralIds.length < 3) {
      return res.status(400).json({ error: 'Need 3 referral IDs to claim' });
    }

    const refs = await prisma.referral.findMany({
      where: {
        id: { in: referralIds.slice(0, 3) },
        referrerId: req.user.id,
        status: 'SUCCESS',
        bonusClaimed: false
      }
    });

    if (refs.length < 3) {
      return res.status(400).json({ error: 'Invalid or already claimed referrals provided.' });
    }

    await prisma.$transaction(async (tx) => {
      // Mark as claimed
      for (const r of refs) {
        await tx.referral.update({
          where: { id: r.id },
          data: { bonusClaimed: true }
        });
      }

      // Record claim
      await tx.referralBonusClaim.create({
        data: {
          userId: req.user.id,
          rewardType: rewardOption,
          referralIds: refs.map(r => r.id).join(',')
        }
      });

      // Apply Reward
      if (rewardOption === 'CASH_600') {
        await tx.ledger.create({
          data: {
            userId: req.user.id,
            walletType: 'REFERRAL',
            amount: 600,
            type: 'CREDIT',
            reason: 'SPECIAL_BONUS_CASH'
          }
        });
      } else if (rewardOption === 'FREE_MONTH') {
        const existing = await tx.membership.findFirst({
          where: { userId: req.user.id, status: 'ACTIVE' },
          orderBy: { expiresAt: 'desc' }
        });
        const now = new Date();
        const currentExpiry = existing && existing.expiresAt > now ? existing.expiresAt.getTime() : now.getTime();
        const newExpiry = new Date(currentExpiry + 30 * 24 * 60 * 60 * 1000);
        
        if (existing) {
          await tx.membership.update({
            where: { id: existing.id },
            data: { expiresAt: newExpiry }
          });
        } else {
          await tx.membership.create({
            data: {
              userId: req.user.id,
              expiresAt: newExpiry,
              autoRenew: false
            }
          });
        }
      }
    });

    res.json({ success: true, rewardOption });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
