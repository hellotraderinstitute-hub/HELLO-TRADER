const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const { N } = require('../services/notifier');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

// Cookie options — must be sameSite=none + secure for cross-origin (Cloudflare tunnel)
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
};

router.post('/signup-request', async (req, res) => {
  try {
    const { name, email, phone, referralCode } = req.body;
    const existingUser = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (existingUser) return res.status(400).json({ error: 'Account exists' });

    const existingReq = await prisma.signupRequest.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (existingReq) return res.status(400).json({ error: 'Request already pending' });

    const request = await prisma.signupRequest.create({
      data: { 
        name, 
        email, 
        phone, 
        referralCode,
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });
    
    if (req.io) req.io.emit('new_signup_request', request);

    // Instant admin notification
    N.newSignupRequest({ name: request.name, phone: request.phone, email: request.email, referralCode: request.referralCode, ipAddress: request.ipAddress });

    res.json({ success: true, request });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { emailOrPhone, identifier, username, password, phone: mobileInput } = req.body;
    const loginId = (emailOrPhone || identifier || username || '').trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Identifier and password required' });

    // ── COMMON GATEWAY: Check if Partner ID (PHT...) or Partner Account ────────
    const isPhtPrefix = loginId.toUpperCase().startsWith('PHT');
    let partner = null;
    if (isPhtPrefix) {
      partner = await prisma.partner.findFirst({
        where: {
          OR: [
            { partnerId: loginId.toUpperCase() },
            { email: loginId.toLowerCase() },
            { phone: loginId }
          ]
        }
      });

      if (!partner) {
        return res.status(404).json({ error: 'Partner ID not found.' });
      }

      // Partner Registered Mobile Number Verification
      const providedPhone = (mobileInput || (loginId.match(/^\d{10}$/) ? loginId : '')).trim();
      if (!providedPhone) {
        return res.status(400).json({ error: 'Registered mobile number is required for Partner verification.' });
      }
      if (partner.phone !== providedPhone) {
        return res.status(401).json({ error: 'Mobile number does not match registered Partner profile.' });
      }

      if (partner.status !== 'ACTIVE') {
        res.clearCookie('partnerAccessToken', cookieOptions);
        return res.status(403).json({ error: `Partner account is ${partner.status}. Access denied.` });
      }

      const validPartner = await bcrypt.compare(password, partner.password);
      if (!validPartner) {
        res.clearCookie('partnerAccessToken', cookieOptions);
        return res.status(401).json({ error: 'Invalid partner password.' });
      }

      await prisma.partner.update({
        where: { id: partner.id },
        data: { lastLoginAt: new Date() }
      });

      const partnerToken = jwt.sign(
        { id: partner.id, partnerId: partner.partnerId, role: 'PARTNER' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('partnerAccessToken', partnerToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

      const { password: _, ...safePartner } = partner;
      return res.json({
        success: true,
        role: 'PARTNER',
        redirectTo: '/partner',
        user: { ...safePartner, studentId: safePartner.partnerId, role: 'PARTNER' },
        token: partnerToken
      });
    }

    // ── Standard Student / Admin User Authentication ────────────────────────────
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: loginId }, { phone: loginId }, { studentId: loginId }]
      },
      include: { wallets: true }
    });

    if (!user) {
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.status === 'LOCKED') {
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      N.securityEvent({ eventType: 'LOCKED_ACCOUNT_LOGIN', studentId: user.studentId, email: user.email, detail: 'Login attempt on locked account' });
      return res.status(403).json({ error: 'Account locked' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      N.securityEvent({ eventType: 'INVALID_PASSWORD', studentId: user.studentId, email: user.email, detail: 'Failed login — wrong password' });
      return res.status(401).json({ error: 'Invalid password' });
    }

    const accessToken = jwt.sign({ id: user.id, role: user.role, studentId: user.studentId }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown Device';

    const { AuditLogger, CATEGORIES } = require('../services/auditLogger');
    await AuditLogger.log({
      userId: user.id,
      category: CATEGORIES.AUTH || 'AUTH',
      action: 'USER_LOGIN',
      detail: `Successful user login from ${ip}`,
      meta: { ipAddress: ip, userAgent },
      ipAddress: ip
    });

    const { password: _, ...userWithoutPass } = user;
    res.json({ success: true, user: userWithoutPass });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  jwt.verify(refreshToken, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newAccessToken = jwt.sign({ id: user.id, role: user.role, studentId: user.studentId }, JWT_SECRET, { expiresIn: '15m' });
    res.cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    
    res.json({ success: true });
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'none' });
  res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true });
});

// POST /auth/change-password — logged-in user changes their own password with old password verification
router.post('/change-password', async (req, res) => {
  const token = req.cookies.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match.' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify old password
    const isOldValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldValid) {
      return res.status(400).json({ error: 'Incorrect old password.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: decoded.id },
      data: { password: hash }
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired session.' });
  }
});

// POST /auth/support-login — Admin support login flow using client ID + Master Password
router.post('/support-login', async (req, res) => {
  const adminToken = req.cookies.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!adminToken) return res.status(401).json({ error: 'Admin authentication required.' });

  try {
    const decodedAdmin = jwt.verify(adminToken, JWT_SECRET);
    if (decodedAdmin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required for support login.' });
    }

    const { studentId, masterPassword } = req.body;
    if (!studentId || !masterPassword) {
      return res.status(400).json({ error: 'Student ID and Master Password are required.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { studentId }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Student account not found.' });
    }

    // Verify the master password exactly
    const { verifyAdminMasterPassword } = require('../services/passwordHelper');
    const isMasterValid = verifyAdminMasterPassword(masterPassword, targetUser.createdAt);
    if (!isMasterValid) {
      return res.status(400).json({ error: 'Invalid Admin Master Password.' });
    }

    // Generate JWT token for target user with support details
    const { randomUUID: uuidv4 } = require('crypto');
    const supportSessionId = uuidv4();
    
    const accessToken = jwt.sign({
      id: targetUser.id,
      role: targetUser.role,
      studentId: targetUser.studentId,
      adminSupportMode: true,
      supportSessionId
    }, JWT_SECRET, { expiresIn: '15m' });

    const refreshToken = jwt.sign({
      id: targetUser.id,
      adminSupportMode: true,
      supportSessionId
    }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookies
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown Device';

    // Log the support login action in AuditLog
    const { AuditLogger } = require('../services/auditLogger');
    await AuditLogger.log({
      userId: decodedAdmin.id, // Log who initiated support mode
      category: 'ADMIN',
      action: 'ADMIN_SUPPORT_LOGIN',
      detail: `Admin Support access logged for user ${targetUser.name} (${targetUser.studentId}) from IP ${ip}`,
      meta: { targetUserId: targetUser.id, supportSessionId, ipAddress: ip, userAgent },
      ipAddress: ip
    });

    const { password: _, ...userWithoutPass } = targetUser;
    userWithoutPass.adminSupportMode = true;

    res.json({ success: true, user: userWithoutPass });
  } catch (err) {
    res.status(403).json({ error: err.message || 'Support login failed.' });
  }
});

const { autoBillUserIfEligible } = require('../services/autoBillingService');

router.get('/me', (req, res) => {
  const token = req.cookies.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    
    // Automatically check and bill user if sufficient tokens exist
    try { await autoBillUserIfEligible(decoded.id); } catch (_) {}

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { wallets: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...userWithoutPass } = user;
    
    if (decoded.adminSupportMode) {
      userWithoutPass.adminSupportMode = true;
    }
    res.json({ user: userWithoutPass });
  });
});

// POST /auth/heartbeat — Lightweight authenticated heartbeat to update user's lastSeenAt
router.post('/heartbeat', async (req, res) => {
  const token = req.cookies.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    try {
      await prisma.user.update({
        where: { id: decoded.id },
        data: { lastSeenAt: new Date() }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

module.exports = router;
