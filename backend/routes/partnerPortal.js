/**
 * partnerPortal.js — Partner Portal & Dashboard Endpoints
 * Provides authentication and analytics for registered Partners.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const partnerService = require('../services/partnerService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
};

// Partner authentication middleware
const authenticatePartner = (req, res, next) => {
  const token = req.cookies.partnerAccessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Partner login required.' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err || !decoded?.partnerId) return res.status(403).json({ error: 'Invalid or expired partner session.' });

    const partner = await prisma.partner.findUnique({ where: { id: decoded.id } });
    if (!partner) return res.status(404).json({ error: 'Partner account not found.' });

    if (partner.status !== 'ACTIVE') {
      res.clearCookie('partnerAccessToken', cookieOptions);
      return res.status(403).json({ error: `Partner account is ${partner.status}. Access denied.` });
    }

    req.partner = partner;
    next();
  });
};

// 1. Partner Login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const loginId = (identifier || '').trim();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Partner ID / Gmail and password are required.' });
    }

    const partner = await prisma.partner.findFirst({
      where: {
        OR: [
          { partnerId: loginId.toUpperCase() },
          { email: loginId.toLowerCase() },
          { phone: loginId }
        ]
      }
    });

    if (!partner) {
      return res.status(404).json({ error: 'Partner account not found.' });
    }

    if (partner.status !== 'ACTIVE') {
      return res.status(403).json({ error: `Partner account is ${partner.status}. Please contact support.` });
    }

    const valid = await bcrypt.compare(password, partner.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid partner password.' });
    }

    // Update lastLoginAt
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
    res.json({ success: true, message: 'Login successful', partner: safePartner, token: partnerToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Current Partner Session Profile
router.get('/me', authenticatePartner, (req, res) => {
  const { password: _, ...safePartner } = req.partner;
  res.json({ success: true, partner: safePartner });
});

// 3. Get Full Partner Dashboard Analytics (Strictly Read-Only & Privacy Filtered)
router.get('/dashboard', authenticatePartner, async (req, res) => {
  try {
    const dashboardData = await partnerService.getPartnerDashboardStats(req.partner.id, prisma);
    res.json({ success: true, ...dashboardData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Partner Change Password (Secure Bcrypt Verification & Hashing)
router.post('/change-password', authenticatePartner, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, req.partner.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.partner.update({
      where: { id: req.partner.id },
      data: { password: newHash }
    });

    await prisma.partnerAuditLog.create({
      data: {
        partnerId: req.partner.id,
        action: 'PASSWORD_CHANGED',
        detail: `Partner ${req.partner.partnerId} changed password successfully.`
      }
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Partner Logout
router.post('/logout', (req, res) => {
  res.clearCookie('partnerAccessToken', cookieOptions);
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
