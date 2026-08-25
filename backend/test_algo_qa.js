const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:4000';

async function runQA() {
  console.log('====================================================');
  console.log('         HELLO TRADER QA SUITE — PHASE 1            ');
  console.log('====================================================\n');

  let adminToken = '';
  let userToken = '';
  let testUserId = '';
  let connectionId = '';
  let webhookToken = '';

  try {
    // 1. Authenticate Admin & User to get JWTs
    console.log('[QA 1] Auth Check...');
    const adminLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      emailOrPhone: 'hellotraderinstitute@gmail.com',
      password: 'Maa@2003'
    });
    adminToken = adminLogin.headers['set-cookie']?.[0] || '';
    console.log('✓ Admin Login OK:', adminLogin.data.user?.email);

    const userLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      emailOrPhone: 'HT0786',
      password: 'Hello@123'
    });
    userToken = userLogin.headers['set-cookie']?.[0] || '';
    testUserId = userLogin.data.user.id;
    console.log('✓ Student Login OK. User ID:', testUserId);

    const authHeaders = { Cookie: userToken };
    const adminHeaders = { Cookie: adminToken };

    // 2. Test GET /api/algo/brokers
    console.log('\n[QA 2] GET /api/algo/brokers...');
    const brokersRes = await axios.get(`${BASE_URL}/api/algo/brokers`, { headers: authHeaders });
    console.log('Response Status:', brokersRes.status);
    console.log('Brokers Count:', brokersRes.data.brokers?.length);
    console.log('Sample Broker:', brokersRes.data.brokers?.[0]);

    // 3. Test POST /api/algo/connect (With Consent & AES-256)
    console.log('\n[QA 3] POST /api/algo/connect (Broker Connection)...');
    const connectPayload = {
      broker: 'DHAN',
      displayName: 'QA Test Dhan Account',
      clientId: '1000999888',
      accessToken: 'sample_dhan_jwt_access_token_12345',
      maxDailyLoss: 5000,
      maxOpenTrades: 5,
      consentAccepted: true,
    };
    const connectRes = await axios.post(`${BASE_URL}/api/algo/connect`, connectPayload, { headers: authHeaders });
    console.log('Connect Response:', connectRes.data);
    connectionId = connectRes.data.connectionId;
    webhookToken = connectRes.data.webhookToken;

    // Verify DB record for Connection
    const dbConn = await prisma.algoBrokerConnection.findUnique({ where: { id: connectionId } });
    console.log('\n[QA DB Verification] AlgoBrokerConnection record in DB:');
    console.log({
      id: dbConn.id,
      broker: dbConn.broker,
      displayName: dbConn.displayName,
      encryptedToken: dbConn.accessToken, // Encrypted!
      consentAccepted: dbConn.consentAccepted,
      consentAt: dbConn.consentAt,
      consentIp: dbConn.consentIp,
      maxDailyLoss: dbConn.maxDailyLoss,
    });

    // 4. Test GET /api/algo/connections
    console.log('\n[QA 4] GET /api/algo/connections...');
    const listRes = await axios.get(`${BASE_URL}/api/algo/connections`, { headers: authHeaders });
    console.log('Connections list count:', listRes.data.connections?.length);
    console.log('Returned connection webhookUrl:', listRes.data.connections?.[0]?.webhookUrl);

    // 5. Test POST /api/algo/connections/:id/test
    console.log('\n[QA 5] POST /api/algo/connections/:id/test...');
    const testPingRes = await axios.post(`${BASE_URL}/api/algo/connections/${connectionId}/test`, {}, { headers: authHeaders });
    console.log('Ping test response:', testPingRes.data);

    // 6. Test Public Webhook Endpoint /webhook/tv/:webhookToken
    console.log('\n[QA 6] POST /webhook/tv/:webhookToken (TradingView Alert)...');
    const tvPayload = {
      action: 'BUY',
      symbol: 'NIFTY',
      qty: 50,
      price: 24500,
      sl: 24400,
      target: 24700,
      exchange: 'NSE',
      product: 'MIS',
      order_type: 'MARKET',
    };
    const webhookRes = await axios.post(`${BASE_URL}/webhook/tv/${webhookToken}`, tvPayload);
    console.log('Webhook Endpoint HTTP Response:', webhookRes.data);

    // Wait 1 second for async background processing
    await new Promise(r => setTimeout(r, 1000));

    // Verify DB record for Webhook Log
    const dbWebhookLog = await prisma.algoWebhookLog.findFirst({
      where: { connectionId },
      orderBy: { receivedAt: 'desc' }
    });
    console.log('\n[QA DB Verification] AlgoWebhookLog record in DB:');
    console.log({
      id: dbWebhookLog?.id,
      parsedSymbol: dbWebhookLog?.parsedSymbol,
      parsedAction: dbWebhookLog?.parsedAction,
      parsedQty: dbWebhookLog?.parsedQty,
      executionStatus: dbWebhookLog?.executionStatus,
      riskReason: dbWebhookLog?.riskReason,
      receivedAt: dbWebhookLog?.receivedAt,
    });

    // Verify Audit Log entry
    const dbAuditLogs = await prisma.auditLog.findMany({
      where: { userId: testUserId },
      orderBy: { timestamp: 'desc' },
      take: 3
    });
    console.log('\n[QA DB Verification] AuditLog records in DB:');
    dbAuditLogs.forEach((a, i) => console.log(`  [${i+1}] Category: ${a.category} | Action: ${a.action} | Detail: ${a.detail}`));

    // 7. Test Kill Switch Activation
    console.log('\n[QA 7] POST /api/algo/connections/:id/kill (Kill Switch ON)...');
    const killRes = await axios.post(`${BASE_URL}/api/algo/connections/${connectionId}/kill`, {
      active: true,
      reason: 'QA Test Emergency Stop'
    }, { headers: authHeaders });
    console.log('Kill Switch response:', killRes.data);

    // Send Webhook while Kill Switch is active
    console.log('\n[QA 7b] Sending Webhook while Kill Switch is Active...');
    await axios.post(`${BASE_URL}/webhook/tv/${webhookToken}`, tvPayload);
    await new Promise(r => setTimeout(r, 1000));

    const blockedLog = await prisma.algoWebhookLog.findFirst({
      where: { connectionId },
      orderBy: { receivedAt: 'desc' }
    });
    console.log('Log status after Kill Switch:', blockedLog?.executionStatus, '| Error:', blockedLog?.errorMessage);

    // 8. Test Admin Trial Override
    console.log('\n[QA 8] PATCH /api/admin/student/:id/trial (Trial Override)...');
    const trialRes = await axios.patch(`${BASE_URL}/api/admin/student/${testUserId}/trial`, {
      trialDays: 14,
      note: 'QA Mode trial extension to 14 days'
    }, { headers: adminHeaders });
    console.log('Trial override response:', trialRes.data);

    const dbUser = await prisma.user.findUnique({ where: { id: testUserId } });
    console.log('User DB state -> trialDaysOverride:', dbUser.trialDaysOverride, '| Note:', dbUser.trialOverrideNote);

    console.log('\n====================================================');
    console.log('         ALL QA SUITE CHECKS COMPLETED              ');
    console.log('====================================================');

  } catch (err) {
    console.error('QA Test Error:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runQA();
