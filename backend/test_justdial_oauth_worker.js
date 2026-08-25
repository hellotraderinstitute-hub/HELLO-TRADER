/**
 * ─────────────────────────────────────────────────────────────────────────────
 * test_justdial_oauth_worker.js — Test Suite for Gmail API OAuth 2.0 Worker
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const { parseJustdialEmail, isValidSender } = require('./services/justdialEmailParser');
const { processJustdialEmailPayload, getSyncStats } = require('./services/justdialCrmSyncService');
const { executeGmailOAuthPollCycle, getGmailOAuthWorkerStatus, stopJustdialGmailOAuthWorker } = require('./services/justdialGmailOAuthWorker');

console.log('───────────────────────────────────────────────────────────────');
console.log('  JUSTDIAL GMAIL API OAUTH 2.0 WORKER TEST SUITE');
console.log('───────────────────────────────────────────────────────────────\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASSED: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✕ FAILED: ${name}`);
    console.error(`    Error: ${err.message}`);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASSED: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✕ FAILED: ${name}`);
    console.error(`    Error: ${err.message}`);
    failCount++;
  }
}

async function runAllTests() {
  // Test 1: Sender validation
  runTest('Sender validation approves instantemail@justdial.com', () => {
    assert.strictEqual(isValidSender('instantemail@justdial.com'), true);
    assert.strictEqual(isValidSender('JustDial Alerts <instantemail@justdial.com>'), true);
    assert.strictEqual(isValidSender('spammer@external.com'), false);
  });

  // Test 2: Missing OAuth credentials returns MISSING_CREDENTIALS state safely
  await runAsyncTest('Missing OAuth credentials handled safely', async () => {
    const res = await executeGmailOAuthPollCycle();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason, 'GMAIL_OAUTH_CREDENTIALS_MISSING');
  });

  // Test 3: OAuth status metric response
  runTest('getGmailOAuthWorkerStatus returns valid status metrics', () => {
    const status = getGmailOAuthWorkerStatus();
    assert.ok(status.worker);
    assert.strictEqual(status.worker.mode, 'OAUTH2');
    assert.ok(typeof status.worker.unreadJustdialEmailCount === 'number');
  });

  // Test 4: Valid Justdial Lead email payload integration
  await runAsyncTest('OAuth worker processes valid raw email payload into CRM', async () => {
    const testId = `JD-OAUTH-${Date.now()}`;
    const testPhone = `9${String(Date.now()).slice(-9)}`;
    const rawEmail = {
      from: 'instantemail@justdial.com',
      subject: `Lead Alert - Ref ID: ${testId}`,
      text: `Name: OAuth User
Phone: ${testPhone}
City: Bangalore
Enquiry: Options Trading Course
Lead ID: ${testId}`,
      messageId: `msg-${testId}`
    };

    const res = await processJustdialEmailPayload(rawEmail);
    assert.strictEqual(res.success, true, `Process email failed: ${res.error || res.message}`);
    assert.strictEqual(res.status, 'IMPORTED');
  });

  // Test 5: Replay & Duplicate Lead Protection
  await runAsyncTest('OAuth worker prevents duplicate lead imports', async () => {
    const dupId = `JD-OAUTH-DUP-${Date.now()}`;
    const dupPhone = `9${String(Date.now()).slice(-9)}`;
    const rawEmail = {
      from: 'instantemail@justdial.com',
      subject: `Lead Alert - Ref ID: ${dupId}`,
      text: `Name: OAuth Duplicate User
Phone: ${dupPhone}
City: Bangalore
Enquiry: Options Trading Course
Lead ID: ${dupId}`,
      messageId: `msg-${dupId}`
    };

    // First insertion -> IMPORTED
    const res1 = await processJustdialEmailPayload(rawEmail);
    assert.strictEqual(res1.success, true);

    // Second insertion (Replay) -> DUPLICATE
    const res2 = await processJustdialEmailPayload(rawEmail);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.status, 'DUPLICATE');
  });

  // Test 6: Stop worker cleanly
  runTest('stopJustdialGmailOAuthWorker shuts down cleanly', () => {
    stopJustdialGmailOAuthWorker();
    const status = getGmailOAuthWorkerStatus();
    assert.strictEqual(status.worker.status, 'STOPPED');
  });

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  GMAIL OAUTH TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('───────────────────────────────────────────────────────────────\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests();
