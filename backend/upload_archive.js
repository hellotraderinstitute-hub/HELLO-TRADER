const fs = require('fs');
const { spawnSync } = require('child_process');

const archivePath = 'clean_next_build_small.tar.gz';
const fileBuffer = fs.readFileSync(archivePath);

console.log(`Uploading ${archivePath} (${fileBuffer.length} bytes)...`);

const res = spawnSync('ssh', [
  '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
  '-o', 'StrictHostKeyChecking=no',
  'root@103.212.121.207',
  `cat > /var/www/hello-trader/clean_next_build_small.tar.gz`
], { input: fileBuffer, maxBuffer: 50 * 1024 * 1024 });

console.log('UPLOAD_FINISHED', res.status);
