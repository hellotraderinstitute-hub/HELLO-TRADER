const fs = require('fs');
const { spawn } = require('child_process');

const css = fs.readFileSync('src/app/globals.css', 'utf8');
console.log(`Piping src/app/globals.css (${css.length} bytes) to VPS...`);

const sshProc = spawn('ssh', [
  '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
  '-o', 'StrictHostKeyChecking=no',
  'root@103.212.121.207',
  'cat > /var/www/hello-trader/src/app/globals.css'
]);

sshProc.stdin.write(css);
sshProc.stdin.end();

sshProc.on('close', (code) => {
  console.log('GLOBALS_CSS_PIPE_CODE:', code);
});
