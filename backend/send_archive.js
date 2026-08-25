const fs = require('fs');
const { spawn } = require('child_process');

const archivePath = 'clean_next_build_small.tar.gz';
if (!fs.existsSync(archivePath)) {
  console.error('File not found:', archivePath);
  process.exit(1);
}

const stats = fs.statSync(archivePath);
console.log(`Piping ${archivePath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB) to VPS...`);

const sshProc = spawn('ssh', [
  '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
  '-o', 'StrictHostKeyChecking=no',
  'root@103.212.121.207',
  'cat > /var/www/hello-trader/clean_next_build_small.tar.gz'
]);

const readStream = fs.createReadStream(archivePath);
readStream.pipe(sshProc.stdin);

sshProc.on('close', (code) => {
  if (code === 0) {
    console.log('ARCHIVE_PIPE_SUCCESS');
  } else {
    console.error('ARCHIVE_PIPE_FAILED with code:', code);
  }
});
