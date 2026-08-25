const fs = require('fs');
const content = fs.readFileSync('/var/www/hello-trader/backend/routes/admin.js', 'utf8');
const idx = content.indexOf("router.post('/approve-signup'");
console.log(content.substring(idx + 2000, idx + 4000));
