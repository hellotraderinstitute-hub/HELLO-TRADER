const fs = require('fs');
const { spawnSync } = require('child_process');

const files = [
  'src/components/InstallPwaModal.js',
  'src/components/LandingPage.js',
  'src/app/page.js',
  'src/components/Sidebar.js',
  'src/components/Dashboard.js'
];

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`Piping ${filePath} (${content.length} bytes) to VPS...`);

  spawnSync('ssh', [
    '-i', 'C:\\Users\\hello\\.ssh\\id_ed25519',
    '-o', 'StrictHostKeyChecking=no',
    'root@103.212.121.207',
    `cat > /var/www/hello-trader/${filePath}`
  ], { input: content });
});

console.log('PUBLIC_PWA_FILES_UPLOAD_COMPLETE');
