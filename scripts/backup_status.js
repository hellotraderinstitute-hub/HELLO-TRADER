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

  const countBackups = (category) => {
    const p = path.join(BACKUP_ROOT, category);
    if (!fs.existsSync(p)) return 0;
    return fs.readdirSync(p).filter(f => f.startsWith('backup_')).length;
  };

  const retentionCounts = {
    daily: countBackups('daily'),
    weekly: countBackups('weekly'),
    monthly: countBackups('monthly'),
    predeploy: countBackups('predeploy')
  };

  // Next scheduled backup: 03:00 AM IST daily (21:30 UTC)
  const now = new Date();
  const nextScheduled = new Date();
  nextScheduled.setUTCHours(21, 30, 0, 0);
  if (nextScheduled <= now) {
    nextScheduled.setUTCDate(nextScheduled.getUTCDate() + 1);
  }

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
    nextScheduledBackup: nextScheduled.toISOString(),
    scheduleCron: '0 3 * * * (Asia/Kolkata daily 3:00 AM)',
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
