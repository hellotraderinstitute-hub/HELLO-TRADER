const fs = require('fs');
const path = require('path');

function backupDatabase() {
  const backendDir = __dirname;
  const backupsDir = path.join(backendDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbFile = path.join(backendDir, 'backend.db');
  const destFile = path.join(backupsDir, `backend_db_backup_${timestamp}.db`);

  if (fs.existsSync(dbFile)) {
    fs.copyFileSync(dbFile, destFile);
    console.log(`✅ DATABASE BACKUP SUCCESSFUL: ${destFile}`);
    return destFile;
  } else {
    console.log('⚠️ backend.db not found at', dbFile);
    return null;
  }
}

backupDatabase();
