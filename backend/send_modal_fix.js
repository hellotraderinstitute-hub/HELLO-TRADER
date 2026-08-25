const fs = require('fs');
const { spawnSync } = require('child_process');

const filePath = 'src/components/InstallPwaModal.js';
const content = fs.readFileSync(filePath, 'utf8');
console.log(`Piping ${filePath} (${content.length} bytes) to VPS...`);

spawnSync('ssh', [
  '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
  '-o', 'StrictHostKeyChecking=no',
  'root@103.212.121.207',
  `cat > /var/www/hello-trader/${filePath}`
], { input: content });

console.log('MODAL_FIX_UPLOAD_COMPLETE');
