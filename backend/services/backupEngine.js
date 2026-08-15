/**
 * backupEngine.js — Automated Database & Payment Configuration Backup Engine
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BACKUP_DIR = path.join(__dirname, '../backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getFormattedTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Take point-in-time snapshot copy of SQLite backend.db database
 */
async function createDatabaseBackup() {
  try {
    const dbPath = path.join(__dirname, '../prisma/backend.db');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}`);
    }

    const timestamp = getFormattedTimestamp();
    const backupFileName = `db_backup_${timestamp}.db`;
    const destPath = path.join(BACKUP_DIR, backupFileName);

    fs.copyFileSync(dbPath, destPath);
    const stats = fs.statSync(destPath);

    // Maintain rolling 15 database backups
    cleanOldBackups('db_backup_', 15);

    return {
      success: true,
      filename: backupFileName,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
      path: destPath,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[Backup Engine] Failed to create database backup:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Export standalone Payment Configuration JSON backup
 */
async function createPaymentConfigBackup(adminUser = 'System Auto') {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    const auditLogs = await prisma.paymentAuditLog.findMany({ orderBy: { timestamp: 'desc' } });

    const timestamp = getFormattedTimestamp();
    const backupFileName = `payment_config_${timestamp}.json`;
    const destPath = path.join(BACKUP_DIR, backupFileName);

    const payload = {
      backupType: 'PAYMENT_CONFIGURATION',
      version: 'v1.0',
      createdAt: new Date().toISOString(),
      createdBy: adminUser,
      settings: {
        upiEnabled: settings?.upiEnabled ?? true,
        upiId: settings?.upiId || '',
        upiHolderName: settings?.upiHolderName || '',
        qrEnabled: settings?.qrEnabled ?? true,
        qrImageUrl: settings?.qrImageUrl || '',
        bankEnabled: settings?.bankEnabled ?? true,
        bankName: settings?.bankName || '',
        bankAccountName: settings?.bankAccountName || '',
        bankAccountNumber: settings?.bankAccountNumber || '',
        bankIfsc: settings?.bankIfsc || '',
        bankBranch: settings?.bankBranch || ''
      },
      auditLogs
    };

    fs.writeFileSync(destPath, JSON.stringify(payload, null, 2), 'utf-8');
    const stats = fs.statSync(destPath);

    cleanOldBackups('payment_config_', 20);

    return {
      success: true,
      filename: backupFileName,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
      path: destPath,
      timestamp: payload.createdAt,
      payload
    };
  } catch (err) {
    console.error('[Backup Engine] Failed to create payment config backup:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * List all available database & payment config backups
 */
function listBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backups = files.map(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      const isDb = file.startsWith('db_backup_');
      const isConfig = file.startsWith('payment_config_');

      return {
        filename: file,
        type: isDb ? 'DATABASE_SQLITE' : isConfig ? 'PAYMENT_CONFIG_JSON' : 'OTHER',
        sizeBytes: stats.size,
        sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
        createdAt: stats.mtime
      };
    });

    return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    return [];
  }
}

/**
 * Restore payment settings from JSON payload
 */
async function restorePaymentConfig(payload, adminUser = { id: 'ADMIN-001', name: 'Admin' }) {
  try {
    if (!payload || !payload.settings) {
      throw new Error('Invalid payment configuration payload');
    }

    const currentSettings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });

    const newSettings = payload.settings;
    const fieldsToTrack = [
      'upiEnabled', 'upiId', 'upiHolderName',
      'qrEnabled', 'qrImageUrl',
      'bankEnabled', 'bankName', 'bankAccountName', 'bankAccountNumber', 'bankIfsc', 'bankBranch'
    ];

    const updates = {};
    const auditEntries = [];

    fieldsToTrack.forEach(field => {
      if (newSettings[field] !== undefined) {
        const oldVal = currentSettings[field] !== undefined ? String(currentSettings[field]) : '';
        const newVal = String(newSettings[field]);

        updates[field] = newSettings[field];
        if (oldVal !== newVal) {
          auditEntries.push({
            adminId: adminUser.id || 'ADMIN-001',
            adminName: adminUser.name || 'Admin',
            changedField: field,
            oldValue: oldVal,
            newValue: `RESTORED: ${newVal}`
          });
        }
      }
    });

    const updatedSettings = await prisma.systemSettings.update({
      where: { id: 'CONFIG' },
      data: updates
    });

    if (auditEntries.length > 0) {
      await prisma.paymentAuditLog.createMany({ data: auditEntries });
    }

    return {
      success: true,
      message: 'Payment configuration restored successfully from backup',
      settings: updatedSettings
    };
  } catch (err) {
    console.error('[Backup Engine] Failed to restore payment config:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Clean old rolling backups beyond maxLimit
 */
function cleanOldBackups(prefix, maxLimit) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(prefix))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxLimit) {
      const toDelete = files.slice(maxLimit);
      toDelete.forEach(f => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch (_) {}
      });
    }
  } catch (_) {}
}

module.exports = {
  createDatabaseBackup,
  createPaymentConfigBackup,
  listBackups,
  restorePaymentConfig,
  BACKUP_DIR
};
