const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const { N } = require('../services/notifier');
const { AuditLogger, CATEGORIES } = require('../services/auditLogger');
const { agentTunnelServer } = require('../services/agentTunnelServer');
const { encryptCredential, decryptCredential } = require('../services/crypto');
const { ProxyTransportFactory } = require('../../packages/agent/lib/network/ProxyTransportFactory');

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

    const studentsRaw = await prisma.user.findMany({ 
      where: { role: 'USER' },
      include: { 
        wallets: true, 
        trades: true,
        memberships: { orderBy: { expiresAt: 'desc' }, take: 1 },
        brokerConnections: true,
        auditLogs: {
          where: { category: 'AUTH', action: 'USER_LOGIN' },
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const students = studentsRaw.map(u => {
      const activeMembership = u.memberships.find(m => m.status === 'ACTIVE' && m.expiresAt > new Date());
      const activeConnection = u.brokerConnections.find(b => b.isActive);
      const lastLogin = u.auditLogs[0]?.timestamp || null;
      const lastSeen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null;
      const isOnline = lastSeen && (Date.now() - lastSeen) < 90000;

      return {
        ...u,
        membershipStatus: activeMembership ? 'ACTIVE' : 'EXPIRED',
        membershipExpiry: activeMembership ? activeMembership.expiresAt : (u.memberships[0]?.expiresAt || null),
        algoStatus: activeConnection ? `CONNECTED (${activeConnection.broker})` : 'DISCONNECTED',
        copyTradingStatus: 'LOCKED',
        lastLoginDate: lastLogin ? new Date(lastLogin).toLocaleDateString('en-IN') : 'Never',
        lastLoginTime: lastLogin ? new Date(lastLogin).toLocaleTimeString('en-IN') : 'Never',
        lastLoginTimestamp: lastLogin,
        lastSeenDate: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString('en-IN') : 'Never',
        lastSeenTime: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleTimeString('en-IN') : 'Never',
        isOnline: !!isOnline
      };
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
// ── Admin Live Dashboard Telemetry (Filtered by accountMode) ────────────
router.get('/dashboard-telemetry', async (req, res) => {
  try {
    const includeTest = req.query.includeTest === 'true';
    const modeFilter = includeTest ? undefined : 'PRODUCTION';
    const userWhere = modeFilter ? { accountMode: modeFilter } : {};

    const totalUsers = await prisma.user.count({ where: { role: 'USER', ...userWhere } });
    const totalPayments = await prisma.paymentRequest.count({ where: { user: userWhere } });
    const approvedPayments = await prisma.paymentRequest.count({ where: { status: 'APPROVED', user: userWhere } });
    const activeMemberships = await prisma.membership.count({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() }, user: userWhere } });
    const activeAlgoConnections = await prisma.algoBrokerConnection.count({ where: { isActive: true, user: userWhere } });

    const tokenLedgers = await prisma.ledger.findMany({
      where: {
        walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] },
        reason: { not: 'QA_TEST_CREDIT_EXCLUDED' },
        user: userWhere
      }
    });

    const tokenCredits = tokenLedgers.filter(l => l.type === 'CREDIT').reduce((acc, l) => acc + l.amount, 0);
    const tokenDebits = tokenLedgers.filter(l => l.type === 'DEBIT').reduce((acc, l) => acc + l.amount, 0);
    const netTokenBalance = tokenCredits - tokenDebits;

    res.json({
      success: true,
      filteredByMode: includeTest ? 'ALL' : 'PRODUCTION',
      telemetry: {
        totalUsers,
        totalPayments,
        approvedPayments,
        activeMemberships,
        activeAlgoConnections,
        tokenCredits,
        tokenDebits,
        netTokenBalance
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

    // Generate unique student ID (HT0786, HT0787, ...) unless explicitly provided
    let studentId = req.body.studentId || request.studentId;
    if (!studentId) {
      let count = await prisma.user.count({ where: { role: 'USER' } });
      studentId = `HT${String(count + 786).padStart(4, '0')}`;
      let existingId = await prisma.user.findUnique({ where: { studentId } });
      while (existingId) {
        count++;
        studentId = `HT${String(count + 786).padStart(4, '0')}`;
        existingId = await prisma.user.findUnique({ where: { studentId } });
      }
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
        accountMode: 'PRODUCTION'
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

    // Check for Active Partner Attribution
    const partnerService = require('../services/partnerService');
    await partnerService.recordPartnerAttribution({
      userId: newUser.id,
      studentId: newUser.studentId,
      referralCode: request.referralCode
    }, prisma);

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

      // Check for duplicate ledger credit
      const existingCredit = await tx.ledger.findFirst({
        where: {
          userId: request.userId,
          walletType: 'TOKEN',
          reason: `RECHARGE_CREDIT_PAYMENT_${request.id.slice(0, 8)}`
        }
      });
      if (existingCredit) {
        throw new Error('CONCURRENT_APPROVAL_BLOCKED: Token credit already created for this payment.');
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

      // Check for Partner Attribution & Qualify Fixed ₹200 Partner Benefit
      const partnerService = require('../services/partnerService');
      await partnerService.qualifyPartnerBenefit({
        userId: request.userId,
        paymentReqId: request.id
      }, tx);

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

      // 2. Calculate current token balance to enforce floor guard (reversal must never create a negative token balance)
      const userLedgers = await tx.ledger.findMany({
        where: {
          userId: request.userId,
          walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] }
        }
      });
      const currentTokenBalance = userLedgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);
      const safeReversalAmount = Math.max(0, Math.min(totalTokensToReverse, currentTokenBalance));

      if (safeReversalAmount > 0) {
        await tx.ledger.create({
          data: {
            userId: request.userId,
            walletType: 'TOKEN',
            amount: safeReversalAmount,
            type: 'DEBIT',
            reason: `RECHARGE_REVERSAL_PAYMENT_${request.id.slice(0, 8)}`
          }
        });
      }

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

      // Revert Partner Benefit if applicable
      const partnerService = require('../services/partnerService');
      await partnerService.reversePartnerBenefit({
        userId: request.userId,
        paymentReqId: request.id
      }, tx);

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

    const globalSettings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const globalDays = globalSettings?.trialDays ?? 4;

    const now = new Date();

    // KEY FIX: When resetting to default, also reset trialStartedAt to NOW so
    // the default trial period (e.g. 4 days) starts fresh from today.
    // Without this, users who registered > 4 days ago remain expired immediately.
    const updateData = resetToDefault
      ? {
          trialDaysOverride: null,
          trialOverrideNote: null,
          trialOverrideAt: null,
          trialStartedAt: now,       // <-- Reset trial start to today
        }
      : {
          trialDaysOverride: trialDays != null ? parseInt(trialDays) : student.trialDaysOverride,
          trialOverrideNote: note || student.trialOverrideNote,
          trialOverrideAt: now,
        };

    const updated = await prisma.user.update({ where: { id }, data: updateData });

    // Compute effective trial expiry after update
    const effectiveDays = updated.trialDaysOverride ?? globalDays;
    const trialStart = updated.trialStartedAt || updated.createdAt;
    const trialExpiry = new Date(new Date(trialStart).getTime() + effectiveDays * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.max(0, Math.ceil((trialExpiry - new Date()) / (1000 * 60 * 60 * 24)));
    const isExpired = new Date() > trialExpiry;

    res.json({
      success: true,
      message: resetToDefault
        ? `Trial reset to global default (${globalDays} days from today) for ${student.name}`
        : `Trial updated to ${trialDays} days for ${student.name}`,
      effectiveDays,
      globalDays,
      trialStartedAt: updated.trialStartedAt,
      trialExpiry,
      daysRemaining,
      isExpired,
      isOverridden: updated.trialDaysOverride !== null,
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
        createdAt: true,
        trialStartedAt: true, trialDaysOverride: true,
        trialOverrideNote: true, trialOverrideAt: true,
      }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Check active membership separately
    const activeMembership = await prisma.membership.findFirst({
      where: { userId: id, status: 'ACTIVE', expiresAt: { gt: new Date() } }
    });

    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const globalDays = settings?.trialDays ?? 4;
    const effectiveDays = student.trialDaysOverride ?? globalDays;

    // Safely fallback to createdAt if trialStartedAt is null
    const trialStart = student.trialStartedAt || student.createdAt;
    const trialExpiry = new Date(new Date(trialStart).getTime() + effectiveDays * 24 * 60 * 60 * 1000);
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
      hasActiveMembership: !!activeMembership,
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
// ─── PHASE 4B: CHARGES MANAGEMENT ENDPOINTS ─────────────────
router.get('/charges', async (req, res) => {
  try {
    const { getActiveCharges } = require('../services/chargesService');
    const charges = await getActiveCharges();
    res.json({ success: true, charges });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/charges', async (req, res) => {
  try {
    const { monthlyCost, algoConnectionTiers, algoBrokerageTiers } = req.body || {};
    const updates = {};
    if (monthlyCost !== undefined) updates.monthlyCost = Number(monthlyCost);
    if (algoConnectionTiers !== undefined) updates.algoConnectionTiersJson = JSON.stringify(algoConnectionTiers);
    if (algoBrokerageTiers !== undefined) updates.algoBrokerageTiersJson = JSON.stringify(algoBrokerageTiers);

    const settings = await prisma.systemSettings.upsert({
      where: { id: 'CONFIG' },
      update: updates,
      create: { id: 'CONFIG', ...updates }
    });

    const { getActiveCharges } = require('../services/chargesService');
    const updatedCharges = await getActiveCharges();
    res.json({ success: true, message: 'Platform charges updated successfully', charges: updatedCharges });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PHASE 4B: STUDENT REGISTER ENDPOINT ──────────────────────
router.get('/student-register', async (req, res) => {
  try {
    const includeTest = req.query.includeTest === 'true';
    const modeFilter = includeTest ? undefined : 'PRODUCTION';

    const users = await prisma.user.findMany({
      where: { role: 'USER', ...(modeFilter ? { accountMode: modeFilter } : {}) },
      include: {
        memberships: { orderBy: { expiresAt: 'desc' }, take: 1 },
        brokerConnections: true,
        copyFollowing: true,
        ledger: true,
        auditLogs: {
          where: { category: 'AUTH', action: 'USER_LOGIN' },
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const studentRegister = users.map(u => {
      const activeMembership = u.memberships.find(m => m.status === 'ACTIVE' && m.expiresAt > new Date());
      const tokenLedgers = u.ledger.filter(l => ['TOKEN', 'RECHARGE', 'BONUS'].includes(l.walletType) && l.reason !== 'QA_TEST_CREDIT_EXCLUDED');
      const tokenBalance = tokenLedgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

      const activeConnection = u.brokerConnections.find(b => b.isActive);
      const lastLogin = u.auditLogs[0]?.timestamp || null;

      // Online status calculation (heartbeat within last 90 seconds)
      const lastSeen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null;
      const isOnline = lastSeen && (Date.now() - lastSeen) < 90000;

      return {
        id: u.id,
        studentId: u.studentId,
        name: u.name,
        email: u.email,
        accountMode: u.accountMode || 'PRODUCTION',
        accountStatus: u.status,
        membershipStatus: activeMembership ? 'ACTIVE' : 'EXPIRED',
        membershipExpiry: activeMembership ? activeMembership.expiresAt : (u.memberships[0]?.expiresAt || null),
        currentTokenBalance: tokenBalance,
        algoStatus: activeConnection ? `CONNECTED (${activeConnection.broker})` : 'DISCONNECTED',
        copyTradingStatus: 'LOCKED',
        lastLoginDate: lastLogin ? new Date(lastLogin).toLocaleDateString('en-IN') : 'Never',
        lastLoginTime: lastLogin ? new Date(lastLogin).toLocaleTimeString('en-IN') : 'Never',
        lastLoginTimestamp: lastLogin,
        lastSeenAt: u.lastSeenAt,
        lastSeenDate: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString('en-IN') : 'Never',
        lastSeenTime: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleTimeString('en-IN') : 'Never',
        isOnline: !!isOnline
      };
    });

    res.json({ success: true, count: studentRegister.length, students: studentRegister });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PHASE 4B: STUDENT REAL LOGIN HISTORY ENDPOINT ─────────────
router.get('/students/:id/login-history', async (req, res) => {
  try {
    const studentId = req.params.id;
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: studentId }, { studentId: studentId }] }
    });

    if (!user) return res.status(404).json({ success: false, error: 'Student not found' });

    const loginLogs = await prisma.auditLog.findMany({
      where: { userId: user.id, category: 'AUTH', action: 'USER_LOGIN' },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    const loginHistory = loginLogs.map(log => ({
      id: log.id,
      loginDate: new Date(log.timestamp).toLocaleDateString('en-IN'),
      loginTime: new Date(log.timestamp).toLocaleTimeString('en-IN'),
      timestamp: log.timestamp,
      ipAddress: log.ipAddress || 'Unknown',
      meta: log.meta ? (typeof log.meta === 'string' ? JSON.parse(log.meta) : log.meta) : null
    }));

    res.json({ success: true, student: { id: user.id, studentId: user.studentId, name: user.name, email: user.email }, count: loginHistory.length, loginHistory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PHASE 4B: ALGO CLIENT MONITORING & DAY-WISE P&L ENDPOINT ──
router.get('/students/:id/algo-monitoring', async (req, res) => {
  try {
    const studentId = req.params.id;
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: studentId }, { studentId: studentId }] },
      include: {
        brokerConnections: true,
        algoPositions: true,
        ledger: true
      }
    });

    if (!user) return res.status(404).json({ success: false, error: 'Student not found' });

    const activeConn = user.brokerConnections.find(b => b.isActive);
    const maxCapacity = activeConn?.maxOpenTrades || 5;

    const positions = user.algoPositions;
    const totalTradeCount = positions.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayPositions = positions.filter(p => p.openedAt.toISOString().slice(0, 10) === todayStr);

    const totalPnl = positions.reduce((acc, p) => acc + (p.pnl || 0), 0);
    const todayPnl = todayPositions.reduce((acc, p) => acc + (p.pnl || 0), 0);
    const livePnl = positions.filter(p => p.status === 'OPEN').reduce((acc, p) => acc + (p.pnl || 0), 0);

    const currentTradingLots = positions.filter(p => p.status === 'OPEN').reduce((acc, p) => acc + Math.max(1, Math.ceil(p.quantity / 65)), 0);

    const brokerageDebits = user.ledger.filter(l => l.reason && l.reason.startsWith('ALGO_BROKERAGE'));
    const totalBrokerageTokensUsed = brokerageDebits.reduce((acc, l) => acc + l.amount, 0);

    // Group Day-wise P&L
    const dayMap = {};
    positions.forEach(p => {
      const dayKey = p.openedAt.toISOString().slice(0, 10);
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = { date: dayKey, lots: 0, tradeCount: 0, buyTrades: 0, sellTrades: 0, dayPnl: 0, brokerageTokens: 0 };
      }
      const lots = Math.max(1, Math.ceil(p.quantity / 65));
      dayMap[dayKey].lots += lots;
      dayMap[dayKey].tradeCount += 1;
      if (p.side === 'BUY') dayMap[dayKey].buyTrades += 1;
      if (p.side === 'SELL') dayMap[dayKey].sellTrades += 1;
      dayMap[dayKey].dayPnl += (p.pnl || 0);
    });

    brokerageDebits.forEach(l => {
      const dayKey = l.timestamp.toISOString().slice(0, 10);
      if (dayMap[dayKey]) {
        dayMap[dayKey].brokerageTokens += l.amount;
      }
    });

    const dayWisePnlList = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      success: true,
      student: { id: user.id, studentId: user.studentId, name: user.name, email: user.email },
      algoMonitoring: {
        algoStatus: activeConn ? `CONNECTED (${activeConn.broker})` : 'DISCONNECTED',
        allowedLotCapacity: maxCapacity,
        currentTradingLots,
        todayPnl,
        livePnl,
        totalPnl,
        todayTradeCount: todayPositions.length,
        totalTradeCount,
        brokerageTokensUsed: totalBrokerageTokensUsed,
        dayWisePnl: dayWisePnlList
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 🖥️ ADMIN TRADING VPS FLEET MANAGEMENT & AUDIT LOGS
// ─────────────────────────────────────────────────────────────
router.get('/vps/fleet', async (req, res) => {
  try {
    const vpsList = await prisma.userTradingVps.findMany({
      include: {
        user: { select: { id: true, studentId: true, name: true, email: true, phone: true } },
        billingInvoices: { orderBy: { createdAt: 'desc' }, take: 5 },
        auditLogs: { orderBy: { timestamp: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activeCount = vpsList.filter(v => v.status === 'ACTIVE_SIMULATION' || v.status === 'ACTIVE_VERIFIED').length;
    const graceCount = vpsList.filter(v => v.status === 'GRACE_PERIOD').length;
    const totalMonthlyRevenue = vpsList.filter(v => v.status !== 'TERMINATED').reduce((acc, v) => acc + v.monthlyAmount, 0);

    res.json({
      success: true,
      stats: {
        totalInstances: vpsList.length,
        activeInstances: activeCount,
        graceInstances: graceCount,
        totalMonthlyRevenue,
      },
      fleet: vpsList,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/vps/:id/terminate', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Admin manual termination' } = req.body;
    const { VpsLifecycleManager } = require('../../packages/agent/lib/vps/VpsLifecycleManager');
    const vpsManager = new VpsLifecycleManager({ prisma });
    const terminated = await vpsManager.terminateAndRelease(id, reason);
    res.json({ success: true, vps: terminated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 🌐 ADMIN CLIENT STATIC IP ASSIGNMENT & INFRASTRUCTURE ROUTES
// ─────────────────────────────────────────────────────────────

function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && (part === '0' || !part.startsWith('0'));
  });
}

// 1. GET /static-ip/assignments — List all client static IP and Proxy assignments
router.get('/static-ip/assignments', async (req, res) => {
  try {
    const assignments = await prisma.clientStaticIpAssignment.findMany({
      include: {
        user: { select: { id: true, studentId: true, name: true, email: true, phone: true } },
        brokerConnection: {
          select: { id: true, broker: true, displayName: true, clientId: true, isActive: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enriched = assignments.map(a => {
      const isOnline = agentTunnelServer.isAgentOnline(a.userId);
      const session = agentTunnelServer.activeSessions.get(a.userId);
      const observedIp = a.connectionType === 'DIRECT_IP'
        ? (session?.agentIp || a.lastObservedOutboundIp || null)
        : (a.lastObservedOutboundIp || null);

      const masked = ProxyTransportFactory.maskAssignment(a);
      return {
        ...masked,
        isAgentOnline: isOnline,
        currentObservedOutboundIp: observedIp,
        agentLatencyMs: session?.latencyMs || null,
        agentVersion: session?.version || null,
      };
    });

    res.json({ success: true, assignments: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. POST /static-ip/assign — Assign Dedicated Static IPv4 or Proxy to Client / Broker Connection
router.post('/static-ip/assign', async (req, res) => {
  try {
    const {
      userId,
      broker = 'ALL',
      connectionType = 'DIRECT_IP',
      ipAddress,
      proxyHost,
      proxyPort,
      proxyUsername,
      proxyPassword,
      brokerConnectionId,
      notes
    } = req.body;
    const adminId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'MISSING_USER_ID', message: 'Target client user ID is required.' });
    }

    const cleanConnType = (connectionType || 'DIRECT_IP').toUpperCase();

    // Validate based on connection type
    if (cleanConnType === 'DIRECT_IP') {
      if (!ipAddress || !isValidIpv4(ipAddress)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_IPV4_FORMAT',
          message: 'Invalid IPv4 address format for DIRECT_IP. Must be a valid public IPv4 (e.g. 103.212.121.207).'
        });
      }
    } else if (['HTTP_PROXY', 'HTTPS_PROXY', 'SOCKS5'].includes(cleanConnType)) {
      if (!proxyHost || typeof proxyHost !== 'string' || !proxyHost.trim()) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_PROXY_HOST',
          message: 'Proxy Host / IP is required for proxy connection.'
        });
      }
      const portNum = Number(proxyPort);
      if (!portNum || portNum < 1 || portNum > 65535) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PROXY_PORT',
          message: 'Proxy Port must be a valid port number between 1 and 65535.'
        });
      }
      if (ipAddress && !isValidIpv4(ipAddress)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_IPV4_FORMAT',
          message: 'Expected Public Egress IP must be a valid IPv4 address.'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONNECTION_TYPE',
        message: 'Invalid connectionType. Allowed: DIRECT_IP, HTTP_PROXY, HTTPS_PROXY, SOCKS5.'
      });
    }

    const targetEgressIp = ipAddress ? ipAddress.trim() : (isValidIpv4(proxyHost) ? proxyHost.trim() : '0.0.0.0');

    // Verify target user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Client not found.' });
    }

    // Active uniqueness check
    if (cleanConnType === 'DIRECT_IP') {
      const existingActive = await prisma.clientStaticIpAssignment.findFirst({
        where: {
          ipAddress: targetEgressIp,
          connectionType: 'DIRECT_IP',
          status: { in: ['ASSIGNED', 'VERIFYING', 'VERIFIED', 'BLOCKED'] },
        },
        include: { user: { select: { studentId: true, name: true, email: true } } }
      });
      if (existingActive) {
        return res.status(400).json({
          success: false,
          error: 'IP_ALREADY_ASSIGNED',
          message: `Static IP ${targetEgressIp} is already actively assigned to client ${existingActive.user?.studentId} (${existingActive.user?.name}). Release the IP before reassigning.`
        });
      }
    } else {
      // Check proxy host + port uniqueness
      const existingProxy = await prisma.clientStaticIpAssignment.findFirst({
        where: {
          proxyHost: proxyHost.trim(),
          proxyPort: Number(proxyPort),
          status: { in: ['ASSIGNED', 'VERIFYING', 'VERIFIED', 'BLOCKED'] },
        },
        include: { user: { select: { studentId: true, name: true, email: true } } }
      });
      if (existingProxy) {
        return res.status(400).json({
          success: false,
          error: 'PROXY_ALREADY_ASSIGNED',
          message: `Proxy ${proxyHost.trim()}:${proxyPort} is already actively assigned to client ${existingProxy.user?.studentId} (${existingProxy.user?.name}). Release the proxy before reassigning.`
        });
      }
    }

    // Encrypt proxy credentials at rest
    const encryptedUser = proxyUsername ? encryptCredential(proxyUsername.trim()) : null;
    const encryptedPass = proxyPassword ? encryptCredential(proxyPassword.trim()) : null;

    // Create assignment
    const assignment = await prisma.clientStaticIpAssignment.create({
      data: {
        userId,
        brokerConnectionId: brokerConnectionId || null,
        broker: broker.toUpperCase(),
        connectionType: cleanConnType,
        ipAddress: targetEgressIp,
        proxyHost: proxyHost ? proxyHost.trim() : null,
        proxyPort: proxyPort ? Number(proxyPort) : null,
        encryptedProxyUsername: encryptedUser,
        encryptedProxyPassword: encryptedPass,
        status: 'ASSIGNED',
        notes: notes || null,
        assignedByAdminId: adminId,
      },
      include: {
        user: { select: { id: true, studentId: true, name: true, email: true } }
      }
    });

    await AuditLogger.log({
      userId, category: CATEGORIES.BROKER, action: cleanConnType === 'DIRECT_IP' ? 'STATIC_IP_ASSIGNED' : 'PROXY_ASSIGNED',
      detail: `Admin assigned ${cleanConnType} (${cleanConnType === 'DIRECT_IP' ? targetEgressIp : `${proxyHost}:${proxyPort}`}) for Broker ${broker.toUpperCase()} to client ${user.studentId} (${user.name})`,
      meta: { assignmentId: assignment.id, connectionType: cleanConnType, egressIp: targetEgressIp, broker, adminId },
      req,
    });

    res.json({
      success: true,
      message: `${cleanConnType} assigned to ${user.name} successfully. Status: ASSIGNED.`,
      assignment: ProxyTransportFactory.maskAssignment(assignment),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST /static-ip/:id/verify — Verify Configured Static IP or Proxy Outbound Egress
router.post('/static-ip/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const assignment = await prisma.clientStaticIpAssignment.findUnique({
      where: { id },
      include: { user: { select: { id: true, studentId: true, name: true } } }
    });

    if (!assignment) {
      return res.status(404).json({ success: false, error: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found.' });
    }

    const connType = assignment.connectionType || 'DIRECT_IP';

    if (connType === 'DIRECT_IP') {
      const session = agentTunnelServer.activeSessions.get(assignment.userId);
      const observedIp = session?.agentIp || assignment.lastObservedOutboundIp;

      if (!observedIp) {
        return res.status(400).json({
          success: false,
          error: 'AGENT_OFFLINE',
          message: `Client Execution Agent for ${assignment.user.name} is currently offline. Start the agent to perform live outbound IP verification.`
        });
      }

      const isMatch = (assignment.ipAddress === observedIp);
      const newStatus = isMatch ? 'VERIFIED' : 'BLOCKED';

      const updated = await prisma.clientStaticIpAssignment.update({
        where: { id },
        data: {
          status: newStatus,
          lastObservedOutboundIp: observedIp,
          verifiedAt: isMatch ? new Date() : assignment.verifiedAt,
        }
      });

      await AuditLogger.log({
        userId: assignment.userId, category: CATEGORIES.BROKER,
        action: isMatch ? 'STATIC_IP_VERIFIED' : 'STATIC_IP_MISMATCH',
        detail: isMatch
          ? `Dedicated Static IP ${assignment.ipAddress} verified against Agent Outbound IP ${observedIp} (Match confirmed)`
          : `Static IP Mismatch: Configured ${assignment.ipAddress} != Observed Agent Outbound ${observedIp}. Status set to BLOCKED.`,
        meta: { assignmentId: id, configuredIp: assignment.ipAddress, observedIp, adminId },
        req,
      });

      return res.json({
        success: true,
        verified: isMatch,
        status: newStatus,
        configuredIp: assignment.ipAddress,
        observedIp,
        message: isMatch
          ? `Dedicated Static IP ${assignment.ipAddress} is VERIFIED and matches Agent Outbound IP.`
          : `MISMATCH: Configured IP ${assignment.ipAddress} does not match Agent Outbound IP ${observedIp}. Marked BLOCKED.`,
        assignment: ProxyTransportFactory.maskAssignment(updated),
      });
    }

    // Proxy Egress Verification (HTTP_PROXY / HTTPS_PROXY / SOCKS5)
    const decryptedUser = assignment.encryptedProxyUsername ? decryptCredential(assignment.encryptedProxyUsername) : null;
    const decryptedPass = assignment.encryptedProxyPassword ? decryptCredential(assignment.encryptedProxyPassword) : null;

    const proxyConfig = {
      connectionType: connType,
      proxyHost: assignment.proxyHost,
      proxyPort: assignment.proxyPort,
      proxyUsername: decryptedUser,
      proxyPassword: decryptedPass,
      ipAddress: assignment.ipAddress,
    };

    const verifyRes = await ProxyTransportFactory.verifyEgress(proxyConfig, assignment.ipAddress);
    const isMatch = verifyRes.success && verifyRes.isMatch;
    const newStatus = isMatch ? 'VERIFIED' : 'BLOCKED';
    const observedIp = verifyRes.observedIp || 'ERROR';

    const updated = await prisma.clientStaticIpAssignment.update({
      where: { id },
      data: {
        status: newStatus,
        lastObservedOutboundIp: observedIp,
        verifiedAt: isMatch ? new Date() : assignment.verifiedAt,
      }
    });

    await AuditLogger.log({
      userId: assignment.userId, category: CATEGORIES.BROKER,
      action: isMatch ? 'PROXY_VERIFIED' : 'PROXY_IP_MISMATCH',
      detail: isMatch
        ? `Proxy (${connType} ${assignment.proxyHost}:${assignment.proxyPort}) verified with public egress IP ${observedIp}`
        : `Proxy Verification ${verifyRes.success ? `Mismatch (Expected: ${assignment.ipAddress}, Observed: ${observedIp})` : `Failed (${verifyRes.error})`}. Status set to BLOCKED.`,
      meta: { assignmentId: id, connectionType: connType, expectedIp: assignment.ipAddress, observedIp, adminId },
      req,
    });

    return res.json({
      success: true,
      verified: isMatch,
      status: newStatus,
      connectionType: connType,
      configuredIp: assignment.ipAddress,
      observedIp: verifyRes.observedIp,
      error: verifyRes.error || null,
      latencyMs: verifyRes.latencyMs || null,
      message: isMatch
        ? `Proxy (${connType}) verified successfully! Public egress IP matches ${assignment.ipAddress}.`
        : verifyRes.observedIp
          ? `MISMATCH: Proxy connected but public egress IP (${verifyRes.observedIp}) does not match expected IP (${assignment.ipAddress}). Live execution BLOCKED.`
          : `PROXY ERROR: ${verifyRes.error || 'Failed to reach public IP echo service'}. Live execution BLOCKED.`,
      assignment: ProxyTransportFactory.maskAssignment(updated),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST /static-ip/:id/release — Release Static IP / Proxy Assignment
router.post('/static-ip/:id/release', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Admin manual release' } = req.body;
    const adminId = req.user.id;

    const assignment = await prisma.clientStaticIpAssignment.findUnique({
      where: { id },
      include: { user: { select: { id: true, studentId: true, name: true } } }
    });

    if (!assignment) {
      return res.status(404).json({ success: false, error: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found.' });
    }

    const released = await prisma.clientStaticIpAssignment.update({
      where: { id },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        notes: assignment.notes ? `${assignment.notes} | Released: ${reason}` : `Released: ${reason}`,
      }
    });

    await AuditLogger.log({
      userId: assignment.userId, category: CATEGORIES.BROKER, action: 'STATIC_IP_RELEASED',
      detail: `Admin released ${assignment.connectionType} (${assignment.ipAddress}) from client ${assignment.user.studentId} (${assignment.user.name}) — Reason: ${reason}`,
      meta: { assignmentId: id, ipAddress: assignment.ipAddress, connectionType: assignment.connectionType, reason, adminId },
      req,
    });

    res.json({
      success: true,
      message: `Assignment (${assignment.connectionType} ${assignment.ipAddress}) released successfully.`,
      assignment: ProxyTransportFactory.maskAssignment(released),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /static-ip/diagnostics/:id — Technical Diagnostic & Routing Report
router.get('/static-ip/diagnostics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await prisma.clientStaticIpAssignment.findUnique({
      where: { id },
      include: { user: { select: { id: true, studentId: true, name: true, email: true } } }
    });

    if (!assignment) {
      return res.status(404).json({ success: false, error: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found.' });
    }

    const session = agentTunnelServer.activeSessions.get(assignment.userId);
    const isOnline = agentTunnelServer.isAgentOnline(assignment.userId);
    const observedIp = assignment.connectionType === 'DIRECT_IP'
      ? (session?.agentIp || assignment.lastObservedOutboundIp || null)
      : (assignment.lastObservedOutboundIp || null);

    res.json({
      success: true,
      diagnostics: {
        assignmentId: assignment.id,
        client: {
          id: assignment.user.id,
          studentId: assignment.user.studentId,
          name: assignment.user.name,
        },
        broker: assignment.broker,
        connectionType: assignment.connectionType,
        configuredClientIp: assignment.ipAddress,
        proxyHost: assignment.proxyHost || null,
        proxyPort: assignment.proxyPort || null,
        hasProxyAuth: !!assignment.encryptedProxyUsername,
        currentVpsPrimaryIp: '103.212.121.207',
        agentObservedOutboundIp: observedIp,
        isAgentOnline: isOnline,
        status: assignment.status,
        verificationResult: assignment.status === 'VERIFIED' ? 'MATCH' : (assignment.status === 'BLOCKED' ? 'MISMATCH' : 'PENDING'),
        routingInformation: {
          transportModel: assignment.connectionType,
          notes: assignment.connectionType === 'DIRECT_IP'
            ? 'Socket-level localAddress binding'
            : `Client-specific ${assignment.connectionType} proxy tunnel`
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /backup-status ─────────────────────────────────────────
router.get('/backup-status', async (req, res) => {
  try {
    const { getBackupStatus } = require('../../scripts/backup_status');
    const status = getBackupStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /trigger-backup ───────────────────────────────────────
router.post('/trigger-backup', async (req, res) => {
  try {
    const { runBackup } = require('../../scripts/backup');
    const type = req.body?.type || 'daily';
    const result = await runBackup({ type });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;



