const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');

const prisma = new PrismaClient();

async function runAudit() {
  const results = {};
  
  // 1. Check DB Integrity
  try {
    const raw = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
    results.dbIntegrity = (raw && raw[0] && Object.values(raw[0])[0] === 'ok') ? 'PASS' : 'FAIL';
  } catch (e) {
    results.dbIntegrity = 'FAIL: ' + e.message;
  }

  // 2. Verify HT0802 status
  try {
    const user = await prisma.user.findFirst({
      where: { email: { contains: 'HT0802' } }
    });
    if (!user) {
      results.ht0802Status = 'PASS (Not found/pending)';
    } else {
      results.ht0802Status = `FOUND: role=${user.role}, status=${user.status}`;
    }
  } catch (e) {
    results.ht0802Status = 'ERROR: ' + e.message;
  }

  // 3. Verify SystemSettings config for Copy Trading, Welcome Bonus, and Cash Brokerage
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    results.copyTradingLocked = settings?.copyTradingLocked ?? true;
    results.welcomeBonusEnabled = settings?.welcomeBonusEnabled ?? false;
    results.cashBrokerageEnabled = settings?.cashBrokerageEnabled ?? false;
  } catch (e) {
    results.systemSettings = 'ERROR: ' + e.message;
  }

  // 4. Verify no dummy test users in production
  try {
    const testUsersCount = await prisma.user.count({
      where: { email: { in: ['test@hellotrader.com', 'test@test.com', 'demo@demo.com'] } }
    });
    results.testUsersCount = testUsersCount;
  } catch (e) {
    results.testUsersCount = 'ERROR: ' + e.message;
  }

  // 5. Check backups
  try {
    const backupsDir = '/var/www/hello-trader/backend/backups';
    const files = fs.readdirSync(backupsDir).filter(f => f.startsWith('backend_db_backup_') && f.endsWith('.db')).sort();
    results.backupCount = files.length;
    results.backups = files.map(f => {
      const p = path.join(backupsDir, f);
      const s = fs.statSync(p);
      const b = fs.readFileSync(p);
      const h = crypto.createHash('sha256').update(b).digest('hex');
      return { file: f, size: s.size, sha256: h };
    });
  } catch (e) {
    results.backups = 'ERROR: ' + e.message;
  }

  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

runAudit();
