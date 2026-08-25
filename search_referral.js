const fs = require('fs');
const path = require('path');
function search(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') search(p);
    } else if (f.endsWith('.js')) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes("walletType: 'REFERRAL'") || c.includes('walletType: "REFERRAL"')) {
        console.log('Found REFERRAL walletType in:', p);
      }
    }
  });
}
search('.');
