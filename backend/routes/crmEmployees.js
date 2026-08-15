const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const isAdminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access restricted to ADMIN role.' });
  }
  next();
};

router.use(isAdminOnly);

// Helper: Auto-generate Employee Code (e.g. EMP001, EMP002...)
async function generateEmployeeCode() {
  const count = await prisma.employee.count();
  return `EMP${String(count + 1).padStart(3, '0')}`;
}

// 1. GET List Employees with Performance Metrics (ADMIN ONLY)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== 'ALL') where.status = status;

    const employees = await prisma.employee.findMany({
      where,
      include: {
        assignedLeads: {
          include: { followUps: true, admissions: true }
        },
        admissionsHandled: {
          include: { course: true }
        },
        terminalSales: true,
        assignedTerminalCustomers: true,
        assignedAlgoCustomers: true,
        assignedCopyCustomers: true,
        commissions: true,
        salaries: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const augmented = employees.map(emp => {
      const totalLeads = emp.assignedLeads.length;
      const contacted = emp.assignedLeads.filter(l => l.callStatus === 'CONNECTED').length;
      const callbacks = emp.assignedLeads.filter(l => l.status === 'FOLLOW_UP').length;
      const demos = emp.assignedLeads.filter(l => ['DEMO_SCHEDULED', 'DEMO_ATTENDED'].includes(l.status)).length;
      const demoCompleted = emp.assignedLeads.filter(l => l.status === 'DEMO_ATTENDED').length;
      const admissions = emp.admissionsHandled.length;
      const terminalCount = (emp.assignedTerminalCustomers || []).length;
      const algoCount = (emp.assignedAlgoCustomers || []).length;
      const copyCount = (emp.assignedCopyCustomers || []).length;

      const courseRev = emp.admissionsHandled.reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const coursePending = emp.admissionsHandled.reduce((acc, a) => acc + (a.pendingAmount || 0), 0);

      // Category Breakdown inside Course Revenue
      const technicalAnalysisRev = emp.admissionsHandled.filter(a => a.course?.category === 'Technical Analysis').reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const equityRev = emp.admissionsHandled.filter(a => a.course?.category === 'Equity').reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const derivativeRev = emp.admissionsHandled.filter(a => a.course?.category === 'Derivative').reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const commodityRev = emp.admissionsHandled.filter(a => a.course?.category === 'Commodity').reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const cfmtRev = emp.admissionsHandled.filter(a => a.course?.category === 'CFMT').reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const crashCourseRev = emp.admissionsHandled.filter(a => a.course?.category === 'Crash Course' || a.courseName?.toLowerCase().includes('crash')).reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      
      const terminalRev = (emp.assignedTerminalCustomers || []).reduce((acc, t) => acc + (t.paidAmount || 0), 0);
      const terminalPending = (emp.assignedTerminalCustomers || []).reduce((acc, t) => acc + (t.pendingAmount || 0), 0);

      const algoRev = (emp.assignedAlgoCustomers || []).reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const algoPending = (emp.assignedAlgoCustomers || []).reduce((acc, a) => acc + (a.pendingAmount || 0), 0);

      const copyRev = (emp.assignedCopyCustomers || []).reduce((acc, c) => acc + (c.paidAmount || 0), 0);
      const copyPending = (emp.assignedCopyCustomers || []).reduce((acc, c) => acc + (c.pendingAmount || 0), 0);

      const totalCollected = courseRev + terminalRev + algoRev + copyRev;
      const totalPending = coursePending + terminalPending + algoPending + copyPending;
      const totalRevenue = totalCollected + totalPending;

      const conversionRate = totalLeads > 0 ? ((admissions / totalLeads) * 100).toFixed(1) : '0.0';

      const commissionEarned = emp.commissions.reduce((acc, c) => acc + (c.commissionAmount || 0), 0);
      const commissionPaid = emp.commissions.filter(c => c.status === 'PAID').reduce((acc, c) => acc + (c.commissionAmount || 0), 0);
      const commissionPending = emp.commissions.filter(c => c.status === 'PENDING' || c.status === 'APPROVED').reduce((acc, c) => acc + (c.commissionAmount || 0), 0);

      return {
        id: emp.id,
        employeeCode: emp.employeeCode,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        designation: emp.designation,
        department: emp.department,
        baseSalary: emp.baseSalary,
        commissionRate: emp.commissionRate,
        status: emp.status,
        crmAccess: emp.crmAccess ?? true,
        hireDate: emp.hireDate,
        performance: {
          totalLeads,
          contacted,
          callbacks,
          demos,
          demoCompleted,
          admissions,
          terminalCount,
          algoCount,
          copyCount,
          courseRev,
          terminalRev,
          algoRev,
          copyRev,
          totalRevenue,
          collected: totalCollected,
          pending: totalPending,
          conversionRate,
          commissionEarned,
          commissionPaid,
          commissionPending
        }
      };
    });

    res.json({ success: true, employees: augmented });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const bcrypt = require('bcrypt');

// 2. POST Add New Employee (ADMIN ONLY)
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, designation, department, baseSalary, commissionRate, status, crmAccess, hireDate, employeeCodeInput } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({ success: false, error: 'Employee name, email, and phone are required.' });
    }

    const existingPhone = await prisma.employee.findFirst({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ success: false, error: `Employee with phone ${phone} already exists (${existingPhone.name}).` });
    }

    const existingEmail = await prisma.employee.findFirst({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ success: false, error: `Employee with email ${email} already exists.` });
    }

    const employeeCode = employeeCodeInput || (await generateEmployeeCode());
    const tempPassword = `HT#${Math.floor(100000 + Math.random() * 900000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Create or link real User account
    let user = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          studentId: `HT-EMP-${employeeCode}`,
          name,
          email,
          phone,
          role: designation || 'SALES_EXEC',
          password: passwordHash,
          referralCode: `HT-REF-${employeeCode}`
        }
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: designation || 'SALES_EXEC', password: passwordHash }
      });
    }

    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        userId: user.id,
        name,
        email,
        phone,
        designation: designation || 'SALES_EXEC',
        department: department || 'SALES',
        baseSalary: baseSalary ? Number(baseSalary) : 0,
        commissionRate: commissionRate ? Number(commissionRate) : 5,
        status: status || 'ACTIVE',
        crmAccess: crmAccess !== undefined ? Boolean(crmAccess) : true,
        hireDate: hireDate ? new Date(hireDate) : new Date()
      }
    });

    res.json({
      success: true,
      employee,
      credentials: {
        employeeCode,
        name,
        email,
        phone,
        tempPassword,
        designation: employee.designation,
        crmAccess: employee.crmAccess,
        loginUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://hellotraderinstitute.com'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2b. POST Reset Employee Password (ADMIN ONLY)
router.post('/:id/reset-password', async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found.' });

    const tempPassword = `HT#${Math.floor(100000 + Math.random() * 900000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    if (employee.userId) {
      await prisma.user.update({
        where: { id: employee.userId },
        data: { password: passwordHash }
      });
    } else {
      const user = await prisma.user.create({
        data: {
          studentId: `HT-EMP-${employee.employeeCode}`,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          role: employee.designation || 'SALES_EXEC',
          password: passwordHash,
          referralCode: `HT-REF-${employee.employeeCode}`
        }
      });
      await prisma.employee.update({
        where: { id: employee.id },
        data: { userId: user.id }
      });
    }

    res.json({
      success: true,
      credentials: {
        employeeCode: employee.employeeCode,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        tempPassword,
        designation: employee.designation,
        crmAccess: employee.crmAccess,
        loginUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://hellotraderinstitute.com'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. PATCH Edit Employee Profile / Access ON/OFF / Status
router.patch('/:id', async (req, res) => {
  try {
    const { name, email, phone, designation, department, baseSalary, commissionRate, status, crmAccess, hireDate } = req.body;

    const current = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (designation !== undefined) updateData.designation = designation;
    if (department !== undefined) updateData.department = department;
    if (baseSalary !== undefined) updateData.baseSalary = Number(baseSalary);
    if (commissionRate !== undefined) updateData.commissionRate = Number(commissionRate);
    if (status !== undefined) updateData.status = status;
    if (crmAccess !== undefined) updateData.crmAccess = Boolean(crmAccess);
    if (hireDate !== undefined) updateData.hireDate = new Date(hireDate);

    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, employee: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. DELETE / Deactivate Employee (Preserves Historical Data)
router.delete('/:id', async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }

    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        status: 'INACTIVE',
        crmAccess: false
      }
    });

    res.json({
      success: true,
      message: `Employee ${employee.name} (${employee.employeeCode}) has been deactivated and CRM access removed. All historical records remain intact.`,
      employee: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
