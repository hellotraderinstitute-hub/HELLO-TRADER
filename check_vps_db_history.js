const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const { execSync } = require('child_process');

async function check() {
  console.log('=== CHECKING BACKUP DB FROM AUG 11 ===');
  // Copy backup to temp and run prisma query or direct sqlite3 query
  execSync('cp /var/www/hello-trader/backend/backups/db_backup_20260811_175820.db /tmp/temp_history.db');
  
  // Use sqlite3 command to inspect temp_history.db
  const outputReferrals = execSync('sqlite3 /tmp/temp_history.db "SELECT * FROM Referral;"').toString();
  console.log('Referrals in backup:');
  console.log(outputReferrals);

  const outputLedger = execSync('sqlite3 /tmp/temp_history.db "SELECT * FROM Ledger WHERE reason LIKE \'%nitu%\';"').toString();
  console.log('Ledger entries containing nitu in backup:');
  console.log(outputLedger);
}

check().catch(console.error);
