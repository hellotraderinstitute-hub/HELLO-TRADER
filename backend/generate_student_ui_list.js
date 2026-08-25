const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui_branding_audit.json'), 'utf8'));

const studentVisibleFiles = {};

data.forEach(m => {
  if (m.file.includes('AdminPortal') || m.file.includes('ProviderSettings') || m.file.includes('ApiStatusMonitor')) return;
  const text = m.text;
  if (text.startsWith('import ') || text.startsWith('const {') || text.startsWith('function ') || text.startsWith('class ')) return;
  
  if (!studentVisibleFiles[m.file]) studentVisibleFiles[m.file] = [];
  studentVisibleFiles[m.file].push(m);
});

console.log('====================================================');
console.log('    STUDENT-FACING UI BRANDING REPLACEMENT LIST     ');
console.log('====================================================\n');

Object.entries(studentVisibleFiles).forEach(([file, matches]) => {
  console.log(`FILE: ${file} (${matches.length} UI text occurrences)`);
  matches.forEach(m => {
    console.log(`  Line ${m.line} [${m.keyword}]: ${m.text}`);
  });
  console.log('');
});
