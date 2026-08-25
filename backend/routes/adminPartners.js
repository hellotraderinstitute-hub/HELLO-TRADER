/**
 * adminPartners.js — Admin Partner Management Endpoints
 * All routes require Admin role (isAdmin middleware).
 */

const express = require('express');
const router = express.Router();
const partnerService = require('../services/partnerService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Admin guard middleware
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};

router.use(isAdmin);

// 1. Get All Partners & Aggregate Overview
router.get('/', async (req, res) => {
  try {
    const overview = await partnerService.getAdminPartnersOverview(prisma);
    res.json({ success: true, ...overview });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Create New Partner
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, password, referralCode } = req.body || {};
    const result = await partnerService.createPartner(
      { name, email, phone, password, referralCode },
      req.user,
      prisma
    );
    res.json({ success: true, message: `Partner ${result.partner.partnerId} created successfully!`, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 3. Update Partner Status (ACTIVE / INACTIVE / SUSPENDED)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body || {};
    const updated = await partnerService.updatePartnerStatus(id, status, reason, req.user, prisma);
    res.json({ success: true, message: `Partner status updated to ${status}`, partner: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 4. Get Detailed Partner Business Dossier
router.get('/:id/business', async (req, res) => {
  try {
    const { id } = req.params;
    const dossier = await partnerService.getPartnerDashboardStats(id, prisma);
    res.json({ success: true, ...dossier });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// 5. Mark Benefits as PAID
router.post('/benefits/mark-paid', async (req, res) => {
  try {
    const { partnerId, benefitIds, payoutReference } = req.body || {};
    if (!partnerId) return res.status(400).json({ success: false, error: 'Partner ID is required.' });

    const updated = await partnerService.markPartnerBenefitsPaid(
      { partnerId, benefitIds, payoutReference },
      req.user,
      prisma
    );
    res.json({ success: true, message: `${updated.count} benefit records marked as PAID.`, updatedCount: updated.count });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 6. Get Partner Audit Logs
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await prisma.partnerAuditLog.findMany({
      include: {
        partner: {
          select: { partnerId: true, name: true, email: true }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Secure Admin Verification / Support Access Mode (Audit-Logged, No Plaintext Passwords, No Shared Master Password)
router.post('/:id/support-session', async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await prisma.partner.findFirst({
      where: { OR: [{ id }, { partnerId: id }] }
    });

    if (!partner) return res.status(404).json({ success: false, error: 'Partner not found.' });

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

    const supportToken = jwt.sign(
      {
        id: partner.id,
        partnerId: partner.partnerId,
        role: 'PARTNER',
        adminSupportMode: true,
        adminId: req.user?.id || 'SUPER_ADMIN'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };
    res.cookie('partnerAccessToken', supportToken, { ...cookieOptions, maxAge: 60 * 60 * 1000 });

    await prisma.partnerAuditLog.create({
      data: {
        partnerId: partner.id,
        adminId: req.user?.id || 'SUPER_ADMIN',
        action: 'ADMIN_SUPPORT_ACCESS',
        detail: `Admin ${req.user?.name || req.user?.email || 'Super Admin'} opened partner support session.`
      }
    });

    res.json({
      success: true,
      token: supportToken,
      redirectUrl: '/partner',
      partner: {
        id: partner.id,
        partnerId: partner.partnerId,
        name: partner.name,
        email: partner.email,
        phone: partner.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
