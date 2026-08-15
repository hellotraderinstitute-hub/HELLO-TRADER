const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const { N } = require('../services/notifier');

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
    
    // Check for duplicate IPs
    const augmentedRequests = await Promise.all(signupRequests.map(async req => {
      let isDuplicateIp = false;
      if (req.ipAddress) {
        const dupCount = await prisma.signupRequest.count({
          where: {
            ipAddress: req.ipAddress,
            id: { not: req.id },
            status: { in: ['APPROVED', 'PENDING'] }
          }
        });
        isDuplicateIp = dupCount > 0;
      }
      return { ...req, isDuplicateIp };
    }));

    const students = await prisma.user.findMany({ 
      where: { role: 'USER' },
      include: { wallets: true, trades: true }
    });
    const payments = await prisma.paymentRequest.findMany({
      include: { user: true },
      orderBy: { timestamp: 'desc' }
    });
    res.json({ signupRequests: augmentedRequests, students, payments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'CONFIG' } });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Admin Payment Manager Endpoints ─────────────────────────────────────
router.get('/payment-settings', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'CONFIG' } });
    }
    const auditLogs = await prisma.paymentAuditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    res.json({ success: true, settings, auditLogs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/payment-settings', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'CONFIG' } });
    }

    const adminName = req.user?.name || req.user?.email || 'Admin';
    const adminId = req.user?.id || 'ADMIN-001';

    const fieldsToTrack = [
      'upiEnabled', 'upiId', 'upiHolderName',
      'qrEnabled', 'qrImageUrl',
      'bankEnabled', 'bankName', 'bankAccountName', 'bankAccountNumber', 'bankIfsc', 'bankBranch'
    ];

    const updates = {};
    const auditEntries = [];

    fieldsToTrack.forEach(field => {
      if (req.body[field] !== undefined) {
        const oldVal = settings[field] !== undefined ? String(settings[field]) : '';
        const newVal = String(req.body[field]);

        if (oldVal !== newVal) {
          updates[field] = req.body[field];
          auditEntries.push({
            adminId,
            adminName,
            changedField: field,
            oldValue: oldVal,
            newValue: newVal
          });
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      const auditLogs = await prisma.paymentAuditLog.findMany({ orderBy: { timestamp: 'desc' }, take: 50 });
      return res.json({ success: true, message: 'No changes detected', settings, auditLogs });
    }

    // Save settings and audit logs atomically
    const updatedSettings = await prisma.systemSettings.update({
      where: { id: 'CONFIG' },
      data: updates
    });

    if (auditEntries.length > 0) {
      await prisma.paymentAuditLog.createMany({
        data: auditEntries
      });
    }

    const auditLogs = await prisma.paymentAuditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    res.json({
      success: true,
      message: 'Payment configuration updated successfully',
      settings: updatedSettings,
      auditLogs
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/payment-settings/qr', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const adminName = req.user?.name || req.user?.email || 'Admin';
    const adminId = req.user?.id || 'ADMIN-001';

    const oldQr = settings?.qrImageUrl || '';
    const updatedSettings = await prisma.systemSettings.update({
      where: { id: 'CONFIG' },
      data: { qrImageUrl: '' }
    });

    await prisma.paymentAuditLog.create({
      data: {
        adminId,
        adminName,
        changedField: 'qrImageUrl',
        oldValue: oldQr,
        newValue: '[DELETED]'
      }
    });

    const auditLogs = await prisma.paymentAuditLog.findMany({ orderBy: { timestamp: 'desc' }, take: 50 });
    res.json({ success: true, message: 'QR Code image deleted', settings: updatedSettings, auditLogs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Backup Manager APIs ─────────────────────────────────────────────────
const backupEngine = require('../services/backupEngine');
const fs = require('fs');

router.get('/backups', (req, res) => {
  try {
    const backups = backupEngine.listBackups();
    res.json({ success: true, backups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/create', async (req, res) => {
  try {
    const adminUser = req.user?.name || req.user?.email || 'Admin';
    const dbBackup = await backupEngine.createDatabaseBackup();
    const configBackup = await backupEngine.createPaymentConfigBackup(adminUser);

    const backups = backupEngine.listBackups();
    res.json({
      success: true,
      message: 'Database and Payment Configuration backups created successfully',
      dbBackup,
      configBackup,
      backups
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(backupEngine.BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup file not found' });
    }

    res.download(filePath, filename);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/restore-payment', async (req, res) => {
  try {
    const { payload } = req.body;
    const adminUser = { id: req.user?.id || 'ADMIN-001', name: req.user?.name || req.user?.email || 'Admin' };
    const result = await backupEngine.restorePaymentConfig(payload, adminUser);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { dhanClientId, dhanAccessToken } = req.body || {};

    if (!dhanClientId || !dhanAccessToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'MISSING_CREDENTIALS', 
        errorCode: 'REQ_FIELDS_MISSING', 
        errorMessage: 'Please enter both Dhan Client ID and Access Token.' 
      });
    }

    // 1. Transactional Step 1: Pre-Validate credentials against real Dhan API endpoint (GET /v2/fundlimit)
    const dhanRes = await fetch('https://api.dhan.co/v2/fundlimit', {
      method: 'GET',
      headers: {
        'access-token': dhanAccessToken,
        'client-id': dhanClientId,
        'Content-Type': 'application/json'
      }
    });

    if (!dhanRes.ok) {
      let errJson = {};
      try { errJson = await dhanRes.json(); } catch (_) {}
      
      const errorCode = errJson.errorCode || `HTTP_${dhanRes.status}`;
      const errorMessage = errJson.errorMessage || errJson.errorType || 'Client ID or Access Token is invalid or expired.';

      console.log(`[Admin Save Blocked] Dhan API Validation Failed: Code [${errorCode}] - ${errorMessage}`);

      // STRICT MANDATE: DO NOT WRITE TO DATABASE. DO NOT RESTART STREAMER. KEEP PREVIOUS WORKING CREDENTIALS.
      return res.status(400).json({
        success: false,
        error: 'DHAN_AUTHENTICATION_FAILED',
        errorCode: errorCode,
        errorMessage: errorMessage,
        rawDhanResponse: errJson
      });
    }

    // 2. Transactional Step 2: Authentication Passed -> Persist to Database
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'CONFIG' },
      update: { dhanClientId, dhanAccessToken },
      create: { id: 'CONFIG', dhanClientId, dhanAccessToken }
    });

    // 3. Transactional Step 3: Immediate Read-Back Verification
    const readBack = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (readBack.dhanClientId !== dhanClientId || readBack.dhanAccessToken !== dhanAccessToken) {
      return res.status(500).json({
        success: false,
        error: 'DB_READBACK_MISMATCH',
        errorMessage: 'Database read-back verification failed. Transaction rolled back.'
      });
    }

    // 4. Transactional Step 4: Restart DhanStreamer with Live Verified Session
    if (req.dhanStreamer) {
      console.log('[Admin] Pre-authentication verified. Restarting DhanStreamer WebSocket stream...');
      req.dhanStreamer.start(dhanClientId, dhanAccessToken);
    }

    // 5. Transactional Step 5: Reload Option Chain Service Credentials & Clear Stale Caches
    const dhanOptionChainService = require('../services/dhanOptionChainService');
    dhanOptionChainService.reloadCredentials(dhanClientId, dhanAccessToken);

    return res.json({
      success: true,
      message: 'Dhan API credentials authenticated & saved transactionally!',
      settings: readBack
    });
  } catch (error) {
    console.error('[Admin Save Transaction Exception]', error);
    return res.status(500).json({
      success: false,
      error: 'TRANSACTION_EXCEPTION',
      errorMessage: error.message
    });
  }
});

router.post('/test-dhan', async (req, res) => {
  try {
    const { dhanClientId, dhanAccessToken } = req.body;
    if (!dhanClientId || !dhanAccessToken) {
      return res.status(400).json({ error: 'Please enter both Dhan Client ID and Access Token.' });
    }

    const dhanRes = await fetch('https://api.dhan.co/v2/fundlimit', {
      method: 'GET',
      headers: {
        'access-token': dhanAccessToken,
        'client-id': dhanClientId,
        'Content-Type': 'application/json'
      }
    });

    if (dhanRes.ok) {
      const data = await dhanRes.json();
      return res.json({ success: true, message: 'Dhan API Credentials Verified Successfully!', data });
    } else {
      const errText = await dhanRes.text();
      let msg = 'Failed to authenticate with Dhan API.';
      try {
        const errJson = JSON.parse(errText);
        msg = errJson.message || errJson.error || errText;
      } catch (_) {}
      return res.status(400).json({ error: `Dhan API Credentials Invalid: ${msg}` });
    }
  } catch (error) {
    return res.status(500).json({ error: `Connection Test Failed: ${error.message}` });
  }
});

router.post('/approve-signup', async (req, res) => {
  try {
    const { requestId, tempPassword } = req.body;
    const request = await prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const effectivePassword = tempPassword || `HT@${Math.floor(1000 + Math.random() * 9000)}`;

    // Generate unique student ID (HT0786, HT0787, ...)
    let count = await prisma.user.count({ where: { role: 'USER' } });
    let studentId = `HT${String(count + 786).padStart(4, '0')}`;
    let existingId = await prisma.user.findUnique({ where: { studentId } });
    while (existingId) {
      count++;
      studentId = `HT${String(count + 786).padStart(4, '0')}`;
      existingId = await prisma.user.findUnique({ where: { studentId } });
    }

    const hash = await bcrypt.hash(effectivePassword, 10);

    let referrer = null;
    let isInvalidReferral = false;

    if (request.referralCode) {
      referrer = await prisma.user.findFirst({ where: { referralCode: request.referralCode } });
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
      // Note: Referrer is NOT rewarded ₹200 at signup. Qualification requires an Admin-approved recharge.
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
      data: { status: 'APPROVED' }
    });

    if (req.io) {
      req.io.emit('signup_approved', { requestId, studentId });
      req.io.emit('student_added', newUser);
    }

    // Instant admin notification — no password exposed
    N.signupApproved({ name: newUser.name, studentId: newUser.studentId, email: newUser.email, phone: newUser.phone });

    // Notify referral registration if referral code was used
    if (referrer && !isInvalidReferral) {
      N.newReferralRegistration({ referrerName: referrer.name, referrerId: referrer.studentId, newUserEmail: request.email, referralCode: request.referralCode });
    }

    res.json({
      success: true,
      user: newUser,
      studentId: newUser.studentId,
      tempPassword: effectivePassword
    });
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

    // Fetch request info for notification
    const rejReq = await prisma.signupRequest.findUnique({ where: { id: requestId } });
    if (rejReq) N.signupRejected({ name: rejReq.name, email: rejReq.email, phone: rejReq.phone });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/approve-payment', async (req, res) => {
  try {
    const { requestId, actualAmountReceived, applyBonus, reason } = req.body || {};
    if (!requestId || !actualAmountReceived) {
      return res.status(400).json({ error: 'Request ID and actual amount received are required.' });
    }

    const request = await prisma.paymentRequest.findUnique({ where: { id: requestId }, include: { user: true } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `Cannot approve payment request with status '${request.status}'. Only PENDING requests can be approved.` });
    }

    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const tokenPrice = settings?.tokenPrice || 1;
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
    const adminId = req.user?.id || 'SUPER_ADMIN';

    // Atomic transaction with concurrency guard
    const updated = await prisma.$transaction(async (tx) => {
      // Atomic status guard update
      const updateResult = await tx.paymentRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          actualAmount: actualAmountReceived,
          bonusApplied: bonusTokens,
          reason,
          adminId
        }
      });

      if (updateResult.count === 0) {
        throw new Error('CONCURRENT_APPROVAL_BLOCKED: Payment request was already processed by another request.');
      }

      // Base recharge token credit
      await tx.ledger.create({
        data: {
          userId: request.userId,
          walletType: 'TOKEN',
          amount: baseTokens,
          type: 'CREDIT',
          reason: `RECHARGE_CREDIT_PAYMENT_${request.id.slice(0, 8)}`
        }
      });

      // Bonus token credit
      if (bonusTokens > 0) {
        await tx.ledger.create({
          data: {
            userId: request.userId,
            walletType: 'TOKEN',
            amount: bonusTokens,
            type: 'CREDIT',
            reason: `RECHARGE_BONUS_PAYMENT_${request.id.slice(0, 8)}`
          }
        });
      }

      // Check if user has a PENDING referral record needing qualification upon approved recharge
      const pendingReferral = await tx.referral.findFirst({
        where: { referredId: request.userId, status: 'PENDING' }
      });

      if (pendingReferral) {
        // Mark referral as SUCCESS
        await tx.referral.update({
          where: { id: pendingReferral.id },
          data: {
            status: 'SUCCESS',
            successAt: new Date()
          }
        });

        // Credit ₹200 Referral Cash to referrer
        await tx.ledger.create({
          data: {
            userId: pendingReferral.referrerId,
            walletType: 'REFERRAL',
            amount: 200,
            type: 'CREDIT',
            reason: `RECHARGE_REFERRAL_REWARD_PAYMENT_${request.id.slice(0, 8)}`
          }
        });
      }

      return true;
    });

    // Trigger immediate automatic billing check for user
    const { autoBillUserIfEligible } = require('../services/autoBillingService');
    const autoBillingRes = await autoBillUserIfEligible(request.userId);

    // Notify payment approved with actual values
    N.paymentApproved({ 
      studentName: request.user.name, 
      studentId: request.user.studentId, 
      amount: actualAmountReceived, 
      tokens: Math.round(baseTokens), 
      bonus: Math.round(bonusTokens || 0) 
    });

    res.json({ success: true, baseTokens, bonusTokens, autoBilling: autoBillingRes });
  } catch (error) {
    if (error.message.includes('CONCURRENT_APPROVAL_BLOCKED')) {
      return res.status(400).json({ error: 'Payment request was already processed.' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/reject-payment', async (req, res) => {
  try {
    const { requestId, reason } = req.body;
    const rejPayReq = await prisma.paymentRequest.findUnique({ where: { id: requestId }, include: { user: true } });
    await prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reason, adminId: req.user?.id || 'SUPER_ADMIN' }
    });

    // Notify payment rejected
    if (rejPayReq) N.paymentRejected({ studentName: rejPayReq.user.name, studentId: rejPayReq.user.studentId, amount: rejPayReq.amount, reason });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reverse-payment', async (req, res) => {
  try {
    const { requestId, reason } = req.body;
    if (!requestId) return res.status(400).json({ error: 'Request ID required' });

    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: { user: true }
    });

    if (!request) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    // Idempotency & Status Check: Cannot reverse non-APPROVED requests or double-reverse
    if (request.status !== 'APPROVED') {
      return res.status(400).json({
        error: `Cannot reverse payment request with status '${request.status}'. Only APPROVED requests can be reversed.`
      });
    }

    const reversalReason = (reason || 'Reversed by Admin').trim();
    const adminId = req.user?.id || 'SUPER_ADMIN';

    // Calculate total tokens credited by this specific recharge
    const baseTokens = request.actualAmount || request.amount || 0;
    const bonusTokens = request.bonusApplied || 0;
    const totalTokensToReverse = baseTokens + bonusTokens;

    let membershipAction = 'UNCHANGED';

    await prisma.$transaction(async (tx) => {
      // 1. Mark original payment record as APPROVED_REVERSED (preserves payment history record)
      await tx.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED_REVERSED',
          reason: `[REVERSED: ${reversalReason}] ${request.reason || ''}`,
          adminId
        }
      });

      // 2. Create separate Ledger reversal entry (DEBIT / RECHARGE_REVERSAL)
      await tx.ledger.create({
        data: {
          userId: request.userId,
          walletType: 'TOKEN',
          amount: totalTokensToReverse,
          type: 'DEBIT',
          reason: `RECHARGE_REVERSAL_PAYMENT_${request.id.slice(0, 8)}`
        }
      });

      // 2b. Check if a referral reward was credited for this specific payment
      const rewardLedgerReason = `RECHARGE_REFERRAL_REWARD_PAYMENT_${request.id.slice(0, 8)}`;
      const referralCreditLedger = await tx.ledger.findFirst({
        where: {
          walletType: 'REFERRAL',
          type: 'CREDIT',
          reason: rewardLedgerReason
        }
      });

      if (referralCreditLedger) {
        // Reverse referral reward to referrer
        await tx.ledger.create({
          data: {
            userId: referralCreditLedger.userId,
            walletType: 'REFERRAL',
            amount: 200,
            type: 'DEBIT',
            reason: `REVERSAL_REFERRAL_REWARD_PAYMENT_${request.id.slice(0, 8)}`
          }
        });

        // Revert referral status back to PENDING
        await tx.referral.updateMany({
          where: { referredId: request.userId, status: 'SUCCESS' },
          data: { status: 'PENDING' }
        });
      }

      // 3. Recalculate net token balance from Ledger
      const ledgers = await tx.ledger.findMany({
        where: {
          userId: request.userId,
          walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] }
        }
      });

      const netBalance = Math.max(0, ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0));

      // 4. Recalculate Premium Entitlement
      const settings = await tx.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      const monthlyCost = Number(settings?.monthlyCost || 900);

      // Check if user has ANY OTHER active APPROVED payment request
      const otherApprovedPayments = await tx.paymentRequest.findMany({
        where: {
          userId: request.userId,
          status: 'APPROVED',
          id: { not: requestId }
        }
      });

      // Check if user is non-admin and active membership exists
      const isUserAdmin = request.user?.role === 'ADMIN' || request.user?.email === 'hellotraderinstitute@gmail.com';

      if (!isUserAdmin) {
        const activeMembership = await tx.membership.findFirst({
          where: {
            userId: request.userId,
            status: 'ACTIVE'
          }
        });

        if (activeMembership) {
          // If no other approved payment exists AND net token balance < monthlyCost, revoke premium entitlement
          if (otherApprovedPayments.length === 0 && netBalance < monthlyCost) {
            await tx.membership.updateMany({
              where: { userId: request.userId, status: 'ACTIVE' },
              data: { status: 'EXPIRED' }
            });
            membershipAction = 'REVOKED';
          } else {
            membershipAction = 'PRESERVED_BY_OTHER_ENTITLEMENT';
          }
        }
      }

      // 5. Create PaymentAuditLog entry
      await tx.paymentAuditLog.create({
        data: {
          adminId,
          adminName: req.user?.name || 'Admin',
          changedField: 'PAYMENT_REVERSAL',
          oldValue: `APPROVED (₹${request.amount})`,
          newValue: `APPROVED_REVERSED (-${totalTokensToReverse} Tokens, Premium: ${membershipAction})`,
          timestamp: new Date()
        }
      });
    });

    res.json({
      success: true,
      message: 'Approved recharge reversed successfully.',
      totalTokensReversed: totalTokensToReverse,
      membershipAction
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── ADMIN MANUAL LEDGER & RESERVE ENDPOINTS ────────────────────────────────
router.get('/manual-reserves', async (req, res) => {
  try {
    const reserves = await prisma.manualReserve.findMany({
      include: { user: { select: { id: true, name: true, studentId: true, email: true } } },
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    res.json({ success: true, reserves });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/manual-reserve', async (req, res) => {
  try {
    const { userId, amount, walletType, type, reason } = req.body || {};
    if (!userId || !amount || amount <= 0 || !walletType || !type) {
      return res.status(400).json({ error: 'User ID, valid positive amount, walletType (TOKEN/REFERRAL), and type (CREDIT/DEBIT) are required.' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const adminId = req.user?.id || 'SUPER_ADMIN';
    const adminName = req.user?.name || req.user?.email || 'Admin';
    const adjustmentReason = (reason || 'Manual Admin Adjustment').trim();
    const targetWalletType = walletType.toUpperCase() === 'REFERRAL' ? 'REFERRAL' : 'TOKEN';
    const actionType = type.toUpperCase() === 'DEBIT' ? 'DEBIT' : 'CREDIT';

    const result = await prisma.$transaction(async (tx) => {
      const reserve = await tx.manualReserve.create({
        data: {
          userId,
          amount: Number(amount),
          walletType: targetWalletType,
          reason: `MANUAL_${actionType}_${adjustmentReason}`,
          adminId,
          adminName,
          status: 'ACTIVE'
        }
      });

      await tx.ledger.create({
        data: {
          userId,
          walletType: targetWalletType,
          amount: Number(amount),
          type: actionType,
          reason: `MANUAL_RESERVE_${reserve.id.slice(0, 8)}: ${adjustmentReason}`
        }
      });

      await tx.paymentAuditLog.create({
        data: {
          adminId,
          adminName,
          changedField: 'MANUAL_RESERVE_ADJUSTMENT',
          oldValue: 'NONE',
          newValue: `${actionType} ${amount} ${targetWalletType} (${adjustmentReason})`,
          timestamp: new Date()
        }
      });

      return reserve;
    });

    if (targetWalletType === 'TOKEN') {
      const { autoBillUserIfEligible } = require('../services/autoBillingService');
      await autoBillUserIfEligible(userId);
    }

    res.json({ success: true, message: 'Manual reserve adjustment logged successfully.', reserve: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reverse-manual-reserve', async (req, res) => {
  try {
    const { reserveId, reason } = req.body || {};
    if (!reserveId) return res.status(400).json({ error: 'Reserve ID is required.' });

    const reserve = await prisma.manualReserve.findUnique({ where: { id: reserveId }, include: { user: true } });
    if (!reserve) return res.status(404).json({ error: 'Manual Reserve record not found.' });
    if (reserve.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Cannot reverse manual reserve with status '${reserve.status}'.` });
    }

    const adminId = req.user?.id || 'SUPER_ADMIN';
    const adminName = req.user?.name || req.user?.email || 'Admin';
    const reversalReason = (reason || 'Reversed by Admin').trim();
    const compensatingType = reserve.reason.includes('CREDIT') ? 'DEBIT' : 'CREDIT';

    await prisma.$transaction(async (tx) => {
      await tx.manualReserve.update({
        where: { id: reserveId },
        data: {
          status: 'REVERSED',
          reversalAdminId: adminId,
          reversalAt: new Date(),
          reversalReason
        }
      });

      await tx.ledger.create({
        data: {
          userId: reserve.userId,
          walletType: reserve.walletType,
          amount: reserve.amount,
          type: compensatingType,
          reason: `REVERSAL_MANUAL_RESERVE_${reserve.id.slice(0, 8)}: ${reversalReason}`
        }
      });

      await tx.paymentAuditLog.create({
        data: {
          adminId,
          adminName,
          changedField: 'MANUAL_RESERVE_REVERSAL',
          oldValue: `ACTIVE (${reserve.amount} ${reserve.walletType})`,
          newValue: `REVERSED (${compensatingType} ${reserve.amount} ${reserve.walletType})`,
          timestamp: new Date()
        }
      });
    });

    if (reserve.walletType === 'TOKEN') {
      const { autoBillUserIfEligible } = require('../services/autoBillingService');
      await autoBillUserIfEligible(reserve.userId);
    }

    res.json({ success: true, message: 'Manual reserve reversed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

// POST /admin/reset-password  — admin resets any student's password
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'User ID and password (min 4 chars) required.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hash } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/set-user-status  — lock/unlock a student account
router.post('/set-user-status', async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !['ACTIVE', 'LOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid parameters.' });
    }
    await prisma.user.update({ where: { id: userId }, data: { status } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/manual-ledger — credit or debit tokens for a student
router.post('/manual-ledger', async (req, res) => {
  try {
    const { userId, amount, action, walletType } = req.body;
    if (!userId || !amount || amount <= 0 || !['credit', 'debit'].includes(action)) {
      return res.status(400).json({ error: 'Invalid ledger request parameters.' });
    }

    const type = action === 'credit' ? 'CREDIT' : 'DEBIT';
    let targetWallet = (walletType || 'TOKEN').toUpperCase();

    if (['RECHARGE', 'BONUS'].includes(targetWallet)) {
      targetWallet = 'TOKEN';
    }

    const ledger = await prisma.ledger.create({
      data: {
        userId,
        walletType: targetWallet,
        amount: Number(amount),
        type,
        reason: `ADMIN_MANUAL_${action.toUpperCase()}_${targetWallet}`
      }
    });

    res.json({ success: true, ledger });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PATCH /admin/student/:id/trial ──────────────────────────
// Set per-student trial days override (or reset to global default)
router.patch('/student/:id/trial', async (req, res) => {
  try {
    const { id } = req.params;
    const { trialDays, note, resetToDefault } = req.body;

    const student = await prisma.user.findFirst({ where: { id, role: 'USER' } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const updateData = {
      trialDaysOverride: resetToDefault ? null : (trialDays != null ? parseInt(trialDays) : student.trialDaysOverride),
      trialOverrideNote: resetToDefault ? null : (note || student.trialOverrideNote),
      trialOverrideAt: resetToDefault ? null : new Date(),
    };

    const updated = await prisma.user.update({ where: { id }, data: updateData });

    // Compute what the effective trial expiry is now
    const globalSettings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const effectiveDays = updated.trialDaysOverride ?? (globalSettings?.trialDays ?? 4);
    const trialExpiry = new Date(updated.trialStartedAt.getTime() + effectiveDays * 24 * 60 * 60 * 1000);

    res.json({
      success: true,
      message: resetToDefault
        ? `Trial reset to global default (${globalSettings?.trialDays ?? 4} days) for ${student.name}`
        : `Trial updated to ${trialDays} days for ${student.name}`,
      effectiveDays,
      trialStartedAt: updated.trialStartedAt,
      trialExpiry,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /admin/student/:id/trial ────────────────────────────
// Get trial status for a specific student
router.get('/student/:id/trial', async (req, res) => {
  try {
    const { id } = req.params;
    const student = await prisma.user.findFirst({
      where: { id, role: 'USER' },
      select: {
        id: true, studentId: true, name: true,
        trialStartedAt: true, trialDaysOverride: true,
        trialOverrideNote: true, trialOverrideAt: true,
      }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const globalDays = settings?.trialDays ?? 4;
    const effectiveDays = student.trialDaysOverride ?? globalDays;
    const trialExpiry = new Date(student.trialStartedAt.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((trialExpiry - now) / (1000 * 60 * 60 * 24)));
    const isExpired = now > trialExpiry;

    res.json({
      ...student,
      globalDays,
      effectiveDays,
      isOverridden: student.trialDaysOverride !== null,
      trialExpiry,
      daysRemaining,
      isExpired,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /admin/students/trials ──────────────────────────────
// List all students with their trial status (for admin overview)
router.get('/students/trials', async (req, res) => {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const globalDays = settings?.trialDays ?? 4;

    const students = await prisma.user.findMany({
      where: { role: 'USER' },
      select: {
        id: true, studentId: true, name: true, email: true, phone: true,
        status: true, trialStartedAt: true,
        trialDaysOverride: true, trialOverrideNote: true, trialOverrideAt: true,
        createdAt: true,
        memberships: { where: { status: 'ACTIVE' }, orderBy: { expiresAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' }
    });

    const now = new Date();
    const result = students.map(s => {
      const effectiveDays = s.trialDaysOverride ?? globalDays;
      const trialExpiry = new Date(s.trialStartedAt.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.max(0, Math.ceil((trialExpiry - now) / (1000 * 60 * 60 * 24)));
      const isTrialExpired = now > trialExpiry;
      const hasActiveMembership = s.memberships.length > 0;
      return {
        id: s.id, studentId: s.studentId, name: s.name, email: s.email, phone: s.phone,
        status: s.status, trialStartedAt: s.trialStartedAt, createdAt: s.createdAt,
        globalDays, effectiveDays,
        isOverridden: s.trialDaysOverride !== null,
        trialDaysOverride: s.trialDaysOverride,
        trialOverrideNote: s.trialOverrideNote,
      };
    });
    res.json({ success: true, globalDays, students: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/change-password — Verify current password via bcrypt and update to new hashed password
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 5) {
      return res.status(400).json({ error: 'New password must be at least 5 characters long.' });
    }

    const adminUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!adminUser) return res.status(404).json({ error: 'Admin account not found.' });

    const valid = await bcrypt.compare(currentPassword, adminUser.password);
    if (!valid) {
      return res.status(400).json({ error: 'Current admin password is incorrect.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { password: hash }
    });

    res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'none' });
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });

    res.json({ success: true, message: 'Admin password updated successfully. Please log in again.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Membership Plan Management
router.post('/plans', async (req, res) => {
  try {
    const { name, durationDays, price, description } = req.body;
    if (!name || !durationDays || !price) {
      return res.status(400).json({ error: 'Name, duration (days), and price are required.' });
    }

    const plan = await prisma.membershipPlan.create({
      data: {
        name,
        durationDays: Number(durationDays),
        price: Number(price),
        description: description || ''
      }
    });

    res.json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/plans/:id', async (req, res) => {
  try {
    const count = await prisma.membershipPlan.count();
    if (count <= 1) {
      return res.status(400).json({ error: 'At least one active membership plan must remain.' });
    }
    await prisma.membershipPlan.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/token-price — Update token exchange rate in SystemSettings
router.post('/token-price', async (req, res) => {
  try {
    const { tokenPrice } = req.body;
    const rate = Number(tokenPrice);
    if (isNaN(rate) || rate <= 0) {
      return res.status(400).json({ error: 'Exchange rate must be a positive number.' });
    }

    const settings = await prisma.systemSettings.upsert({
      where: { id: 'CONFIG' },
      update: { tokenPrice: rate },
      create: { id: 'CONFIG', tokenPrice: rate }
    });

    res.json({
      success: true,
      message: `Token exchange rate updated to ₹1 = ${rate} Tokens`,
      tokenPrice: settings.tokenPrice,
      settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET /admin/live-market-health — Live Market Health Monitor Telemetry
router.get('/live-market-health', async (req, res) => {
  try {
    const marketHealthMonitor = require('../services/marketHealthMonitor');
    const health = await marketHealthMonitor.runMarketHealthCheck({
      dhanStreamer: req.dhanStreamer,
      marketDataEngine: req.marketDataEngine
    });
    res.json(health);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/trigger-market-health-check — Trigger immediate manual health check & Telegram alert
router.post('/trigger-market-health-check', async (req, res) => {
  try {
    const marketHealthMonitor = require('../services/marketHealthMonitor');
    const result = await marketHealthMonitor.dispatchMarketOpenTelegramAlert({
      forceAlert: true,
      dhanStreamer: req.dhanStreamer,
      marketDataEngine: req.marketDataEngine
    });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

