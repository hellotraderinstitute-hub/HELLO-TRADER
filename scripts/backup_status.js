/**
 * scripts/backup_status.js
 * Inspects and reports the health of the Hello Trader backup system.
 */

'use strict';
const fs = require('fs');
const path = require('path');

const BACKUP_ROOT = '/var/backups/hello-trader';

function getBackupStatus() {
  const latestFile = path.join(BACKUP_ROOT, 'latest_backup.json');
  const hasLatest = fs.existsSync(latestFile);
  let latestManifest = null;

  if (hasLatest) {
    try {
      latestManifest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    } catch (_) {}
  }

  const getCategoryDetails = (category, limit) => {
    const p = path.join(BACKUP_ROOT, category);
    if (!fs.existsSync(p)) return { count: 0, limit, backups: [] };
    const entries = fs.readdirSync(p)
      .filter(f => f.startsWith('backup_') && fs.statSync(path.join(p, f)).isDirectory())
      .map(f => {
        const manifestPath = path.join(p, f, 'manifest.json');
        let m = null;
        if (fs.existsSync(manifestPath)) {
          try { m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}
        }
        return {
          id: f,
          createdAt: m?.createdAt || fs.statSync(path.join(p, f)).mtime.toISOString(),
          status: m?.verification?.status || 'UNKNOWN',
          dbSize: m?.database?.sizeBytes || 0,
          appSize: m?.archives?.appSourceBytes || 0
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      count: entries.length,
      limit,
      latest: entries[0] || null,
      oldest: entries[entries.length - 1] || null,
      backups: entries.slice(0, 3)
    };
  };

  const categories = {
    daily: getCategoryDetails('daily', 7),
    weekly: getCategoryDetails('weekly', 4),
    monthly: getCategoryDetails('monthly', 3),
    predeploy: getCategoryDetails('predeploy', 5)
  };

  const retentionCounts = {
    daily: categories.daily.count,
    weekly: categories.weekly.count,
    monthly: categories.monthly.count,
    predeploy: categories.predeploy.count
  };

  // Next scheduled backup calculation (Asia/Kolkata timezone aware)
  const now = new Date();
  const nextDaily = new Date();
  nextDaily.setUTCHours(21, 30, 0, 0); // 3:00 AM IST next
  if (nextDaily <= now) nextDaily.setUTCDate(nextDaily.getUTCDate() + 1);

  return {
    healthy: hasLatest && latestManifest?.verification?.status === 'VERIFIED_SUCCESS',
    lastBackup: latestManifest ? {
      backupId: latestManifest.backupId,
      type: latestManifest.type,
      createdAt: latestManifest.createdAt,
      gitCommit: latestManifest.git?.commit,
      gitBranch: latestManifest.git?.branch,
      dbSizeBytes: latestManifest.database?.sizeBytes,
      sqlDumpSizeBytes: latestManifest.database?.sqlDumpSizeBytes,
      appSizeBytes: latestManifest.archives?.appSourceBytes,
      verificationStatus: latestManifest.verification?.status,
      verifiedTableCounts: latestManifest.verification?.tableCounts,
      checksums: latestManifest.checksums
    } : null,
    retention: retentionCounts,
    categories,
    schedules: {
      daily: '0 3 * * * IST / 21:30 UTC daily (Keep 7)',
      weekly: 'Sunday 3:30 AM IST / Saturday 22:00 UTC (Keep 4)',
      monthly: '1st of Month 4:00 AM IST / 22:30 UTC (Keep 3)'
    },
    nextScheduledBackup: nextDaily.toISOString(),
    backupRoot: BACKUP_ROOT
  };
}

if (require.main === module) {
  const status = getBackupStatus();
  console.log('================================================================================');
  console.log('   HELLO TRADER BACKUP SYSTEM HEALTH & STATUS REPORT                           ');
  console.log('================================================================================');
  console.log('System Status          :', status.healthy ? 'HEALTHY & VERIFIED ✔' : 'NO BACKUP / ATTENTION NEEDED ✖');
  console.log('Last Successful Backup :', status.lastBackup?.createdAt || 'None');
  console.log('Backup ID              :', status.lastBackup?.backupId || 'None');
  console.log('Git Commit             :', status.lastBackup?.gitCommit || 'None');
  console.log('DB Snapshot Size       :', status.lastBackup?.dbSizeBytes ? (status.lastBackup.dbSizeBytes/1024).toFixed(2) + ' KB' : 'N/A');
  console.log('SQL Dump Size          :', status.lastBackup?.sqlDumpSizeBytes ? (status.lastBackup.sqlDumpSizeBytes/1024).toFixed(2) + ' KB' : 'N/A');
  console.log('App Archive Size       :', status.lastBackup?.appSizeBytes ? (status.lastBackup.appSizeBytes/1024/1024).toFixed(2) + ' MB' : 'N/A');
  console.log('Restore Test Status    :', status.lastBackup?.verificationStatus || 'N/A');
  console.log('Verified Table Counts  :', status.lastBackup?.verifiedTableCounts || {});
  console.log('Retention Stored       :', status.retention);
  console.log('Schedule               :', status.scheduleCron);
  console.log('Next Scheduled Run     :', status.nextScheduledBackup);
  console.log('================================================================================\n');
}

module.exports = { getBackupStatus };
