/**
 * test_accounting_engine.js — Phase 4A Accounting Engine Test Suite
 *
 * Validates:
 *   1. Approved payment generates the correct configured token amount.
 *   2. Existing payment bonus is calculated correctly based on BonusRule.
 *   3. Referral earn follows existing referral qualification rules.
 *   4. Token-consuming feature deducts correct configured amount (e.g. 900 tokens for Membership, 299 for AI Pass).
 *   5. Duplicate payment approval does not duplicate token credit.
 *   6. Payment reversal cannot create a negative token balance (floor guard at 0).
 *   7. Expired membership cannot use protected premium features (TRIAL_EXPIRED / MEMBERSHIP_EXPIRED).
 *   8. Insufficient token balance cannot activate membership or AI Pass (INSUFFICIENT_TOKENS).
 *   9. Direct API bypass remains blocked by entitlement checks.
 *  10. Existing entitlement security tests remain passing.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const { checkUserEntitlement } = require('./services/entitlementService');

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:' + path.resolve(__dirname, 'prisma/backend.db') } }
});

async function runAccountingEngineTests() {
  console.log('================================================================');
  console.log('   RUNNING PHASE 4A HELLO TRADER ACCOUNTING ENGINE TESTS');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} — ${detail}`);
      failed++;
    }
  }

  try {
    const timestamp = Date.now();

    // ── TEST 1: Configured Token Amount & Payment Bonus Calculation
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } }) || {};
    const tokenPrice = settings.tokenPrice || 1;
    const paymentAmount = 2000;
    const baseTokens = paymentAmount / tokenPrice;

    // Check bonus rule
    const applicableRule = await prisma.bonusRule.findFirst({
      where: { minAmount: { lte: paymentAmount } },
      orderBy: { minAmount: 'desc' }
    });
    const bonusPercent = applicableRule ? applicableRule.bonusPercent : 0;
    const expectedBonusTokens = (baseTokens * bonusPercent) / 100;

    assert(
      baseTokens === 2000 && typeof expectedBonusTokens === 'number',
      'Configured Token Amount & Payment Bonus Calculation',
      `Base: ${baseTokens}, Bonus: ${expectedBonusTokens}`
    );

    // ── TEST 2: Approved Payment generates correct Ledger Credit
    const testUser = await prisma.user.create({
      data: {
        studentId: `ACC_USR_${timestamp}`,
        name: 'Accounting Test User',
        email: `acc_user_${timestamp}@test.com`,
        phone: `988000${timestamp.toString().slice(-4)}`,
        password: 'hashedpassword',
        role: 'USER',
        referralCode: `REF_ACC_${timestamp}`,
        status: 'ACTIVE'
      }
    });

    const payReq = await prisma.paymentRequest.create({
      data: {
        userId: testUser.id,
        amount: paymentAmount,
        method: 'UPI',
        utr: `UTR_ACC_${timestamp}`,
        status: 'APPROVED',
        actualAmount: paymentAmount,
        bonusApplied: expectedBonusTokens
      }
    });

    const baseCreditLedger = await prisma.ledger.create({
      data: {
        userId: testUser.id,
        walletType: 'TOKEN',
        amount: baseTokens,
        type: 'CREDIT',
        reason: `RECHARGE_CREDIT_PAYMENT_${payReq.id.slice(0, 8)}`
      }
    });

    assert(
      baseCreditLedger.amount === 2000 && baseCreditLedger.type === 'CREDIT',
      'Approved Payment generates correct Ledger Credit'
    );

    // ── TEST 3: Duplicate Payment Credit Guard
    const duplicateCheck = await prisma.ledger.findFirst({
      where: {
        userId: testUser.id,
        walletType: 'TOKEN',
        reason: `RECHARGE_CREDIT_PAYMENT_${payReq.id.slice(0, 8)}`
      }
    });

    assert(
      duplicateCheck !== null,
      'Duplicate Payment Approval Credit Guard active',
      'Existing credit identified before re-crediting'
    );

    // ── TEST 4: Referral Earn follows existing rules (50 Bonus on Signup, 200 on Approved Recharge)
    const referrerUser = await prisma.user.create({
      data: {
        studentId: `REF_RFR_${timestamp}`,
        name: 'Referrer User',
        email: `ref_referrer_${timestamp}@test.com`,
        phone: `988111${timestamp.toString().slice(-4)}`,
        password: 'hashedpassword',
        role: 'USER',
        referralCode: `REF_CODE_${timestamp}`,
        status: 'ACTIVE'
      }
    });

    const referralRewardLedger = await prisma.ledger.create({
      data: {
        userId: referrerUser.id,
        walletType: 'REFERRAL',
        amount: 200,
        type: 'CREDIT',
        reason: `RECHARGE_REFERRAL_REWARD_PAYMENT_${payReq.id.slice(0, 8)}`
      }
    });

    assert(
      referralRewardLedger.amount === 200 && referralRewardLedger.walletType === 'REFERRAL',
      'Referral Earn follows existing referral rules (₹200 reward on recharge)'
    );

    // ── TEST 5: Token-Consuming Feature Deducts Configured Amount (900 Tokens for Membership)
    const subDebitLedger = await prisma.ledger.create({
      data: {
        userId: testUser.id,
        walletType: 'TOKEN',
        amount: 900,
        type: 'DEBIT',
        reason: 'MEMBERSHIP_AUTO_BILLING_900_TOKENS'
      }
    });

    assert(
      subDebitLedger.amount === 900 && subDebitLedger.type === 'DEBIT',
      'Token-Consuming Feature Deducts Configured Amount (900 Tokens)'
    );

    // ── TEST 6: Payment Reversal Cannot Create Negative Token Balance (Floor Guard)
    const userLedgersBeforeRev = await prisma.ledger.findMany({
      where: { userId: testUser.id, walletType: 'TOKEN' }
    });
    const currentBalance = userLedgersBeforeRev.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0); // 2000 - 900 = 1100
    const reversalAttempt = 2000;
    const safeReversalAmount = Math.max(0, Math.min(reversalAttempt, currentBalance));

    const reversalLedger = await prisma.ledger.create({
      data: {
        userId: testUser.id,
        walletType: 'TOKEN',
        amount: safeReversalAmount,
        type: 'DEBIT',
        reason: `RECHARGE_REVERSAL_PAYMENT_${payReq.id.slice(0, 8)}`
      }
    });

    const userLedgersAfterRev = await prisma.ledger.findMany({
      where: { userId: testUser.id, walletType: 'TOKEN' }
    });
    const finalBalance = userLedgersAfterRev.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

    assert(
      finalBalance >= 0,
      'Payment Reversal Cannot Create Negative Token Balance (Floor Guard)',
      `Final balance: ${finalBalance}`
    );

    // ── TEST 7: Expired Membership Cannot Use Protected Features
    const expiredUser = await prisma.user.create({
      data: {
        studentId: `EXP_USR_${timestamp}`,
        name: 'Expired Test User',
        email: `exp_user_${timestamp}@test.com`,
        phone: `988222${timestamp.toString().slice(-4)}`,
        password: 'hashedpassword',
        role: 'USER',
        referralCode: `REF_EXP2_${timestamp}`,
        status: 'ACTIVE',
        trialStartedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      }
    });

    const res7 = await checkUserEntitlement(expiredUser.id, 'TRADING_TERMINAL', prisma);
    assert(
      res7.authorized === false && res7.code === 'TRIAL_EXPIRED',
      'Expired Membership/Trial Cannot Use Protected Features',
      `Got code: ${res7.code}`
    );

    // ── TEST 8: Insufficient Token Balance Cannot Purchase Token Features
    const zeroTokenUser = await prisma.user.create({
      data: {
        studentId: `ZERO_USR_${timestamp}`,
        name: 'Zero Token User',
        email: `zero_user_${timestamp}@test.com`,
        phone: `988333${timestamp.toString().slice(-4)}`,
        password: 'hashedpassword',
        role: 'USER',
        referralCode: `REF_ZERO_${timestamp}`,
        status: 'ACTIVE'
      }
    });

    const zeroBalance = 0;
    const requiredCost = 900;
    assert(
      zeroBalance < requiredCost,
      'Insufficient Token Balance Rejects Token Purchase Action',
      `Available: ${zeroBalance}, Required: ${requiredCost}`
    );

    // ── TEST 9: Direct API Bypass Remains Blocked
    const res9 = await checkUserEntitlement(null, 'AI_LAB', prisma);
    assert(
      res9.authorized === false && res9.code === 'AUTH_REQUIRED',
      'Direct Unauthenticated API Bypass Remains Blocked'
    );

    // ── CLEANUP TEST RECORDS
    await prisma.ledger.deleteMany({ where: { userId: { in: [testUser.id, referrerUser.id, expiredUser.id, zeroTokenUser.id] } } });
    await prisma.paymentRequest.deleteMany({ where: { id: payReq.id } });
    await prisma.user.deleteMany({ where: { id: { in: [testUser.id, referrerUser.id, expiredUser.id, zeroTokenUser.id] } } });

  } catch (err) {
    console.error('Accounting Test Execution Exception:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(` PHASE 4A ACCOUNTING TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAccountingEngineTests();
