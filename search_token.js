const fs = require('fs');
const path = require('path');

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') {
        search(p);
      }
    } else if (f.endsWith('.js')) {
      const content = fs.readFileSync(p, 'utf8');
      if (content.includes('dhanAccessToken')) {
        console.log(`Found in: ${p}`);
      }
    }
  }
}
search('backend');
