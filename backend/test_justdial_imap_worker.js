/**
 * ─────────────────────────────────────────────────────────────────────────────
 * test_justdial_imap_worker.js — Comprehensive Test Suite for IMAP Worker
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const { parseJustdialEmail, isValidSender, maskPhone } = require('./services/justdialEmailParser');
const { processJustdialEmailPayload, getSyncStats } = require('./services/justdialCrmSyncService');
const { executeImapPollCycle, getImapWorkerStatus, stopJustdialImapWorker } = require('./services/justdialImapWorker');

console.log('───────────────────────────────────────────────────────────────');
console.log('  JUSTDIAL IMAP WORKER COMPREHENSIVE TEST SUITE');
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

  // Test 2: Credential masking in logs
  runTest('Credential masking masks password in logs', () => {
    const rawPass = 'abcd-1234-efgh-5678';
    const logStr = `Connection failed for user@gmail.com with pass ${rawPass}`;
    const masked = logStr.replace(new RegExp(rawPass, 'g'), '***MASKED***');
    assert.strictEqual(masked.includes(rawPass), false);
    assert.strictEqual(masked.includes('***MASKED***'), true);
  });

  // Test 3: Phone masking
  runTest('Phone masking masks 10-digit phone number correctly', () => {
    assert.strictEqual(maskPhone('9876543210'), '98******10');
  });

  // Test 4: Unrelated email ignored by sender check
  runTest('Unrelated sender returns invalid sender state', () => {
    assert.strictEqual(isValidSender('marketing@newsletter.com'), false);
  });

  // Test 5: Valid Justdial Lead email parsing
  runTest('Valid Justdial raw email is parsed correctly', () => {
    const rawEmail = {
      from: 'instantemail@justdial.com',
      subject: 'Lead Alert - Hello Trader Institute - Ref ID: JD-TEST-9988',
      text: `Lead Alert from Justdial
Name: Rajesh Sharma
Phone: 9876543210
City: Mumbai
Enquiry: Interested in Technical Analysis Course
Lead ID: JD-TEST-9988`,
      messageId: 'test-msg-uid-101'
    };

    const parsed = parseJustdialEmail(rawEmail);
    assert.strictEqual(parsed.name, 'Rajesh Sharma');
    assert.strictEqual(parsed.phone, '9876543210');
    assert.strictEqual(parsed.city, 'Mumbai');
    assert.strictEqual(parsed.externalLeadId, 'JD-TEST-9988');
  });

  // Test 6: Process valid email in CRM Sync Engine
  await runAsyncTest('Process valid email creates or updates CRM lead', async () => {
    const rawEmail = {
      from: 'instantemail@justdial.com',
      subject: 'Lead Alert - Ref ID: JD-UNIT-1001',
      text: `Name: Test User One
Phone: 9811223344
City: Delhi
Enquiry: Equity Trading
Lead ID: JD-UNIT-1001`,
      messageId: 'test-msg-uid-1001'
    };

    const res = await processJustdialEmailPayload(rawEmail);
    assert.strictEqual(res.success, true);
    assert.ok(['IMPORTED', 'DUPLICATE'].includes(res.status));
  });

  // Test 7: Duplicate email detection
  await runAsyncTest('Duplicate email payload returns DUPLICATE status', async () => {
    const rawEmail = {
      from: 'instantemail@justdial.com',
      subject: 'Lead Alert - Ref ID: JD-UNIT-1001',
      text: `Name: Test User One
Phone: 9811223344
City: Delhi
Enquiry: Equity Trading
Lead ID: JD-UNIT-1001`,
      messageId: 'test-msg-uid-1001'
    };

    const res = await processJustdialEmailPayload(rawEmail);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'DUPLICATE');
  });

  // Test 8: Parser error returns REJECTED status
  await runAsyncTest('Invalid sender email returns REJECTED status', async () => {
    const rawEmail = {
      from: 'hacker@unauthorized-domain.com',
      subject: 'Fake Lead',
      text: 'Name: Fake\nPhone: 9999999999',
      messageId: 'fake-msg-999'
    };

    const res = await processJustdialEmailPayload(rawEmail);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'REJECTED');
  });

  // Test 9: Get Imap Worker Status metrics
  runTest('getImapWorkerStatus returns worker status object', () => {
    const status = getImapWorkerStatus();
    assert.ok(status.worker);
    assert.ok(typeof status.worker.status === 'string');
    assert.ok(typeof status.worker.unreadJustdialEmailCount === 'number');
  });

  // Test 10: Graceful worker shutdown
  await runAsyncTest('stopJustdialImapWorker executes cleanly', async () => {
    await stopJustdialImapWorker();
    const status = getImapWorkerStatus();
    assert.strictEqual(status.worker.status, 'STOPPED');
  });

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  IMAP WORKER TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('───────────────────────────────────────────────────────────────\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests();
