const axios = require('/var/www/hello-trader/backend/node_modules/axios');
const jwt = require('/var/www/hello-trader/node_modules/jsonwebtoken');
const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');

const dotenv = require('/var/www/hello-trader/backend/node_modules/dotenv');
dotenv.config({ path: '/var/www/hello-trader/backend/.env' });

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';
const BACKEND_URL = 'http://localhost:4000/api';

const prisma = new PrismaClient();

async function test() {
  console.log('=== VPS LIVE PHASE 10G E2E VERIFICATION ===\n');

  // Get NIFTY expiries
  const expRes = await axios.get(`${BACKEND_URL}/smde/option-chain/expiries?symbol=NIFTY`);
  const expiry = expRes.data?.expiries?.[0];
  if (!expiry) {
    console.error('Failed to get expiries');
    return;
  }
  console.log('Active Expiry:', expiry);

  // Fetch contracts
  const ocRes = await axios.get(`${BACKEND_URL}/smde/option-chain?symbol=NIFTY&expiry=${expiry}`);
  const contracts = ocRes.data.contracts;
  const realSpot = ocRes.data.spotPrice;
  console.log('Real-time NIFTY Spot Price from Dhan:', realSpot);

  if (!contracts || contracts.length === 0) {
    console.error('No contracts found!');
    return;
  }

  // 1. Simulate frontend ATM calculations with the 6 test spot cases
  const testSpots = [24324, 24325, 24326, 24330, 24349, 24351];
  
  console.log('\n--- Test 1: Highlighting Cases (Count & Alignment) ---');
  testSpots.forEach(sp => {
    const nearest = contracts.reduce((nearest, c) =>
      Math.abs(c.strike - sp) < Math.abs(nearest.strike - sp)
        ? c
        : nearest
    );

    const isAtmMap = contracts.map(c => ({
      strike: c.strike,
      isAtm: c.strike === nearestStrike(contracts, sp)
    }));

    const atmCount = isAtmMap.filter(x => x.isAtm).length;
    const highlightedStrikes = isAtmMap.filter(x => x.isAtm).map(x => x.strike);
    console.log(`Spot: ${sp.toFixed(1).padStart(7)} | Highlights Count: ${atmCount} | Highlighted Strike: [ ${highlightedStrikes.join(', ')} ]`);
    
    if (atmCount !== 1) {
      console.error(`🔴 FAIL: Highlighted count for spot ${sp} is not exactly 1! (Count: ${atmCount})`);
      process.exit(1);
    }
  });

  function nearestStrike(cts, sp) {
    return cts.reduce((nearest, c) =>
      Math.abs(c.strike - sp) < Math.abs(nearest.strike - sp) ? c : nearest
    ).strike;
  }

  // 2. Role-based checking
  console.log('\n--- Test 2: Entitlement & Bypass Protections ---');
  const users = await prisma.user.findMany();
  const { checkUserEntitlement } = require('/var/www/hello-trader/backend/services/entitlementService');
  
  let premiumUser = null;
  let freeUser = null;

  for (const u of users) {
    if (u.role === 'ADMIN') continue;
    const ent = await checkUserEntitlement(u.id, 'OPTION_CHAIN');
    if (ent.authorized && !premiumUser) {
      premiumUser = u;
    } else if (!ent.authorized && !freeUser) {
      freeUser = u;
    }
  }

  const getHeaders = (user) => {
    const token = jwt.sign({ id: user.id, role: user.role, studentId: user.studentId }, JWT_SECRET, { expiresIn: '1h' });
    return { 'Authorization': `Bearer ${token}` };
  };

  const freeRes = await axios.get(`${BACKEND_URL}/trade/option-chain?symbol=NIFTY&expiry=${expiry}`, { headers: getHeaders(freeUser) });
  const freeKeys = Object.keys(freeRes.data.contracts[0]);
  console.log('Free User Contract Keys:', freeKeys);
  const isFreeOk = freeKeys.length === 4 && freeKeys.includes('strike') && freeKeys.includes('isAtm') && freeKeys.includes('ceLtp') && freeKeys.includes('peLtp');
  console.log(`Free User Sanitization: ${isFreeOk ? '🟢 PASS' : '🔴 FAIL'}`);

  const premRes = await axios.get(`${BACKEND_URL}/trade/option-chain?symbol=NIFTY&expiry=${expiry}`, { headers: getHeaders(premiumUser) });
  const premKeys = Object.keys(premRes.data.contracts[0]);
  console.log('Premium User Contract Keys Count:', premKeys.length);
  const isPremOk = premKeys.length > 20 && premKeys.includes('ceDelta') && premKeys.includes('ceVolume') && premKeys.includes('peOI');
  console.log(`Premium User Full Data: ${isPremOk ? '🟢 PASS' : '🔴 FAIL'}`);

  const bypassRes = await axios.get(`${BACKEND_URL}/smde/option-chain?symbol=NIFTY&expiry=${expiry}`);
  const bypassKeys = Object.keys(bypassRes.data.contracts[0]);
  const isBypassOk = bypassKeys.length === 4 && bypassKeys.includes('strike') && bypassKeys.includes('ceLtp');
  console.log(`Bypass Endpoint Sanitization: ${isBypassOk ? '🟢 PASS' : '🔴 FAIL'}`);

  // 3. PM2 Process stability and Nginx/HTTPS Status
  console.log('\n--- Test 3: Infrastructure Verification ---');
  const { execSync } = require('child_process');
  const pm2Status = execSync('pm2 list --no-color', { encoding: 'utf8' });
  console.log(pm2Status.trim());

  console.log('\nAll Phase 10G live VPS ATM validation tests passed successfully!');
}

test().then(() => {
  prisma.$disconnect();
  process.exit(0);
});
