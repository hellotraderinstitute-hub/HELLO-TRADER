const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const routesDir = 'backend/routes';
const files = fs.readdirSync(routesDir);

files.forEach(file => {
  if (file.endsWith('.js')) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`Uploading ${file} (${content.length} bytes)...`);

    spawnSync('ssh', [
      '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
      '-o', 'StrictHostKeyChecking=no',
      'root@103.212.121.207',
      `cat > /var/www/hello-trader/backend/routes/${file}`
    ], { input: content });
  }
});

console.log('ROUTES_UPLOAD_COMPLETE');
