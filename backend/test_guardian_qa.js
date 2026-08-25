const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:4000';

async function runGuardianQA() {
  console.log('====================================================');
  console.log('         HELLO TRADER GUARDIAN QA TEST SUITE        ');
  console.log('====================================================\n');

  try {
    // 1. GET /api/guardian/health
    console.log('[GUARDIAN QA 1] GET /api/guardian/health...');
    const healthRes = await axios.get(`${BASE_URL}/api/guardian/health`);
    console.log('HTTP Status:', healthRes.status);
    console.log('Overall Status:', healthRes.data.overall);
    console.log('Check Duration:', healthRes.data.checkDurationMs, 'ms');
    console.log('\n--- Real Non-Hardcoded Subsystem Checks ---');
    console.log('Backend:', healthRes.data.checks.backend);
    console.log('Database:', healthRes.data.checks.database);
    console.log('Frontend:', healthRes.data.checks.frontend);
    console.log('Redis:', healthRes.data.checks.redis); // Expected: NOT IMPLEMENTED
    console.log('Broker:', healthRes.data.checks.broker);
    console.log('Webhook:', healthRes.data.checks.webhook);
    console.log('Queue:', healthRes.data.checks.queue);
    console.log('Login:', healthRes.data.checks.login);
    console.log('Wallet:', healthRes.data.checks.wallet);
    console.log('Membership:', healthRes.data.checks.membership);

    // 2. Test Incident DB table record creation
    console.log('\n[GUARDIAN QA 2] Writing test Incident to DB...');
    const inc = await prisma.guardianIncident.create({
      data: {
        component: 'DATABASE',
        severity: 'WARNING',
        message: 'QA Automated Test Incident',
        error: 'Test latency check simulated',
        autoActionTaken: 'LOGGED_WARNING',
      }
    });
    console.log('Incident record created in DB:', inc.id);

    // 3. GET /api/guardian/incidents
    console.log('\n[GUARDIAN QA 3] GET /api/guardian/incidents...');
    const incRes = await axios.get(`${BASE_URL}/api/guardian/incidents`);
    console.log('Incidents count:', incRes.data.incidents?.length);
    console.log('Latest Incident:', incRes.data.incidents?.[0]);

    console.log('\n====================================================');
    console.log('         GUARDIAN QA SUITE COMPLETED                ');
    console.log('====================================================');

  } catch (err) {
    console.error('Guardian QA Error:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runGuardianQA();
