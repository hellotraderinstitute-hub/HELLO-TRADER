/**
 * scripts/restore.js
 * Production Disaster Recovery & Restore Engine for Hello Trader.
 * 
 * Safety Rules:
 * - Requires explicit --CONFIRM-PRODUCTION-RESTORE flag
 * - Automatically creates a safety rollback snapshot before touching any live database
 * - Validates checksums before unpacking or restoring
 * - Verifies database integrity after restore
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const APP_DIR = '/var/www/hello-trader';
const BACKUP_ROOT = '/var/backups/hello-trader';
const DB_PATH = path.join(APP_DIR, 'backend/prisma/backend.db');

function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

function findBackupDir(specificPathOrId) {
  if (specificPathOrId) {
    if (fs.existsSync(specificPathOrId) && fs.statSync(specificPathOrId).isDirectory()) {
      return specificPathOrId;
    }
    // Search categories
    const categories = ['daily', 'weekly', 'monthly', 'predeploy'];
    for (const cat of categories) {
      const p = path.join(BACKUP_ROOT, cat, specificPathOrId);
      if (fs.existsSync(p)) return p;
    }
  }

  // Use latest_backup.json
  const latestFile = path.join(BACKUP_ROOT, 'latest_backup.json');
  if (fs.existsSync(latestFile)) {
    const latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    const cat = latest.type || 'daily';
    const p = path.join(BACKUP_ROOT, cat, latest.backupId);
    if (fs.existsSync(p)) return p;
  }

  throw new Error('No valid backup directory found to restore.');
}

async function runRestore(options = {}) {
  const isConfirmed = options.confirm === true || process.argv.includes('--CONFIRM-PRODUCTION-RESTORE');

  if (!isConfirmed) {
    console.error('================================================================================');
    console.error('✖ RESTORE ABORTED: Missing safety confirmation flag!');
    console.error('  To perform a production restore, you MUST specify:');
    console.error('  --CONFIRM-PRODUCTION-RESTORE');
    console.error('================================================================================');
    process.exit(1);
  }

  const backupDir = findBackupDir(options.backupDir);
  const manifestPath = path.join(backupDir, 'manifest.json');
  const checksumFilePath = path.join(backupDir, 'CHECKSUMS.sha256');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid backup: Missing manifest.json in ${backupDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  console.log('================================================================================');
  console.log('   HELLO TRADER PRODUCTION DISASTER RECOVERY & RESTORE ENGINE                  ');
  console.log('================================================================================');
  console.log(`Source Backup   : ${backupDir}`);
  console.log(`Backup Timestamp: ${manifest.createdAt}`);
  console.log(`Git Commit      : ${manifest.git?.commit}`);
  console.log(`Target DB       : ${DB_PATH}`);
  console.log('================================================================================\n');

  // ── Step 1: Verify Checksums of Backup Files ──
  console.log('Step 1: Verifying SHA-256 integrity of backup files...');
  if (fs.existsSync(checksumFilePath)) {
    const lines = fs.readFileSync(checksumFilePath, 'utf8').trim().split('\n');
    for (const l of lines) {
      const [expectedHash, filename] = l.split(/\s+/);
      const fp = path.join(backupDir, filename);
      if (fs.existsSync(fp)) {
        const actualHash = getSha256(fp);
        if (actualHash !== expectedHash) {
          throw new Error(`Checksum verification FAILED for ${filename}! Expected ${expectedHash}, got ${actualHash}`);
        }
      }
    }
    console.log('✔ All backup checksums verified successfully.');
  }

  // ── Step 2: Create Emergency Pre-Restore Rollback Checkpoint ──
  console.log('Step 2: Creating emergency rollback checkpoint of current live DB...');
  const rollbackDir = path.join(BACKUP_ROOT, 'emergency_rollback', `pre_restore_${Date.now()}`);
  fs.mkdirSync(rollbackDir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, path.join(rollbackDir, 'backend.db.pre_restore'));
    console.log(`✔ Rollback snapshot saved at: ${rollbackDir}`);
  }

  // ── Step 3: Restore Database ──
  console.log('Step 3: Restoring production database from backup...');
  const dbDumpSql = path.join(backupDir, 'database.sql');
  const dbRaw = path.join(backupDir, 'backend.db');

  if (fs.existsSync(dbRaw)) {
    // Overwrite the database with the verified clean snapshot
    fs.copyFileSync(dbRaw, DB_PATH);
    fs.chmodSync(DB_PATH, 0o666);
  } else if (fs.existsSync(dbDumpSql)) {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    execSync(`sqlite3 "${DB_PATH}" < "${dbDumpSql}"`);
    fs.chmodSync(DB_PATH, 0o666);
  } else {
    throw new Error('No database.sql or backend.db found in backup archive.');
  }

  // ── Step 4: Verify Restored Database Health ──
  console.log('Step 4: Verifying restored production database schema and table rows...');
  const verifyTable = (t) => {
    try {
      const out = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM \\"${t}\\";"`, { encoding: 'utf8' }).trim();
      return parseInt(out) || 0;
    } catch (_) {
      return -1;
    }
  };

  const userCount = verifyTable('User');
  const ledgerCount = verifyTable('Ledger');
  const algoPosCount = verifyTable('AlgoPosition');

  console.log(`✔ Restored database verified: User (${userCount}), Ledger (${ledgerCount}), AlgoPosition (${algoPosCount})`);

  if (userCount <= 0 || ledgerCount <= 0) {
    throw new Error('Post-restore validation failed: critical tables are empty!');
  }

  // ── Step 5: Restart Backend Service ──
  console.log('Step 5: Restarting PM2 backend service to apply restored state...');
  try {
    execSync('pm2 restart hello-trader-backend', { timeout: 15000 });
    console.log('✔ PM2 hello-trader-backend restarted successfully.');
  } catch (e) {
    console.warn('Warning: Could not restart PM2 service:', e.message);
  }

  console.log('\n================================================================================');
  console.log('✔ DISASTER RECOVERY RESTORE COMPLETED & VERIFIED SUCCESSFULLY');
  console.log('================================================================================\n');

  return { success: true, restoredFrom: backupDir };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let backupDir = null;
  for (const a of args) {
    if (a.startsWith('--backup=')) backupDir = a.split('=')[1];
  }

  runRestore({ backupDir }).catch(err => {
    console.error('✖ FATAL RESTORE ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = { runRestore };
