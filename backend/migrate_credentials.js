/**
 * migrate_credentials.js
 * Safe Database Credential Migration Script
 *
 * Scans existing AlgoBrokerConnection and SystemSettings rows.
 * Encrypts any plain text tokens/secrets with AES-256-GCM without altering data.
 */

const { PrismaClient } = require('@prisma/client');
const { encryptCredential } = require('./services/crypto');
const prisma = new PrismaClient();

async function runCredentialMigration() {
  console.log('[Migration] Starting broker credential encryption audit & migration...');

  try {
    // 1. AlgoBrokerConnections
    const connections = await prisma.algoBrokerConnection.findMany();
    let migratedCount = 0;

    for (const conn of connections) {
      const updates = {};
      const fields = ['apiKey', 'apiSecret', 'accessToken', 'totpSecret', 'vendorCode', 'refreshToken'];

      for (const field of fields) {
        const val = conn[field];
        if (val && !val.startsWith('enc:v1:')) {
          updates[field] = encryptCredential(val);
        }
      }

      if (Object.keys(updates).length > 0) {
        await prisma.algoBrokerConnection.update({
          where: { id: conn.id },
          data: updates,
        });
        migratedCount++;
      }
    }

    console.log(`[Migration] Successfully encrypted credentials for ${migratedCount} broker connections.`);

    // 2. SystemSettings Dhan Streamer Keys
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (settings && settings.dhanAccessToken && !settings.dhanAccessToken.startsWith('enc:v1:')) {
      await prisma.systemSettings.update({
        where: { id: 'CONFIG' },
        data: { dhanAccessToken: encryptCredential(settings.dhanAccessToken) }
      });
      console.log('[Migration] Encrypted SystemSettings Dhan access token.');
    }

    console.log('[Migration] Credential encryption migration completed safely.');
  } catch (err) {
    console.error('[Migration] Migration error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runCredentialMigration();
}

module.exports = { runCredentialMigration };
