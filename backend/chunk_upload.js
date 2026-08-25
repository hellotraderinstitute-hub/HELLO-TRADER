const fs = require('fs');
const { execSync } = require('child_process');

const filePath = 'clean_next_build.tar.gz';
const chunkSize = 256 * 1024; // 256KB

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(filePath);
const totalChunks = Math.ceil(fileBuffer.length / chunkSize);

console.log(`Uploading ${filePath} (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) in ${totalChunks} chunks...`);

execSync(`ssh -i C:\\Users\\hello\\.ssh\\id_ed25519 -o StrictHostKeyChecking=no root@103.212.121.207 "rm -f /var/www/hello-trader/clean_next_build.tar.gz"`);

for (let i = 0; i < totalChunks; i++) {
  const start = i * chunkSize;
  const end = Math.min(start + chunkSize, fileBuffer.length);
  const chunkBuffer = fileBuffer.slice(start, end);
  const b64 = chunkBuffer.toString('base64');

  const sshCmd = `ssh -i C:\\Users\\hello\\.ssh\\id_ed25519 -o StrictHostKeyChecking=no root@103.212.121.207 "node -e \\"require('fs').appendFileSync('/var/www/hello-trader/clean_next_build.tar.gz', Buffer.from('${b64}', 'base64'))\\""`;
  execSync(sshCmd);
  if ((i + 1) % 10 === 0 || i + 1 === totalChunks) {
    console.log(`Chunk ${i + 1}/${totalChunks} uploaded (${Math.round((i+1)/totalChunks*100)}%).`);
  }
}

console.log('CHUNK_UPLOAD_COMPLETE');
