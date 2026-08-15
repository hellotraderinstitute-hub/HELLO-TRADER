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
    const { emailOrPhone, identifier, username, password } = req.body;
    const loginId = (emailOrPhone || identifier || username || '').trim();
    if (!loginId || !password) return res.status(400).json({ error: 'Identifier and password required' });

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

// POST /auth/change-password — logged-in user changes their own password
router.post('/change-password', async (req, res) => {
  const token = req.cookies.accessToken;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: decoded.id }, data: { password: hash } });
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired session.' });
  }
});

const { autoBillUserIfEligible } = require('../services/autoBillingService');

router.get('/me', (req, res) => {
  const token = req.cookies.accessToken;
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
    res.json({ user: userWithoutPass });
  });
});

module.exports = router;
