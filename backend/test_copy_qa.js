const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:4000';

async function runCopyQA() {
  console.log('====================================================');
  console.log('         HELLO TRADER QA SUITE — PHASE 2            ');
  console.log('         ENTERPRISE COPY TRADING ENGINE             ');
  console.log('====================================================\n');

  try {
    // 1. Auth Setup (Admin & Student)
    const userLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      emailOrPhone: 'HT0786',
      password: 'Hello@123'
    });
    const userToken = userLogin.headers['set-cookie']?.[0] || '';
    const userId = userLogin.data.user.id;
    const authHeaders = { Cookie: userToken };

    console.log('[COPY QA 1] Auth Verified for User:', userId);

    // 2. Connect Broker account for Master
    const connRes = await axios.post(`${BASE_URL}/api/algo/connect`, {
      broker: 'DHAN',
      displayName: 'Master Dhan Demat Account',
      clientId: '1000888777',
      accessToken: 'sample_master_jwt_token_999',
      consentAccepted: true,
    }, { headers: authHeaders });

    const connectionId = connRes.data.connectionId;
    console.log('[COPY QA 2] Master Broker Connected ID:', connectionId);

    // 3. Register as Master Trader
    console.log('\n[COPY QA 3] POST /api/copy/register-master...');
    const masterRegRes = await axios.post(`${BASE_URL}/api/copy/register-master`, {
      connectionId,
      displayName: 'Alpha Momentum Master Trader',
      description: 'Institutional breakouts on Nifty options',
      riskLevel: 'HIGH',
      isPublic: true,
      maxFollowers: 25,
    }, { headers: authHeaders });
    console.log('Master Registration Response:', masterRegRes.data);

    // 4. Test GET /api/copy/masters
    console.log('\n[COPY QA 4] GET /api/copy/masters...');
    const mastersListRes = await axios.get(`${BASE_URL}/api/copy/masters`, { headers: authHeaders });
    console.log('Public Masters Count:', mastersListRes.data.masters?.length);
    console.log('Sample Master Record:', mastersListRes.data.masters?.[0]);

    // 5. Test Master Trade Broadcast to Followers
    console.log('\n[COPY QA 5] POST /api/copy/master/broadcast...');
    const broadcastRes = await axios.post(`${BASE_URL}/api/copy/master/broadcast`, {
      symbol: 'NIFTY',
      exchange: 'NSE',
      side: 'BUY',
      quantity: 50,
      price: 24500,
      orderType: 'MARKET',
      productType: 'MIS',
    }, { headers: authHeaders });
    console.log('Broadcast Response:', broadcastRes.data);

    // 6. DB Verification of Copy Models
    const dbMaster = await prisma.copyMaster.findUnique({ where: { userId } });
    console.log('\n[COPY DB Verification] CopyMaster Record:');
    console.log({
      id: dbMaster.id,
      displayName: dbMaster.displayName,
      riskLevel: dbMaster.riskLevel,
      isActive: dbMaster.isActive,
      maxFollowers: dbMaster.maxFollowers,
    });

    const dbAuditLogs = await prisma.auditLog.findMany({
      where: { category: 'COPY' },
      orderBy: { timestamp: 'desc' },
      take: 2,
    });
    console.log('\n[COPY DB Verification] AuditLog Records for Copy Engine:');
    dbAuditLogs.forEach((a, i) => console.log(`  [${i+1}] Action: ${a.action} | Detail: ${a.detail}`));

    console.log('\n====================================================');
    console.log('         PHASE 2 COPY QA SUITE COMPLETED            ');
    console.log('====================================================');

  } catch (err) {
    console.error('Copy QA Error:', err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runCopyQA();
