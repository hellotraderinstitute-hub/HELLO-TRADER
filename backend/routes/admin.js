const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// Admin Middleware
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.use(isAdmin);

router.get('/dashboard', async (req, res) => {
  try {
    const signupRequests = await prisma.signupRequest.findMany({ where: { status: 'PENDING' }});
    const students = await prisma.user.findMany({ 
      where: { role: 'USER' },
      include: { wallets: true, trades: true }
    });
    const payments = await prisma.paymentRequest.findMany({
      include: { user: true },
      orderBy: { timestamp: 'desc' }
    });
    res.json({ signupRequests, students, payments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/approve-signup', async (req, res) => {
  try {
    const { requestId, tempPassword } = req.body;
    const request = await prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const count = await prisma.user.count({ where: { role: 'USER' } });
    const studentId = `HT${String(count + 786).padStart(4, '0')}`;
    const hash = await bcrypt.hash(tempPassword, 10);

    let referrer = null;
    let isInvalidReferral = false;

    if (request.referralCode) {
      referrer = await prisma.user.findFirst({ where: { referralCode: request.referralCode } });
      // Anti fraud checks: can't refer self (already impossible here as user doesn't exist),
      // we check if a user with same phone/email already referred someone else maybe?
      if (!referrer || referrer.phone === request.phone || referrer.email === request.email) {
        isInvalidReferral = true;
      }
    }

    const newUser = await prisma.user.create({
      data: {
        studentId,
        name: request.name,
        email: request.email,
        phone: request.phone,
        password: hash,
        referralCode: `REF${studentId}`,
        referredBy: referrer && !isInvalidReferral ? request.referralCode : null,
      }
    });

    // Create default paper wallet and add 50 Token Bonus if valid referral
    await prisma.ledger.create({
      data: {
        userId: newUser.id,
        walletType: 'PAPER',
        amount: 5000000,
        type: 'CREDIT',
        reason: 'WELCOME_MARGIN'
      }
    });

    if (referrer && !isInvalidReferral) {
      await prisma.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: newUser.id,
          signupEmail: request.email,
          ipAddress: request.ipAddress,
          status: 'PENDING'
        }
      });
      // 50 Bonus Tokens to referred user
      await prisma.ledger.create({
        data: {
          userId: newUser.id,
          walletType: 'TOKEN',
          amount: 50,
          type: 'CREDIT',
          reason: 'REFERRAL_NEW_USER_BONUS'
        }
      });
    } else if (request.referralCode) {
      // Create INVALID referral record
      if (referrer) {
         await prisma.referral.create({
          data: {
            referrerId: referrer.id,
            signupEmail: request.email,
            ipAddress: request.ipAddress,
            status: 'INVALID'
          }
        });
      }
    }

    await prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED' } // signup requests don't have userId field in schema
    });

    if (req.io) {
      req.io.emit('signup_approved', { requestId, studentId });
      req.io.emit('student_added', newUser);
    }

    res.json({ success: true, user: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/reject-signup', async (req, res) => {
  try {
    const { requestId } = req.body;
    await prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/approve-payment', async (req, res) => {
  try {
    const { requestId, actualAmountReceived, applyBonus, reason } = req.body;
    const request = await prisma.paymentRequest.findUnique({ where: { id: requestId }, include: { user: true } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Already processed' });

    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const tokenPrice = settings.tokenPrice || 1;
    const baseTokens = actualAmountReceived / tokenPrice;
    
    let bonusPercent = 0;
    if (applyBonus) {
      const applicableRule = await prisma.bonusRule.findFirst({
        where: { minAmount: { lte: actualAmountReceived } },
        orderBy: { minAmount: 'desc' }
      });
      if (applicableRule) {
        bonusPercent = applicableRule.bonusPercent;
      }
    }
    
    const bonusTokens = (baseTokens * bonusPercent) / 100;

    await prisma.$transaction(async (tx) => {
      await tx.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          actualAmount: actualAmountReceived,
          bonusApplied: bonusTokens,
          reason,
          adminId: req.user.id
        }
      });

      await tx.ledger.create({
        data: {
          userId: request.userId,
          walletType: 'TOKEN',
          amount: baseTokens,
          type: 'CREDIT',
          reason: 'MANUAL_DEPOSIT'
        }
      });

      if (bonusTokens > 0) {
        await tx.ledger.create({
          data: {
            userId: request.userId,
            walletType: 'TOKEN',
            amount: bonusTokens,
            type: 'CREDIT',
            reason: 'BONUS_DEPOSIT'
          }
        });
      }
    });

    res.json({ success: true, baseTokens, bonusTokens });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reject-payment', async (req, res) => {
  try {
    const { requestId, reason } = req.body;
    await prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reason, adminId: req.user.id }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/referrals', async (req, res) => {
  try {
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: true,
        referred: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ referrals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
