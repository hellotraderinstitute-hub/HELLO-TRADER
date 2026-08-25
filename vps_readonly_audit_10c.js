const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('/var/www/hello-trader/node_modules/jsonwebtoken');
const axios = require('/var/www/hello-trader/backend/node_modules/axios');
const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');

const dotenv = require('/var/www/hello-trader/backend/node_modules/dotenv');
dotenv.config({ path: '/var/www/hello-trader/backend/.env' });

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';
const BACKEND_URL = 'http://localhost:4000/api';

const prisma = new PrismaClient();

async function runAudit() {
  const audit = {};
  console.log('=== PHASE 10C: VPS FINAL PRODUCTION REGRESSION & RELEASE AUDIT ===\n');

  // 1. Database Integrity
  try {
    const raw = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
    audit.dbIntegrity = (raw && raw[0] && Object.values(raw[0])[0] === 'ok') ? 'PASS' : 'FAIL';
  } catch (e) {
    audit.dbIntegrity = 'FAIL: ' + e.message;
  }

  // 2. Latest Backup Integrity
  try {
    const backupsDir = '/var/www/hello-trader/backend/backups';
    const files = fs.readdirSync(backupsDir).filter(f => f.startsWith('backend_db_backup_') && f.endsWith('.db')).sort();
    if (files.length > 0) {
      const latestFile = files[files.length - 1];
      const p = path.join(backupsDir, latestFile);
      const s = fs.statSync(p);
      const b = fs.readFileSync(p);
      const h = crypto.createHash('sha256').update(b).digest('hex');
      audit.latestBackup = {
        file: latestFile,
        size: s.size,
        sha256: h,
        status: s.size > 100000 ? 'PASS' : 'FAIL'
      };
    } else {
      audit.latestBackup = 'FAIL (No backups found)';
    }
  } catch (e) {
    audit.latestBackup = 'ERROR: ' + e.message;
  }

  // 3. HT0802 Status check
  try {
    const user = await prisma.user.findFirst({
      where: { email: { contains: 'HT0802' } }
    });
    if (!user) {
      audit.ht0802Status = 'PASS (Not found/pending)';
    } else {
      audit.ht0802Status = `FOUND: role=${user.role}, status=${user.status} (FAILED, should be pending)`;
    }
  } catch (e) {
    audit.ht0802Status = 'ERROR: ' + e.message;
  }

  // 4. System Settings (Copy Trading locked, Welcome Bonus disabled, Cash Brokerage disabled)
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    audit.systemSettings = {
      copyTradingLocked: settings?.copyTradingLocked === true ? 'PASS' : `FAIL (${settings?.copyTradingLocked})`,
      welcomeBonusEnabled: settings?.welcomeBonusEnabled === false ? 'PASS' : `FAIL (${settings?.welcomeBonusEnabled})`,
      cashBrokerageEnabled: settings?.cashBrokerageEnabled === false ? 'PASS' : `FAIL (${settings?.cashBrokerageEnabled})`,
    };
  } catch (e) {
    audit.systemSettings = 'ERROR: ' + e.message;
  }

  // 5. Entitlements E2E Option Chain Check
  try {
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
      return {
        'Cookie': `accessToken=${token}`,
        'Authorization': `Bearer ${token}`
      };
    };

    // Fetch expiries
    const expiriesRes = await axios.get(`${BACKEND_URL}/smde/option-chain/expiries?symbol=NIFTY`);
    const expiry = expiriesRes.data?.expiries?.[0];

    if (expiry) {
      const checkIsSanitized = (contracts) => {
        if (!contracts || contracts.length === 0) return { error: 'Empty contracts' };
        const keys = Object.keys(contracts[0]);
        const allowedKeys = ['strike', 'isAtm', 'ceLtp', 'peLtp'];
        const extraKeys = keys.filter(k => !allowedKeys.includes(k));
        const first = contracts[0];
        const formatOk = first.strike !== undefined && first.ceLtp !== undefined && first.peLtp !== undefined;
        return {
          isSanitized: extraKeys.length === 0 && formatOk,
          keys: keys
        };
      };

      if (freeUser) {
        try {
          const res = await axios.get(`${BACKEND_URL}/trade/option-chain?symbol=NIFTY&expiry=${expiry}`, { headers: getHeaders(freeUser) });
          audit.freeUserSanitization = checkIsSanitized(res.data.contracts).isSanitized ? 'PASS' : 'FAIL (Premium keys leaked)';
        } catch (err) {
          audit.freeUserSanitization = 'ERROR: ' + err.message;
        }
      }

      if (premiumUser) {
        try {
          const res = await axios.get(`${BACKEND_URL}/trade/option-chain?symbol=NIFTY&expiry=${expiry}`, { headers: getHeaders(premiumUser) });
          const chk = checkIsSanitized(res.data.contracts);
          audit.premiumUserFull = (!chk.isSanitized && chk.keys.includes('ceOI')) ? 'PASS' : 'FAIL (Premium keys missing)';
        } catch (err) {
          audit.premiumUserFull = 'ERROR: ' + err.message;
        }
      }

      // Bypass route check
      try {
        const res = await axios.get(`${BACKEND_URL}/smde/option-chain?symbol=NIFTY&expiry=${expiry}`);
        audit.smdeBypassCheck = checkIsSanitized(res.data.contracts).isSanitized ? 'PASS' : 'FAIL (Exposed premium keys)';
      } catch (err) {
        audit.smdeBypassCheck = 'ERROR: ' + err.message;
      }
    } else {
      audit.optionChainTests = 'SKIP (Expiries list empty)';
    }

  } catch (err) {
    audit.optionChainTests = 'ERROR: ' + err.message;
  }

  // 6. PM2 Process Status Check
  try {
    const { execSync } = require('child_process');
    const pm2Out = execSync('pm2 jlist', { encoding: 'utf8' });
    const pm2List = JSON.parse(pm2Out);
    audit.pm2Status = pm2List.map(proc => ({
      name: proc.name,
      status: proc.pm2_env.status,
      uptime: proc.pm2_env.pm_uptime,
      restarts: proc.pm2_env.restart_time,
      memory: proc.monit.memory
    }));
  } catch (e) {
    audit.pm2Status = 'ERROR: ' + e.message;
  }

  console.log(JSON.stringify(audit, null, 2));
  await prisma.$disconnect();
}

runAudit();
