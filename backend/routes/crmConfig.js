const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

const isStaffOrAdmin = (req, res, next) => {
  if (!req.user || !['ADMIN', 'SALES_EXEC', 'TELECALLER', 'MANAGER', 'ACCOUNTANT'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access restricted to CRM staff & admins.' });
  }
  next();
};

const isAdminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required for configuration.' });
  }
  next();
};

router.use(isStaffOrAdmin);

// ─── 1. LEAD SOURCES MANAGEMENT ─────────────────────────────────────────

// GET Lead Sources
router.get('/sources', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const where = includeInactive === 'true' ? {} : { isActive: true };

    const sources = await prisma.marketingSource.findMany({
      where,
      include: { _count: { select: { leads: true } } },
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, sources });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Add Lead Source (Admin Only)
router.post('/sources', isAdminOnly, async (req, res) => {
  try {
    const { name, channelType } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Source name is required.' });

    const existing = await prisma.marketingSource.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, error: `Source "${name}" already exists.` });
    }

    const source = await prisma.marketingSource.create({
      data: { name, channelType: channelType || 'DIGITAL', isActive: true }
    });

    res.json({ success: true, source });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH Toggle Lead Source Status (Admin Only)
router.patch('/sources/:id', isAdminOnly, async (req, res) => {
  try {
    const { isActive, name, channelType } = req.body;
    const updateData = {};
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (name !== undefined) updateData.name = name;
    if (channelType !== undefined) updateData.channelType = channelType;

    const source = await prisma.marketingSource.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, source });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: Deduplicate course master records safely without losing admissions
async function deduplicateCourseMasters() {
  try {
    const allCourses = await prisma.course.findMany({
      include: { _count: { select: { admissions: true } } },
      orderBy: { createdAt: 'asc' }
    });

    const grouped = {};
    for (const crs of allCourses) {
      const key = crs.name.trim().toLowerCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(crs);
    }

    let mergedCount = 0;
    for (const key of Object.keys(grouped)) {
      const list = grouped[key];
      if (list.length > 1) {
        list.sort((a, b) => (b._count?.admissions || 0) - (a._count?.admissions || 0));
        const canonical = list[0];
        const duplicates = list.slice(1);

        for (const dup of duplicates) {
          await prisma.admission.updateMany({
            where: { courseId: dup.id },
            data: { courseId: canonical.id, courseName: canonical.name }
          });
          await prisma.course.delete({ where: { id: dup.id } });
          mergedCount++;
        }
      }
    }
    return mergedCount;
  } catch (err) {
    console.error('Error deduplicating courses:', err.message);
    return 0;
  }
}

// ─── 2. COURSES MANAGEMENT ──────────────────────────────────────────────

// GET All Courses (Auto-deduplicated)
router.get('/courses', async (req, res) => {
  try {
    await deduplicateCourseMasters();
    const { includeInactive } = req.query;
    const where = includeInactive === 'true' ? {} : { isActive: true };

    const courses = await prisma.course.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { admissions: true } } }
    });

    res.json({ success: true, courses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Manual Deduplicate Courses Endpoint (Admin Only)
router.post('/courses/deduplicate', isAdminOnly, async (req, res) => {
  try {
    const mergedCount = await deduplicateCourseMasters();
    const courses = await prisma.course.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ success: true, message: `Deduplicated ${mergedCount} duplicate course master records.`, coursesCount: courses.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Add New Course (Admin Only)
router.post('/courses', isAdminOnly, async (req, res) => {
  try {
    const { name, code, category, fee, durationDays, description } = req.body;
    if (!name || !fee) return res.status(400).json({ success: false, error: 'Course name and fee are required.' });

    const generatedCode = code || `HT-CRS-${String(Date.now()).slice(-4)}`;

    const course = await prisma.course.create({
      data: {
        name,
        code: generatedCode,
        category: category || 'Technical Analysis',
        fee: Number(fee),
        durationDays: durationDays ? Number(durationDays) : 90,
        description,
        isActive: true
      }
    });

    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH Edit Course (Admin Only)
router.patch('/courses/:id', isAdminOnly, async (req, res) => {
  try {
    const { name, category, fee, durationDays, description, isActive } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (fee !== undefined) updateData.fee = Number(fee);
    if (durationDays !== undefined) updateData.durationDays = Number(durationDays);
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 3. TERMINAL PLANS MANAGEMENT ───────────────────────────────────────

// GET All Terminal Plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.terminalPlan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { recharges: true } } }
    });

    res.json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Add New Terminal Plan (Admin Only)
router.post('/plans', isAdminOnly, async (req, res) => {
  try {
    const { name, productType, price, validityDays, maxBrokers, description } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, error: 'Plan name and price are required.' });

    const plan = await prisma.terminalPlan.create({
      data: {
        name,
        productType: productType || 'LIVE_DATA_PAPER_TRADING',
        price: Number(price),
        validityDays: validityDays ? Number(validityDays) : 30,
        maxBrokers: maxBrokers ? Number(maxBrokers) : 2,
        description,
        isActive: true
      }
    });

    res.json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH Edit Terminal Plan (Admin Only)
router.patch('/plans/:id', isAdminOnly, async (req, res) => {
  try {
    const { name, productType, price, validityDays, maxBrokers, description, isActive } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (productType !== undefined) updateData.productType = productType;
    if (price !== undefined) updateData.price = Number(price);
    if (validityDays !== undefined) updateData.validityDays = Number(validityDays);
    if (maxBrokers !== undefined) updateData.maxBrokers = Number(maxBrokers);
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const plan = await prisma.terminalPlan.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
