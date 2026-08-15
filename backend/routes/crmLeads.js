const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// Helper: Check CRM Access & Role Authentication
const checkCrmAuth = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

  // ADMIN role has full access
  if (req.user.role === 'ADMIN') {
    req.crmUserRole = 'ADMIN';
    return next();
  }

  // Non-admin employees: Check Employee record & crmAccess status
  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { userId: req.user.id },
        { email: req.user.email },
        { phone: req.user.phone }
      ]
    }
  });

  if (!employee) {
    return res.status(403).json({ error: 'Employee profile not registered in CRM.' });
  }

  if (employee.status !== 'ACTIVE' || employee.crmAccess === false) {
    return res.status(403).json({ error: 'CRM Access Revoked. Please contact Admin.' });
  }

  req.crmEmployee = employee;
  req.crmUserRole = employee.designation || req.user.role || 'SALES_EXEC';
  next();
};

router.use(checkCrmAuth);

// Helper: Auto-generate lead number
async function generateLeadNumber() {
  const count = await prisma.lead.count();
  const year = new Date().getFullYear();
  return `HT-LD-${year}-${String(count + 1).padStart(4, '0')}`;
}

// 1. GET Dashboard Quick Stats (Role-Scoped: ADMIN sees company totals; SALES_EXEC sees own metrics only)
router.get('/dashboard-stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const isAdmin = req.crmUserRole === 'ADMIN';
    const empId = req.crmEmployee?.id;

    const leadWhere = {};
    const followUpWhere = { scheduledAt: { lte: todayEnd }, status: 'PENDING' };
    const demoWhere = { scheduledAt: { gte: todayStart, lte: todayEnd } };

    // Scoped for Non-Admin Staff (SALES_EXEC / TELECALLER)
    if (!isAdmin && empId) {
      leadWhere.assignedEmployeeId = empId;
      followUpWhere.employeeId = empId;
      demoWhere.instructorId = empId;
    }

    // Today's New Leads
    const todayNewLeads = await prisma.lead.count({
      where: {
        ...leadWhere,
        createdAt: { gte: todayStart, lte: todayEnd }
      }
    });

    // Pending Callbacks
    const pendingCallbacks = await prisma.leadFollowUp.count({ where: followUpWhere });

    // Today's Scheduled Demos
    const todayDemos = await prisma.demoClass.count({ where: demoWhere });

    // Hot Leads
    const hotLeads = await prisma.lead.count({
      where: {
        ...leadWhere,
        priority: { in: ['HIGH', 'URGENT'] },
        status: { notIn: ['ADMITTED', 'LOST', 'JUNK'] }
      }
    });

    // Breakdown by Marketing Source (Company-wide for ADMIN only)
    let sourceBreakdown = [];
    if (isAdmin) {
      const sources = await prisma.marketingSource.findMany({
        include: { _count: { select: { leads: true } } }
      });
      sourceBreakdown = sources.map(s => ({
        id: s.id,
        name: s.name,
        count: s._count.leads
      }));
    }

    // Status counts
    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      where: leadWhere,
      _count: { id: true }
    });

    // If Non-Admin Employee: calculate own sales & own commission (NO company revenue!)
    let myPerformance = null;
    if (!isAdmin && empId) {
      const myAdmissions = await prisma.admission.findMany({
        where: { counselorId: empId, status: { not: 'CANCELLED' } }
      });
      const myRevenue = myAdmissions.reduce((acc, a) => acc + (a.paidAmount || 0), 0);
      const myCommissions = await prisma.employeeCommission.findMany({
        where: { employeeId: empId }
      });
      const myCommissionEarned = myCommissions.reduce((acc, c) => acc + (c.commissionAmount || 0), 0);

      myPerformance = {
        myRevenueGenerated: myRevenue,
        myCommissionEarned,
        myConversionsCount: myAdmissions.length
      };
    }

    res.json({
      success: true,
      isAdmin,
      userRole: req.crmUserRole,
      stats: {
        todayNewLeads,
        pendingCallbacks,
        todayDemos,
        hotLeads
      },
      sourceBreakdown,
      statusCounts,
      myPerformance
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET Active Marketing Sources List
router.get('/sources', async (req, res) => {
  try {
    const sources = await prisma.marketingSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, sources });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET Active Employees List for Assignment
router.get('/employees', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE', crmAccess: true },
      select: { id: true, employeeCode: true, name: true, designation: true, department: true },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET Leads with Role-Based Scoping
router.get('/', async (req, res) => {
  try {
    const { status, callStatus, priority, sourceId, assignedEmployeeId, search } = req.query;
    const isAdmin = req.crmUserRole === 'ADMIN';

    const where = {};
    if (status) where.status = status;
    if (callStatus) where.callStatus = callStatus;
    if (priority) where.priority = priority;
    if (sourceId) where.sourceId = sourceId;

    // Security Scoping: Non-admin staff ONLY see their own assigned or created leads!
    if (!isAdmin) {
      where.OR = [
        { assignedEmployeeId: req.crmEmployee?.id },
        { createdById: req.crmEmployee?.id }
      ];
    } else if (assignedEmployeeId) {
      where.assignedEmployeeId = assignedEmployeeId;
    }

    if (search) {
      const searchCondition = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { leadNumber: { contains: search } }
      ];
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchCondition }
        ];
        delete where.OR;
      } else {
        where.OR = searchCondition;
      }
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        source: true,
        assignedEmployee: {
          select: { id: true, employeeCode: true, name: true, designation: true }
        },
        followUps: {
          orderBy: { scheduledAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. POST Create Lead
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, city, sourceId, assignedEmployeeId, priority, tradingExperience, budget, notes, leadType, productInterest } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required to create a lead.' });
    }

    const existing = await prisma.lead.findFirst({ where: { phone } });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `A lead with phone number ${phone} already exists (${existing.name}).`
      });
    }

    const leadNumber = await generateLeadNumber();
    const creatorEmpId = req.crmEmployee?.id || null;
    let assignEmpId = assignedEmployeeId || creatorEmpId;

    if (!assignEmpId) {
      const adminEmp = await prisma.employee.findFirst({ where: { designation: 'ADMIN', status: 'ACTIVE' } });
      if (adminEmp) assignEmpId = adminEmp.id;
    }

    const lead = await prisma.lead.create({
      data: {
        leadNumber,
        name,
        email,
        phone,
        city,
        sourceId,
        createdById: creatorEmpId,
        assignedEmployeeId: assignEmpId,
        priority: priority || 'MEDIUM',
        leadType: leadType || 'EDUCATIONAL_COURSE',
        productInterest: typeof productInterest === 'object' ? JSON.stringify(productInterest) : productInterest || null,
        tradingExperience,
        budget: budget ? Number(budget) : null,
        notes
      },
      include: {
        source: true,
        assignedEmployee: {
          select: { id: true, employeeCode: true, name: true, designation: true }
        }
      }
    });

    // Log Activity
    const actorName = req.crmEmployee?.name || req.user?.name || req.user?.email || 'Staff';
    await prisma.crmActivityTimeline.create({
      data: {
        leadId: lead.id,
        actorName,
        actorRole: req.crmUserRole,
        eventType: 'LEAD_CREATED',
        title: `Lead ${lead.leadNumber} Created (${lead.leadType})`,
        description: `Source: ${lead.source?.name || 'Direct'}, Assigned To: ${lead.assignedEmployee?.name || 'Unassigned'}`
      }
    });

    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. GET Single Lead Details (Role-Scoped)
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = req.crmUserRole === 'ADMIN';
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        source: true,
        assignedEmployee: {
          select: { id: true, employeeCode: true, name: true, designation: true }
        },
        followUps: {
          include: { employee: { select: { id: true, name: true } } },
          orderBy: { scheduledAt: 'desc' }
        },
        demoAttendee: {
          include: { demo: true }
        },
        crmActivities: {
          orderBy: { timestamp: 'desc' }
        }
      }
    });

    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found.' });

    // Scoping check
    if (!isAdmin && lead.assignedEmployeeId !== req.crmEmployee?.id && lead.createdById !== req.crmEmployee?.id) {
      return res.status(403).json({ error: 'Access restricted to assigned lead owner.' });
    }

    res.json({ success: true, lead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. PATCH Update Lead
router.patch('/:id', async (req, res) => {
  try {
    const { status, callStatus, priority, assignedEmployeeId, notes, budget, tradingExperience } = req.body;
    const isAdmin = req.crmUserRole === 'ADMIN';

    const currentLead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!currentLead) return res.status(404).json({ success: false, error: 'Lead not found.' });

    if (!isAdmin && currentLead.assignedEmployeeId !== req.crmEmployee?.id && currentLead.createdById !== req.crmEmployee?.id) {
      return res.status(403).json({ error: 'Access restricted to assigned lead owner.' });
    }

    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (callStatus !== undefined) updateData.callStatus = callStatus;
    if (priority !== undefined) updateData.priority = priority;
    if (isAdmin && assignedEmployeeId !== undefined) updateData.assignedEmployeeId = assignedEmployeeId;
    if (notes !== undefined) updateData.notes = notes;
    if (budget !== undefined) updateData.budget = Number(budget);
    if (tradingExperience !== undefined) updateData.tradingExperience = tradingExperience;

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: updateData,
      include: { source: true, assignedEmployee: { select: { id: true, name: true } } }
    });

    const actorName = req.crmEmployee?.name || req.user?.name || 'Staff';

    if (status && status !== currentLead.status) {
      await prisma.crmActivityTimeline.create({
        data: {
          leadId: updatedLead.id,
          actorName,
          actorRole: req.crmUserRole,
          eventType: 'STATUS_CHANGED',
          title: `Status Changed to ${status}`,
          description: `Previous: ${currentLead.status} → New: ${status}`
        }
      });
    }

    res.json({ success: true, lead: updatedLead });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. POST Schedule Follow-up
router.post('/:id/follow-up', async (req, res) => {
  try {
    const { scheduledAt, channel, summary, nextAction } = req.body;
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found.' });

    let empId = req.crmEmployee?.id || lead.assignedEmployeeId;

    // Fallback: If empId is missing and user is ADMIN, lookup active Admin employee profile
    if (!empId && req.user?.role === 'ADMIN') {
      const adminEmp = await prisma.employee.findFirst({
        where: {
          OR: [
            { userId: req.user.id },
            { email: req.user.email },
            { designation: 'ADMIN' }
          ],
          status: 'ACTIVE'
        }
      });
      if (adminEmp) empId = adminEmp.id;
    }

    if (!empId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot schedule callback without an assigned employee or active CRM staff profile.'
      });
    }

    const followUp = await prisma.leadFollowUp.create({
      data: {
        leadId: lead.id,
        employeeId: empId,
        scheduledAt: new Date(scheduledAt),
        channel: channel || 'CALL',
        summary,
        nextAction,
        status: 'PENDING'
      }
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'FOLLOW_UP', callStatus: 'CALLBACK_REQUESTED' }
    });

    const actorName = req.crmEmployee?.name || req.user?.name || 'Staff';
    await prisma.crmActivityTimeline.create({
      data: {
        leadId: lead.id,
        actorName,
        actorRole: req.crmUserRole,
        eventType: 'FOLLOWUP_SCHEDULED',
        title: `Callback Scheduled for ${new Date(scheduledAt).toLocaleString('en-IN')}`,
        description: `Channel: ${channel || 'CALL'} | Note: ${summary || ''}`
      }
    });

    res.json({ success: true, followUp });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. POST Convert Lead to Customer / Student
router.post('/:id/convert', async (req, res) => {
  try {
    const { courseId, planId, strategyName, masterTrader, initialPayment, dueDate } = req.body;
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { assignedEmployee: true }
    });

    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found.' });

    // 1. Create or Find User
    let user = await prisma.user.findFirst({ where: { phone: lead.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: lead.name,
          email: lead.email || `user.${Date.now()}@hellotrader.in`,
          phone: lead.phone,
          role: 'STUDENT',
          passwordHash: 'CONVERTED_LEAD_USER'
        }
      });
    }

    let createdRecord = null;
    const paid = initialPayment ? Number(initialPayment) : 0;
    const empId = lead.assignedEmployeeId || req.crmEmployee?.id || null;

    // 2. Conversion Based on Product Type
    if (lead.leadType === 'COURSE' || courseId) {
      let targetCourse = null;
      if (courseId) {
        targetCourse = await prisma.course.findUnique({ where: { id: courseId } });
      } else {
        targetCourse = await prisma.course.findFirst({ where: { isActive: true } });
      }

      let totalFee = targetCourse ? targetCourse.fee : 10000;
      const isCrashCourse = targetCourse?.category === 'Crash Course' || targetCourse?.name?.toLowerCase().includes('crash');

      if (isCrashCourse && manualFee) {
        totalFee = Number(manualFee);
      }

      const pending = Math.max(0, totalFee - paid);
      const admissionNum = `HT-ADM-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      createdRecord = await prisma.admission.create({
        data: {
          admissionNumber: admissionNum,
          leadId: lead.id,
          userId: user.id,
          courseId: targetCourse?.id || null,
          courseName: targetCourse?.name || 'General Trading Course',
          totalFee,
          netFee: totalFee,
          paidAmount: paid,
          pendingAmount: pending,
          dueDate: dueDate ? new Date(dueDate) : null,
          counselorId: empId,
          convertedById: req.crmEmployee?.id || null
        }
      });

      if (paid > 0) {
        await prisma.coursePayment.create({
          data: {
            receiptNumber: `HT-RCP-${Date.now().toString().slice(-4)}`,
            admissionId: createdRecord.id,
            amount: paid,
            paymentMethod: 'ONLINE',
            collectedById: empId,
            verifiedById: req.crmEmployee?.id || null,
            status: 'VERIFIED'
          }
        });
      }
    } else if (lead.leadType === 'TERMINAL') {
      const totalFee = 900;
      const pending = Math.max(0, totalFee - paid);
      createdRecord = await prisma.terminalCustomer.create({
        data: {
          userId: user.id,
          customerNumber: `HT-TC-${Date.now().toString().slice(-4)}`,
          totalFee,
          paidAmount: paid,
          pendingAmount: pending,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          assignedEmployeeId: empId
        }
      });
    } else if (lead.leadType === 'ALGO') {
      const totalFee = 5000;
      const pending = Math.max(0, totalFee - paid);
      createdRecord = await prisma.algoCustomer.create({
        data: {
          userId: user.id,
          strategyName: strategyName || 'Nifty Momentum Algo',
          planName: 'Monthly Subscription',
          totalFee,
          paidAmount: paid,
          pendingAmount: pending,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          assignedEmployeeId: empId
        }
      });
    } else if (lead.leadType === 'COPY_TRADING') {
      const totalFee = 3000;
      const pending = Math.max(0, totalFee - paid);
      createdRecord = await prisma.copyCustomer.create({
        data: {
          userId: user.id,
          masterTrader: masterTrader || 'Pro Trader Alpha',
          planName: 'Monthly Copy',
          totalFee,
          paidAmount: paid,
          pendingAmount: pending,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          assignedEmployeeId: empId
        }
      });
    }

    // Update Lead Status
    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: 'ADMITTED',
        convertedUserId: user.id,
        convertedAt: new Date()
      }
    });

    // Timeline Log
    const actorName = req.crmEmployee?.name || req.user?.name || 'Staff';
    await prisma.crmActivityTimeline.create({
      data: {
        leadId: lead.id,
        actorName,
        actorRole: req.crmUserRole,
        eventType: 'LEAD_CONVERTED',
        title: `Lead Converted to Customer (${lead.leadType})`,
        description: `Customer/Student User ID: ${user.id}`
      }
    });

    res.json({ success: true, lead: updatedLead, user, createdRecord });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
