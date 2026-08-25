const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const filesToUpload = [
  'backend/services/justdialGmailOAuthWorker.js',
  'backend/routes/crmJustdial.js',
  'backend/server.js',
  'backend/test_justdial_oauth_worker.js',
  'backend/package.json'
];

filesToUpload.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const dest = `/var/www/hello-trader/${filePath}`;
    console.log(`Uploading ${filePath} (${content.length} bytes)...`);

    spawnSync('ssh', [
      '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
      '-o', 'StrictHostKeyChecking=no',
      'root@103.212.121.207',
      `mkdir -p $(dirname ${dest}) && cat > ${dest}`
    ], { input: content });
  }
});

console.log('OAUTH_BACKEND_UPLOAD_COMPLETE');
