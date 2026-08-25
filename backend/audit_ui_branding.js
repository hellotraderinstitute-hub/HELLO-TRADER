const fs = require('fs');
const path = require('path');

const TARGET_KEYWORDS = ['dhan', 'angel', 'upstox', 'yahoo', 'polygon', 'provider'];
const results = [];

function searchDirectory(dir) {
  if (dir.includes('node_modules') || dir.includes('.next') || dir.includes('.git') || dir.includes('backups')) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDirectory(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        TARGET_KEYWORDS.forEach(keyword => {
          if (line.toLowerCase().includes(keyword.toLowerCase())) {
            results.push({
              file: relativePath,
              line: index + 1,
              keyword,
              text: line.trim().slice(0, 120)
            });
          }
        });
      });
    }
  }
}

searchDirectory(path.join(__dirname, '..', 'src'));

fs.writeFileSync(path.join(__dirname, 'ui_branding_audit.json'), JSON.stringify(results, null, 2));
console.log(`UI_BRANDING_AUDIT_DONE: ${results.length} matches written to ui_branding_audit.json`);
