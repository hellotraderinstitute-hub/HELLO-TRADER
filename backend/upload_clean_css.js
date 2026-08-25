const fs = require('fs');
const { execSync } = require('child_process');

const cssContent = fs.readFileSync('src/app/globals.css', 'utf8');
const b64 = Buffer.from(cssContent).toString('base64');

const sshCmd = `ssh -i C:\\Users\\hello\\.ssh\\id_ed25519 -o StrictHostKeyChecking=no root@103.212.121.207 "node -e \\"require('fs').writeFileSync('/var/www/hello-trader/src/app/globals.css', Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;

console.log('Uploading clean globals.css via Base64 Node execution...');
execSync(sshCmd, { stdio: 'inherit' });
console.log('UPLOAD_COMPLETE');
