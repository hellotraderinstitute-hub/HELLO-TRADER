const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const isStaffOrAdmin = (req, res, next) => {
  if (!req.user || !['ADMIN', 'SUPER_ADMIN', 'SALES_EXEC', 'TELECALLER', 'MANAGER', 'ACCOUNTS_MANAGER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access restricted to CRM staff & admins.' });
  }
  next();
};

router.use(isStaffOrAdmin);

// 1. GET List All Demos
router.get('/', async (req, res) => {
  try {
    const demos = await prisma.demoClass.findMany({
      include: {
        instructor: true,
        attendees: {
          include: { lead: true }
        }
      },
      orderBy: { scheduledAt: 'desc' }
    });

    res.json({ success: true, demos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST Schedule New Demo Session
router.post('/', async (req, res) => {
  try {
    const { title, topic, scheduledAt, durationMinutes, meetingUrl, instructorId } = req.body;

    if (!title || !scheduledAt || !instructorId) {
      return res.status(400).json({ success: false, error: 'Title, scheduled date, and instructor are required.' });
    }

    const demo = await prisma.demoClass.create({
      data: {
        title,
        topic: topic || title,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: durationMinutes ? Number(durationMinutes) : 60,
        meetingUrl,
        instructorId,
        status: 'SCHEDULED'
      },
      include: { instructor: true }
    });

    res.json({ success: true, demo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST Register Lead to Demo
router.post('/:id/register-lead', async (req, res) => {
  try {
    const { leadId } = req.body;
    const actorName = req.user?.name || req.user?.email || 'Staff';

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Lead ID required.' });
    }

    const demo = await prisma.demoClass.findUnique({ where: { id: req.params.id } });
    if (!demo) return res.status(404).json({ success: false, error: 'Demo class not found.' });

    const attendee = await prisma.demoAttendee.upsert({
      where: { demoId_leadId: { demoId: demo.id, leadId } },
      update: {},
      create: {
        demoId: demo.id,
        leadId,
        attended: false
      },
      include: { lead: true }
    });

    // Update lead status
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'DEMO_SCHEDULED' }
    });

    // Log Activity
    await prisma.crmActivityTimeline.create({
      data: {
        leadId,
        actorName,
        actorRole: req.user?.role || 'STAFF',
        eventType: 'DEMO_BOOKED',
        title: `Booked for Demo: ${demo.title}`,
        description: `Scheduled for ${new Date(demo.scheduledAt).toLocaleString('en-IN')}`
      }
    });

    res.json({ success: true, attendee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. PATCH Mark Attendance (Attended / Absent)
router.patch('/:id/attendance', async (req, res) => {
  try {
    const { leadId, attended, feedback } = req.body;
    const actorName = req.user?.name || req.user?.email || 'Staff';

    const attendee = await prisma.demoAttendee.update({
      where: { demoId_leadId: { demoId: req.params.id, leadId } },
      data: {
        attended: Boolean(attended),
        joinedAt: attended ? new Date() : null,
        feedback: feedback || null
      },
      include: { demo: true, lead: true }
    });

    if (attended) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'DEMO_ATTENDED' }
      });
    }

    // Log Activity
    await prisma.crmActivityTimeline.create({
      data: {
        leadId,
        actorName,
        actorRole: req.user?.role || 'STAFF',
        eventType: attended ? 'DEMO_ATTENDED' : 'DEMO_ABSENT',
        title: attended ? `Attended Demo: ${attendee.demo.title}` : `Absent from Demo: ${attendee.demo.title}`,
        description: feedback || (attended ? 'Attended live masterclass session.' : 'Did not join scheduled masterclass.')
      }
    });

    res.json({ success: true, attendee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
