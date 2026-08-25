const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const servicesDir = 'backend/services';
const files = fs.readdirSync(servicesDir);

files.forEach(file => {
  if (file.endsWith('.js')) {
    const filePath = path.join(servicesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`Uploading service ${file} (${content.length} bytes)...`);

    spawnSync('ssh', [
      '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
      '-o', 'StrictHostKeyChecking=no',
      'root@103.212.121.207',
      `mkdir -p /var/www/hello-trader/backend/services && cat > /var/www/hello-trader/backend/services/${file}`
    ], { input: content });
  }
});

console.log('SERVICES_UPLOAD_COMPLETE');
