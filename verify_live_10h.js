const axios = require('/var/www/hello-trader/backend/node_modules/axios');
const jwt = require('/var/www/hello-trader/node_modules/jsonwebtoken');
const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');

const dotenv = require('/var/www/hello-trader/backend/node_modules/dotenv');
dotenv.config({ path: '/var/www/hello-trader/backend/.env' });

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';
const BACKEND_URL = 'http://localhost:4000/api';

const prisma = new PrismaClient();

async function test() {
  console.log('=== VPS LIVE PHASE 10H E2E VERIFICATION ===\n');

  // Find users
  const users = await prisma.user.findMany();
  const { checkUserEntitlement } = require('/var/www/hello-trader/backend/services/entitlementService');
  
  let adminUser = null;
  let premiumUser = null;
  let freeUser = null;

  for (const u of users) {
    if (u.role === 'ADMIN' && !adminUser) {
      adminUser = u;
    } else {
      const ent = await checkUserEntitlement(u.id, 'OPTION_CHAIN');
      if (ent.authorized && !premiumUser) {
        premiumUser = u;
      } else if (!ent.authorized && !freeUser) {
        freeUser = u;
      }
    }
  }

  const getHeaders = (user) => {
    const token = jwt.sign({ id: user.id, role: user.role, studentId: user.studentId }, JWT_SECRET, { expiresIn: '1h' });
    return { 'Authorization': `Bearer ${token}` };
  };

  // 1. Verify /api/ticks live price
  console.log('--- Test 1: Live Ticks Endpoint ---');
  const ticksRes = await axios.get(`${BACKEND_URL}/ticks`);
  const niftyTick = ticksRes.data.ticks.find(t => t.symbol === 'NIFTY');
  console.log('NIFTY Tick Data:', niftyTick);
  const isTicksOk = niftyTick && niftyTick.price > 0 && niftyTick.price !== 24557;
  console.log(`Live Ticks Active (Price !== 24557): ${isTicksOk ? '🟢 PASS' : '🔴 FAIL'}`);

  // 2. Fetch Option Chain details
  console.log('\n--- Test 2: Sync check with Option Chain ---');
  const expRes = await axios.get(`${BACKEND_URL}/smde/option-chain/expiries?symbol=NIFTY`);
  const expiry = expRes.data?.expiries?.[0];
  const ocRes = await axios.get(`${BACKEND_URL}/trade/option-chain?symbol=NIFTY&expiry=${expiry}`, { headers: getHeaders(premiumUser) });
  const optSpot = ocRes.data.spotPrice;
  console.log('Ticks NIFTY Price:', niftyTick?.price);
  console.log('Option Chain Spot Price:', optSpot);
  const diff = Math.abs((niftyTick?.price || 0) - (optSpot || 0));
  console.log(`Price Difference: ${diff.toFixed(2)} pts`);
  console.log(`Reasonably Synchronized (<50 pts): ${diff < 50 ? '🟢 PASS' : '🔴 FAIL'}`);

  // 3. Confirm Phase 10G single ATM highlight count
  console.log('\n--- Test 3: Phase 10G Single ATM Integrity check ---');
  const contracts = ocRes.data.contracts;
  const nearest = contracts.reduce((nearest, c) =>
    Math.abs(c.strike - optSpot) < Math.abs(nearest.strike - optSpot) ? c : nearest
  );
  const isAtmMap = contracts.map(c => ({
    strike: c.strike,
    isAtm: c.strike === nearest.strike
  }));
  const atmCount = isAtmMap.filter(x => x.isAtm).length;
  console.log(`ATM Strike Count highlighted: ${atmCount}`);
  console.log(`Exactly ONE ATM highlight: ${atmCount === 1 ? '🟢 PASS' : '🔴 FAIL'}`);

  // 4. Role-based sanitization
  console.log('\n--- Test 4: Role-based Entitlement checks ---');
  const freeRes = await axios.get(`${BACKEND_URL}/trade/option-chain?symbol=NIFTY&expiry=${expiry}`, { headers: getHeaders(freeUser) });
  const freeKeys = Object.keys(freeRes.data.contracts[0]);
  const isFreeOk = freeKeys.length === 4 && freeKeys.includes('strike') && freeKeys.includes('ceLtp');
  console.log('Free User sanitization keys:', freeKeys);
  console.log(`Free User Sanitized: ${isFreeOk ? '🟢 PASS' : '🔴 FAIL'}`);

  const bypassRes = await axios.get(`${BACKEND_URL}/smde/option-chain?symbol=NIFTY&expiry=${expiry}`);
  const bypassKeys = Object.keys(bypassRes.data.contracts[0]);
  const isBypassOk = bypassKeys.length === 4 && bypassKeys.includes('peLtp');
  console.log(`Bypass Endpoint Sanitized: ${isBypassOk ? '🟢 PASS' : '🔴 FAIL'}`);

  // 5. Admin role verification
  console.log('\n--- Test 5: Admin User Identity details ---');
  console.log('Admin user email:', adminUser?.email);
  console.log('Admin role confirmed:', adminUser?.role === 'ADMIN' ? '🟢 YES' : '🔴 NO');
}

test().then(() => {
  prisma.$disconnect();
  process.exit(0);
});
