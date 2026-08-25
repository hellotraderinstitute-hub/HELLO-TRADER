/**
 * test_production_readiness.js — Production Infrastructure Verification Suite
 */

const { encryptCredential, decryptCredential } = require('./services/crypto');
const http = require('http');

async function runProductionTestSuite() {
  console.log('================================================================');
  console.log('   HELLO TRADER PRODUCTION READINESS AUDIT TEST SUITE          ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, detail = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ PASS: ${testName} ${detail ? '(' + detail + ')' : ''}`);
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? '(' + detail + ')' : ''}`);
    }
  }

  // TEST 1: AES-256-GCM Credential Encryption
  const rawToken = 'dhan_access_token_secret_12345';
  const encrypted = encryptCredential(rawToken);
  assert(encrypted && encrypted.startsWith('enc:v1:'), 'AES-256-GCM Credential Encryption', `Format: ${encrypted.slice(0, 20)}...`);

  // TEST 2: AES-256-GCM Credential Decryption
  const decrypted = decryptCredential(encrypted);
  assert(decrypted === rawToken, 'AES-256-GCM Credential Decryption', `Decrypted matches raw token`);

  // TEST 3: Legacy Plaintext Backward Compatibility
  const legacyToken = 'legacy_plaintext_token';
  const legacyDecrypted = decryptCredential(legacyToken);
  assert(legacyDecrypted === legacyToken, 'Legacy Plaintext Backward Compatibility');

  // TEST 4: Health Endpoint Check
  const healthResult = await new Promise((resolve) => {
    http.get('http://localhost:4000/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(res.statusCode === 200 && json.status === 'ok');
        } catch { resolve(false); }
      });
    }).on('error', () => resolve(false));
  });
  assert(healthResult, 'Server /api/health HTTP 200 OK');

  console.log('\n================================================================');
  console.log(`   TEST SUITE SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');
}

if (require.main === module) {
  runProductionTestSuite();
}

module.exports = { runProductionTestSuite };
