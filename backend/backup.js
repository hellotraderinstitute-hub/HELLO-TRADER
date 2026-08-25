const fs = require('fs');
const path = require('path');

function runBackup() {
  console.log('====================================================');
  console.log('         HELLO TRADER AUTOMATED BACKUP ENGINE       ');
  console.log('====================================================\n');

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, 'backups', `backup_${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filesToBackup = [
    { src: path.join(__dirname, 'prisma', 'backend.db'), name: 'backend.db' },
    { src: path.join(__dirname, 'prisma', 'schema.prisma'), name: 'schema.prisma' },
    { src: path.join(__dirname, '.env'), name: '.env' },
    { src: path.join(__dirname, 'server.js'), name: 'server.js' },
  ];

  console.log(`[Backup] Creating backup folder: ${backupDir}`);

  let successCount = 0;
  filesToBackup.forEach(file => {
    if (fs.existsSync(file.src)) {
      const dest = path.join(backupDir, file.name);
      fs.copyFileSync(file.src, dest);
      const stats = fs.statSync(dest);
      console.log(`  ✓ Backed up ${file.name} (${(stats.size / 1024).toFixed(1)} KB)`);
      successCount++;
    } else {
      console.warn(`  ⚠ Warning: Source file ${file.src} not found`);
    }
  });

  // Create a metadata manifest file
  const manifest = {
    backupTimestamp: now.toISOString(),
    filesCount: successCount,
    version: '1.0.0-PROD',
    modules: ['CORE', 'ALGO_TRADING', 'COPY_TRADING', 'RISK_ENGINE', 'AUDIT_LOGS'],
  };

  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\n====================================================');
  console.log(`  BACKUP COMPLETE: ${successCount} files backed up.`);
  console.log(`  Location: ${backupDir}`);
  console.log('====================================================');
}

runBackup();
