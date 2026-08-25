const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'audit_results.json'), 'utf8');
const jsonStart = content.indexOf('[');
const data = JSON.parse(content.slice(jsonStart));

const byFile = {};
data.forEach(item => {
  if (!byFile[item.file]) byFile[item.file] = [];
  byFile[item.file].push(item);
});

console.log('====================================================');
console.log('        MOCK / DUMMY DATA AUDIT SUMMARY             ');
console.log('====================================================\n');
console.log(`Total Affected Files: ${Object.keys(byFile).length}`);
console.log(`Total Matches Found: ${data.length}\n`);

Object.entries(byFile).forEach(([file, matches]) => {
  console.log('----------------------------------------------------');
  console.log(`FILE: ${file} (${matches.length} matches)`);
  matches.forEach(m => {
    console.log(`  Line ${m.line} [Keyword: "${m.keyword}"]: ${m.text}`);
  });
});
