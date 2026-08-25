const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'ui_branding_audit.json'), 'utf8');
const data = JSON.parse(content);

const byFile = {};
data.forEach(item => {
  if (!byFile[item.file]) byFile[item.file] = [];
  byFile[item.file].push(item);
});

console.log('====================================================');
console.log('      STUDENT UI BRANDING AUDIT REPORT             ');
console.log('====================================================\n');

Object.entries(byFile).forEach(([file, matches]) => {
  const isAdminFile = file.includes('AdminPortal') || file.includes('ProviderSettings') || file.includes('ApiStatusMonitor');
  console.log('----------------------------------------------------');
  console.log(`FILE: ${file} (${matches.length} matches) ${isAdminFile ? '[ADMIN ONLY — EXEMPT]' : '[STUDENT VISIBLE — REQUIRES BRANDING MASK]'}`);
  
  matches.forEach(m => {
    console.log(`  Line ${m.line} [${m.keyword}]: ${m.text}`);
  });
});
