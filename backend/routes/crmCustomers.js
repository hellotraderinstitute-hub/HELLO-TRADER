const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const checkCrmAuth = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

  if (req.user.role === 'ADMIN') {
    req.crmUserRole = 'ADMIN';
    return next();
  }

  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { userId: req.user.id },
        { email: req.user.email },
        { phone: req.user.phone }
      ]
    }
  });

  if (!employee || employee.status !== 'ACTIVE' || employee.crmAccess === false) {
    return res.status(403).json({ error: 'CRM Access Revoked or Employee Profile missing.' });
  }

  req.crmEmployee = employee;
  req.crmUserRole = employee.designation || 'SALES_EXEC';
  next();
};

router.use(checkCrmAuth);

// Helper: Determine Due Status
function calculateDueStatus(totalFee, paidAmount, dueDate) {
  const pending = Math.max(0, totalFee - paidAmount);
  if (pending <= 0) return 'PAID';
  if (!dueDate) return paidAmount > 0 ? 'PARTIAL' : 'DUE_SOON';

  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'OVERDUE';
  if (diffDays <= 7) return 'DUE_SOON';
  return paidAmount > 0 ? 'PARTIAL' : 'DUE_SOON';
}

// ─── 1. TERMINAL CUSTOMERS ───────────────────────────────────────────────────
router.get('/terminal', async (req, res) => {
  try {
    const isAdmin = req.crmUserRole === 'ADMIN';
    const empId = req.crmEmployee?.id;
    const where = !isAdmin && empId ? { assignedEmployeeId: empId } : {};

    const customers = await prisma.terminalCustomer.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        recharges: { include: { plan: true }, orderBy: { rechargeDate: 'desc' } },
        assignedEmployee: { select: { id: true, employeeCode: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const augmented = customers.map(c => {
      const now = new Date();
      const exp = c.expiryDate ? new Date(c.expiryDate) : null;
      const isExpired = exp && exp < now;
      const isRenewalDue = exp && !isExpired && Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) <= 7;

      return {
        ...c,
        renewalStatus: isExpired ? 'EXPIRED' : isRenewalDue ? 'RENEWAL_DUE' : 'ACTIVE',
        paymentStatus: calculateDueStatus(c.totalFee, c.paidAmount, c.expiryDate)
      };
    });

    res.json({ success: true, customers: augmented });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/terminal', async (req, res) => {
  try {
    const { userId, planId, startDate, validityDays, totalFee, paidAmount, assignedEmployeeId } = req.body;
    if (!userId || !totalFee) {
      return res.status(400).json({ success: false, error: 'User ID and total fee are required.' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const days = validityDays ? parseInt(validityDays, 10) : 30;
    const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const paid = paidAmount ? Number(paidAmount) : 0;
    const pending = Math.max(0, Number(totalFee) - paid);
    const empId = assignedEmployeeId || req.crmEmployee?.id || null;

    const customer = await prisma.terminalCustomer.create({
      data: {
        userId,
        customerNumber: `HT-TC-${Date.now().toString().slice(-4)}`,
        totalFee: Number(totalFee),
        paidAmount: paid,
        pendingAmount: pending,
        startDate: start,
        expiryDate: expiry,
        assignedEmployeeId: empId
      }
    });

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 2. ALGO CUSTOMERS ───────────────────────────────────────────────────────
router.get('/algo', async (req, res) => {
  try {
    const isAdmin = req.crmUserRole === 'ADMIN';
    const empId = req.crmEmployee?.id;
    const where = !isAdmin && empId ? { assignedEmployeeId: empId } : {};

    const customers = await prisma.algoCustomer.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        assignedEmployee: { select: { id: true, employeeCode: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const augmented = customers.map(c => {
      const now = new Date();
      const exp = new Date(c.expiryDate);
      const isExpired = exp < now;
      const isRenewalDue = !isExpired && Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) <= 7;

      return {
        ...c,
        renewalStatus: isExpired ? 'EXPIRED' : isRenewalDue ? 'RENEWAL_DUE' : 'ACTIVE',
        paymentStatus: calculateDueStatus(c.totalFee, c.paidAmount, c.expiryDate)
      };
    });

    res.json({ success: true, customers: augmented });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/algo', async (req, res) => {
  try {
    const { userId, strategyName, planName, startDate, validityDays, totalFee, paidAmount, assignedEmployeeId } = req.body;
    if (!userId || !strategyName || !totalFee) {
      return res.status(400).json({ success: false, error: 'User, Strategy Name, and Total Fee are required.' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const days = validityDays ? parseInt(validityDays, 10) : 30;
    const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const paid = paidAmount ? Number(paidAmount) : 0;
    const pending = Math.max(0, Number(totalFee) - paid);
    const empId = assignedEmployeeId || req.crmEmployee?.id || null;

    const customer = await prisma.algoCustomer.create({
      data: {
        userId,
        strategyName,
        planName: planName || 'Standard Algo',
        startDate: start,
        expiryDate: expiry,
        totalFee: Number(totalFee),
        paidAmount: paid,
        pendingAmount: pending,
        assignedEmployeeId: empId
      }
    });

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 3. COPY TRADING CUSTOMERS ───────────────────────────────────────────────
router.get('/copy', async (req, res) => {
  try {
    const isAdmin = req.crmUserRole === 'ADMIN';
    const empId = req.crmEmployee?.id;
    const where = !isAdmin && empId ? { assignedEmployeeId: empId } : {};

    const customers = await prisma.copyCustomer.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        assignedEmployee: { select: { id: true, employeeCode: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const augmented = customers.map(c => {
      const now = new Date();
      const exp = new Date(c.expiryDate);
      const isExpired = exp < now;
      const isRenewalDue = !isExpired && Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) <= 7;

      return {
        ...c,
        renewalStatus: isExpired ? 'EXPIRED' : isRenewalDue ? 'RENEWAL_DUE' : 'ACTIVE',
        paymentStatus: calculateDueStatus(c.totalFee, c.paidAmount, c.expiryDate)
      };
    });

    res.json({ success: true, customers: augmented });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/copy', async (req, res) => {
  try {
    const { userId, masterTrader, planName, startDate, validityDays, totalFee, paidAmount, assignedEmployeeId } = req.body;
    if (!userId || !masterTrader || !totalFee) {
      return res.status(400).json({ success: false, error: 'User, Master Trader, and Total Fee are required.' });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const days = validityDays ? parseInt(validityDays, 10) : 30;
    const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const paid = paidAmount ? Number(paidAmount) : 0;
    const pending = Math.max(0, Number(totalFee) - paid);
    const empId = assignedEmployeeId || req.crmEmployee?.id || null;

    const customer = await prisma.copyCustomer.create({
      data: {
        userId,
        masterTrader,
        planName: planName || 'Standard Copy',
        startDate: start,
        expiryDate: expiry,
        totalFee: Number(totalFee),
        paidAmount: paid,
        pendingAmount: pending,
        assignedEmployeeId: empId
      }
    });

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
