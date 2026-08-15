const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const https = require('https');

// Helper: Check CRM Access & Role Scoping
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

// Helper: Auto-generate Reminder Number
async function generateReminderNumber() {
  const count = await prisma.crmReminder.count();
  return `#CRM-REM-${String(count + 1001).padStart(4, '0')}`;
}

// 1. GET Reminders (Scoped)
router.get('/', async (req, res) => {
  try {
    const { status, type, filter, search } = req.query;
    const isAdmin = req.crmUserRole === 'ADMIN';
    const empId = req.crmEmployee?.id;

    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (type && type !== 'ALL') where.type = type;

    // Non-admin scoping
    if (!isAdmin && empId) {
      where.employeeId = empId;
    }

    const nowUTC = new Date();

    if (filter === 'TODAY') {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: todayStart, lte: todayEnd };
    } else if (filter === 'OVERDUE') {
      where.scheduledAt = { lt: nowUTC };
      where.status = 'PENDING';
    } else if (filter === 'UPCOMING_7_DAYS') {
      const next7Days = new Date(nowUTC.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.scheduledAt = { gte: nowUTC, lte: next7Days };
      where.status = 'PENDING';
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { reminderNumber: { contains: search } }
      ];
    }

    const reminders = await prisma.crmReminder.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, name: true } },
        lead: { select: { id: true, leadNumber: true, name: true, phone: true } },
        admission: { select: { id: true, admissionNumber: true, user: { select: { name: true } } } }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const baseWhere = !isAdmin && empId ? { employeeId: empId } : {};

    const [todayPendingCount, completedCount, overdueCount] = await Promise.all([
      prisma.crmReminder.count({ where: { ...baseWhere, status: 'PENDING', scheduledAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.crmReminder.count({ where: { ...baseWhere, status: 'COMPLETED' } }),
      prisma.crmReminder.count({ where: { ...baseWhere, status: 'PENDING', scheduledAt: { lt: nowUTC } } })
    ]);

    res.json({
      success: true,
      summary: {
        todayPendingCount,
        completedCount,
        overdueCount
      },
      reminders
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET / PATCH Reminder Settings (Admin Only)
router.get('/settings', async (req, res) => {
  try {
    let settings = await prisma.reminderSettings.findUnique({ where: { id: 'GLOBAL' } });
    if (!settings) {
      settings = await prisma.reminderSettings.create({ data: { id: 'GLOBAL' } });
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    if (req.crmUserRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const {
      remind7DaysBefore, remind3DaysBefore, remind1DayBefore, remindOnDueDate,
      remindOverdue, overdueFrequency, subscriptionRenewal7d, subscriptionRenewal3d,
      subscriptionRenewal1d, subscriptionRenewalOn, globalTelegramActive
    } = req.body;

    const updateData = {};
    if (remind7DaysBefore !== undefined) updateData.remind7DaysBefore = Boolean(remind7DaysBefore);
    if (remind3DaysBefore !== undefined) updateData.remind3DaysBefore = Boolean(remind3DaysBefore);
    if (remind1DayBefore !== undefined) updateData.remind1DayBefore = Boolean(remind1DayBefore);
    if (remindOnDueDate !== undefined) updateData.remindOnDueDate = Boolean(remindOnDueDate);
    if (remindOverdue !== undefined) updateData.remindOverdue = Boolean(remindOverdue);
    if (overdueFrequency !== undefined) updateData.overdueFrequency = overdueFrequency;
    if (subscriptionRenewal7d !== undefined) updateData.subscriptionRenewal7d = Boolean(subscriptionRenewal7d);
    if (subscriptionRenewal3d !== undefined) updateData.subscriptionRenewal3d = Boolean(subscriptionRenewal3d);
    if (subscriptionRenewal1d !== undefined) updateData.subscriptionRenewal1d = Boolean(subscriptionRenewal1d);
    if (subscriptionRenewalOn !== undefined) updateData.subscriptionRenewalOn = Boolean(subscriptionRenewalOn);
    if (globalTelegramActive !== undefined) updateData.globalTelegramActive = Boolean(globalTelegramActive);

    const settings = await prisma.reminderSettings.upsert({
      where: { id: 'GLOBAL' },
      update: updateData,
      create: { id: 'GLOBAL', ...updateData }
    });

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST Diagnostic Test Telegram Message (Admin Only)
router.post('/test-telegram', async (req, res) => {
  try {
    if (req.crmUserRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !targetChatId) {
      return res.json({
        success: false,
        status: 'CONFIGURATION_REQUIRED',
        message: '⚠️ TELEGRAM NOT CONFIGURED: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in environment.'
      });
    }

    const payload = JSON.stringify({
      chat_id: targetChatId,
      text: '🤖 <b>TELEGRAM DIAGNOSTIC TEST</b>\n\n✅ Hello Trader Telegram Bot connection verified successfully!',
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const request = https.request(options, (response) => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.ok) {
            return res.json({
              success: true,
              status: 'TELEGRAM_CONNECTED',
              message: '✅ Telegram Connected: Real test message delivered successfully!'
            });
          } else {
            return res.json({
              success: false,
              status: 'TELEGRAM_FAILED',
              message: `❌ Telegram Failed: ${parsed.description || 'API call rejected.'}`
            });
          }
        } catch (e) {
          return res.json({ success: false, status: 'TELEGRAM_FAILED', message: body });
        }
      });
    });

    request.on('error', (err) => {
      return res.json({
        success: false,
        status: 'TELEGRAM_FAILED',
        message: `❌ Telegram Failed: ${err.message}`
      });
    });

    request.write(payload);
    request.end();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. POST Create Manual Reminder
router.post('/', async (req, res) => {
  try {
    const { title, type, scheduledAt, description, leadId, admissionId, employeeId } = req.body;
    if (!title || !scheduledAt) {
      return res.status(400).json({ success: false, error: 'Title and scheduled time are required.' });
    }

    const reminderNumber = await generateReminderNumber();
    const assignedEmpId = employeeId || req.crmEmployee?.id || null;

    const reminder = await prisma.crmReminder.create({
      data: {
        reminderNumber,
        employeeId: assignedEmpId,
        leadId,
        admissionId,
        title,
        type: type || 'GENERAL',
        description,
        scheduledAt: new Date(scheduledAt),
        timezone: 'Asia/Kolkata',
        status: 'PENDING',
        source: 'CRM_DASHBOARD'
      }
    });

    res.json({ success: true, reminder });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. PATCH Edit / Update Reminder Status
router.patch('/:id', async (req, res) => {
  try {
    const { status, title, type, scheduledAt, description } = req.body;
    const current = await prisma.crmReminder.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ success: false, error: 'Reminder not found.' });

    const updateData = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'COMPLETED') updateData.completedAt = new Date();
      if (status === 'CANCELLED') updateData.cancelledAt = new Date();
    }
    if (title !== undefined) updateData.title = title;
    if (type !== undefined) updateData.type = type;
    if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt);
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.crmReminder.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, reminder: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
