const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');

const dbPath = "/var/www/hello-trader/backend/backend.db";
if (!fs.existsSync(dbPath)) {
  console.error("DB_NOT_FOUND");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = "/var/www/hello-trader/backend/backups";
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const destPath = path.join(backupDir, `backend_db_backup_phase10g_pre_${timestamp}.db`);
fs.copyFileSync(dbPath, destPath);

const stats = fs.statSync(destPath);
const fileBuffer = fs.readFileSync(destPath);
const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

// Verify integrity via Prisma running raw query
async function checkIntegrity() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${destPath}`
      }
    }
  });

  try {
    const res = await prisma.$queryRawUnsafe('PRAGMA integrity_check;');
    await prisma.$disconnect();
    const checkVal = res && res[0] ? Object.values(res[0])[0] : null;
    return {
      integrity: checkVal === 'ok' ? 'OK' : 'FAILED',
      raw: res
    };
  } catch (err) {
    return {
      integrity: 'ERROR',
      error: err.message
    };
  }
}

checkIntegrity().then((result) => {
  console.log(JSON.stringify({
    success: true,
    path: destPath,
    size: stats.size,
    sha256: hash,
    integrity: result.integrity,
    detail: result.raw || result.error
  }, null, 2));
  process.exit(0);
});
