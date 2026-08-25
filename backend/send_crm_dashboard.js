const fs = require('fs');
const { spawn } = require('child_process');

const content = fs.readFileSync('src/components/CrmDashboard.js', 'utf8');
console.log(`Piping CrmDashboard.js (${content.length} bytes) to VPS...`);

const sshProc = spawn('ssh', [
  '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
  '-o', 'StrictHostKeyChecking=no',
  'root@103.212.121.207',
  'cat > /var/www/hello-trader/src/components/CrmDashboard.js'
]);

sshProc.stdin.write(content);
sshProc.stdin.end();

sshProc.on('close', (code) => {
  console.log('CRM_DASHBOARD_PIPE_CODE:', code);
});
