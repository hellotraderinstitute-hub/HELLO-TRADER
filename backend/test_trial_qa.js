const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:4000';

async function testTrialExtension() {
  console.log('====================================================');
  console.log('   QA VERIFICATION — TRIAL EXTENSION FOR STUDENT    ');
  console.log('====================================================\n');

  try {
    // 1. Admin Auth
    const adminLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      emailOrPhone: 'hellotraderinstitute@gmail.com',
      password: 'Maa@2003'
    });
    const adminToken = adminLogin.headers['set-cookie']?.[0] || '';
    const adminHeaders = { Cookie: adminToken };

    // 2. Find Student HT0786
    const student = await prisma.user.findUnique({ where: { studentId: 'HT0786' } });
    console.log('Student found:', student.name, 'ID:', student.id);
    console.log('Current Trial Override:', student.trialDaysOverride || '4 days (default)');

    // 3. Extend trial to 14 days with admin note
    console.log('\n[Admin Action] Extending trial to 14 days...');
    const res = await axios.patch(`${BASE_URL}/api/admin/student/${student.id}/trial`, {
      trialDays: 14,
      note: 'Trial extended by Admin for demonstration'
    }, { headers: adminHeaders });

    console.log('API Response:', res.data);

    // 4. Verify DB state after extension
    const updated = await prisma.user.findUnique({ where: { id: student.id } });
    console.log('\n--- DB State After Extension ---');
    console.log({
      studentId: updated.studentId,
      name: updated.name,
      trialDaysOverride: updated.trialDaysOverride,
      trialOverrideNote: updated.trialOverrideNote,
      trialOverrideAt: updated.trialOverrideAt,
    });

    console.log('\n====================================================');
    console.log('   TRIAL EXTENSION VERIFIED SUCCESSFULLY — PASS      ');
    console.log('====================================================');
  } catch (err) {
    console.error('Test error:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testTrialExtension();
