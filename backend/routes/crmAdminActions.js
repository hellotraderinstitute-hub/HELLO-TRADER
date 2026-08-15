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

// POST /api/crm/admin/clear-test-data
// SAFELY REMOVES ONLY THE SAMPLE/TEST LEADS WITH FULL CONFIRMATION & ZERO TOUCH ON REAL PRODUCTION DATA
router.post('/clear-test-data', async (req, res) => {
  try {
    const { confirmKeyword } = req.body;

    if (confirmKeyword !== 'CLEAR_TEST_DATA') {
      return res.status(400).json({
        success: false,
        error: 'Safety verification failed. Please enter the exact confirmation keyword: CLEAR_TEST_DATA'
      });
    }

    // List sample test lead phones/numbers
    const samplePhones = ['9988776655', '9988776644', '9988776633', '9112233445'];
    const sampleNumbers = ['HT-LD-2026-0001', 'HT-LD-2026-0002', 'HT-LD-2026-0003'];

    // Delete sample test follow-ups and leads
    const testLeads = await prisma.lead.findMany({
      where: {
        OR: [
          { phone: { in: samplePhones } },
          { leadNumber: { in: sampleNumbers } },
          { leadNumber: { startsWith: 'HT-LD-TEST-' } }
        ]
      }
    });

    const leadIds = testLeads.map(l => l.id);

    if (leadIds.length > 0) {
      await prisma.leadFollowUp.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.demoAttendee.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.crmActivityTimeline.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    const remainingLeadsCount = await prisma.lead.count();

    res.json({
      success: true,
      message: `Test data cleanup complete. Deleted ${leadIds.length} sample test leads.`,
      deletedLeadsCount: leadIds.length,
      remainingLeadsCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
