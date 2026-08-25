const fs = require('fs');
const { spawnSync } = require('child_process');

const files = [
  'src/components/LandingPage.js',
  'src/app/page.js'
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

console.log('PAGE_FILES_UPLOAD_COMPLETE');
