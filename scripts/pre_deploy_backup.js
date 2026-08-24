/**
 * scripts/pre_deploy_backup.js
 * Pre-deployment automatic safety backup hook.
 * Creates an ACID backup, verifies it, and only allows deployment if valid.
 */

'use strict';
const { runBackup } = require('./backup');

async function main() {
  console.log('[Pre-Deploy Hook] Creating pre-deployment safety snapshot...');
  try {
    const result = await runBackup({ type: 'predeploy' });
    if (!result.success) {
      throw new Error('Pre-deployment backup did not complete successfully.');
    }
    console.log(`[Pre-Deploy Hook] ✔ Safety snapshot confirmed at: ${result.targetBackupDir}`);
    process.exit(0);
  } catch (err) {
    console.error(`[Pre-Deploy Hook] ✖ DEPLOYMENT ABORTED: Pre-deployment backup failed: ${err.message}`);
    process.exit(1);
  }
}

main();
