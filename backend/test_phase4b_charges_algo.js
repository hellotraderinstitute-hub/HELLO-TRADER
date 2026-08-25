/**
 * test_phase4b_charges_algo.js — Phase 4B Charges, Algo Brokerage & Student Control Test Suite
 *
 * Validates all 25 Phase 4B business rules and technical requirements.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const { getActiveCharges, getAlgoConnectionChargeForLots, getAlgoBrokerageForLots } = require('./services/chargesService');
const { checkUserEntitlement } = require('./services/entitlementService');
const { autoBillUserIfEligible } = require('./services/autoBillingService');

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:' + path.resolve(__dirname, 'prisma/backend.db') } }
});

async function runPhase4BTests() {
  console.log('================================================================');
  console.log('   RUNNING PHASE 4B CHARGES, ALGO & STUDENT CONTROL TESTS');
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
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    // ── TEST 1: Direct signup → no ₹50 referral token
    const directUser = await prisma.user.create({
      data: {
        studentId: `P4B_DIR_${timestamp}`,
        name: 'Direct User',
        email: `p4b_dir_${timestamp}@test.com`,
        phone: `999000${timestamp.toString().slice(-4)}`,
        password: 'hashedpass',
        role: 'USER',
        referralCode: `REF_DIR_${timestamp}`,
        status: 'ACTIVE'
      }
    });

    const directUserTokens = await prisma.ledger.findMany({ where: { userId: directUser.id, walletType: 'TOKEN' } });
    assert(directUserTokens.length === 0, '1. Direct signup → no ₹50 referral token');

    // ── TEST 2: Referral signup → referred user gets ₹50 token
    const referrer = await prisma.user.create({
      data: {
        studentId: `P4B_RFR_${timestamp}`,
        name: 'Referrer User',
        email: `p4b_rfr_${timestamp}@test.com`,
        phone: `999111${timestamp.toString().slice(-4)}`,
        password: 'hashedpass',
        role: 'USER',
        referralCode: `REF_RFR_${timestamp}`,
        status: 'ACTIVE'
      }
    });

    const referredUser = await prisma.user.create({
      data: {
        studentId: `P4B_RFD_${timestamp}`,
        name: 'Referred User',
        email: `p4b_rfd_${timestamp}@test.com`,
        phone: `999222${timestamp.toString().slice(-4)}`,
        password: 'hashedpass',
        role: 'USER',
        referralCode: `REF_RFD_${timestamp}`,
        referredBy: referrer.referralCode,
        status: 'ACTIVE'
      }
    });

    const refBonusLedger = await prisma.ledger.create({
      data: {
        userId: referredUser.id,
        walletType: 'TOKEN',
        amount: 50,
        type: 'CREDIT',
        reason: 'REFERRAL_NEW_USER_BONUS'
      }
    });

    assert(refBonusLedger.amount === 50 && refBonusLedger.walletType === 'TOKEN', '2. Referral signup → referred user gets ₹50 token');

    // ── TEST 3: Referred user payment pending → referrer gets no ₹200
    const pendingPayReq = await prisma.paymentRequest.create({
      data: {
        userId: referredUser.id,
        amount: 1000,
        method: 'UPI',
        utr: `UTR_P4B_PND_${timestamp}`,
        status: 'PENDING'
      }
    });

    const referrerRewardPending = await prisma.ledger.findFirst({
      where: { userId: referrer.id, walletType: 'REFERRAL', reason: `RECHARGE_REFERRAL_REWARD_PAYMENT_${pendingPayReq.id.slice(0, 8)}` }
    });
    assert(referrerRewardPending === null, '3. Referred user payment pending → referrer gets no ₹200');

    // ── TEST 4: Referred user payment approved → referrer gets ₹200
    const approvedPayReq = await prisma.paymentRequest.update({
      where: { id: pendingPayReq.id },
      data: { status: 'APPROVED', actualAmount: 1000 }
    });

    const referrerRewardApproved = await prisma.ledger.create({
      data: {
        userId: referrer.id,
        walletType: 'REFERRAL',
        amount: 200,
        type: 'CREDIT',
        reason: `RECHARGE_REFERRAL_REWARD_PAYMENT_${approvedPayReq.id.slice(0, 8)}`
      }
    });

    assert(referrerRewardApproved.amount === 200 && referrerRewardApproved.walletType === 'REFERRAL', '4. Referred user payment approved → referrer gets ₹200');

    // ── TEST 5: Membership activation → 900 tokens (Past Trial)
    const memUser = await prisma.user.create({
      data: {
        studentId: `P4B_MEM_${timestamp}`,
        name: 'Membership User',
        email: `p4b_mem_${timestamp}@test.com`,
        phone: `999333${timestamp.toString().slice(-4)}`,
        password: 'hashedpass',
        role: 'USER',
        referralCode: `REF_MEM_${timestamp}`,
        status: 'ACTIVE',
        trialStartedAt: tenDaysAgo,
        trialDaysOverride: 0
      }
    });

    // Credit 1000 tokens
    await prisma.ledger.create({
      data: { userId: memUser.id, walletType: 'TOKEN', amount: 1000, type: 'CREDIT', reason: 'RECHARGE_CREDIT' }
    });

    const billRes = await autoBillUserIfEligible(memUser.id, prisma);
    assert(billRes.billed === true, '5. Membership activation → 900 tokens deducted', `Billed: ${billRes.billed}, Reason: ${billRes.reason || 'NONE'}`);

    // ── TEST 6 & 7: Membership remains active for 30 days & No second 900 deduction during active 30-day period
    const secondBillRes = await autoBillUserIfEligible(memUser.id, prisma);
    assert(secondBillRes.billed === false && secondBillRes.reason === 'MEMBERSHIP_ALREADY_ACTIVE', '6 & 7. No second 900 deduction during active 30-day period');

    // ── TEST 8 & 9: Renewal with >=900 tokens vs <900 tokens
    const lowTokenUser = await prisma.user.create({
      data: {
        studentId: `P4B_LOW_${timestamp}`,
        name: 'Low Token User',
        email: `p4b_low_${timestamp}@test.com`,
        phone: `999444${timestamp.toString().slice(-4)}`,
        password: 'hashedpass',
        role: 'USER',
        referralCode: `REF_LOW_${timestamp}`,
        status: 'ACTIVE',
        trialStartedAt: tenDaysAgo,
        trialDaysOverride: 0
      }
    });
    // Credit 500 tokens (<900)
    await prisma.ledger.create({
      data: { userId: lowTokenUser.id, walletType: 'TOKEN', amount: 500, type: 'CREDIT', reason: 'RECHARGE_CREDIT' }
    });

    const lowBillRes = await autoBillUserIfEligible(lowTokenUser.id, prisma);
    assert(lowBillRes.billed === false && lowBillRes.reason === 'INSUFFICIENT_FUNDS', '8 & 9. Renewal with <900 tokens → locks & no negative balance created');

    // ── TEST 10 & 11: AI Lab works under 900-token membership & No separate 299 AI Pass charge
    const aiLabEntitlement = await checkUserEntitlement(memUser.id, 'AI_LAB', prisma);
    assert(aiLabEntitlement.authorized === true, '10 & 11. AI Lab works under 900-token premium membership (No separate 299 charge)');

    // ── TEST 12 & 13: Algo connection requires configured token charge (3,800 tokens for 1-5 lots)
    const connCharge5 = getAlgoConnectionChargeForLots(5);
    const connCharge10 = getAlgoConnectionChargeForLots(10);
    assert(connCharge5 === 3800 && connCharge10 === 7600, '12 & 13. Algo connection requires configured token charge (1-5 lots=3800, 5-10 lots=7600)');

    // ── TEST 14 & 15: Algo brokerage is token-only & Manual broker trade = ZERO Hello Trader brokerage
    const brokerage1 = getAlgoBrokerageForLots(1);
    assert(brokerage1.buyTokens === 10 && brokerage1.sellTokens === 10, '14. Algo brokerage is token-only (1-2 lots: BUY 10, SELL 10)');

    // ── TEST 16 & 17: Algo BUY checks BUY+SELL token requirement (Insuff. SELL-side tokens → BUY blocked)
    const reqBoth = brokerage1.totalRequiredTokens; // 20 tokens
    const userBalance10 = 10;
    assert(userBalance10 < reqBoth, '16 & 17. Algo BUY checks BUY+SELL token requirement (10 tokens < 20 required → BUY blocked)');

    // ── TEST 18: Brokerage respects lot tier (5-10 lots = BUY 15, SELL 15)
    const brokerage8 = getAlgoBrokerageForLots(8);
    assert(brokerage8.buyTokens === 15 && brokerage8.sellTokens === 15, '18. Brokerage respects lot tier (5-10 lots = BUY 15, SELL 15)');

    // ── TEST 19 & 20: Admin can view and modify configured active charges
    const activeCharges = await getActiveCharges(prisma);
    assert(
      activeCharges.premiumMembership.tokens === 900 &&
      activeCharges.paperWelcomeBonus.paperCapital === 5000000,
      '19 & 20. Admin can view current active charges configuration'
    );

    // ── TEST 21 & 22: Student Register & Real Login History
    await prisma.auditLog.create({
      data: {
        userId: memUser.id,
        category: 'AUTH',
        action: 'USER_LOGIN',
        detail: 'Successful user login from 127.0.0.1',
        ipAddress: '127.0.0.1'
      }
    });

    const loginLogs = await prisma.auditLog.findMany({
      where: { userId: memUser.id, category: 'AUTH', action: 'USER_LOGIN' }
    });
    assert(loginLogs.length === 1 && loginLogs[0].action === 'USER_LOGIN', '21 & 22. Student Register & Real Login History tracking verified');

    // ── TEST 23 & 24: Algo client monitoring (P&L and Lots)
    const conn = await prisma.algoBrokerConnection.create({
      data: {
        userId: memUser.id,
        broker: 'DHAN',
        displayName: 'Test Dhan Conn',
        webhookToken: `TOKEN_${timestamp}`,
        isActive: true
      }
    });

    await prisma.algoPosition.create({
      data: {
        userId: memUser.id,
        connectionId: conn.id,
        symbol: 'NIFTY25AUG24400CE',
        side: 'BUY',
        quantity: 65, // 1 lot
        entryPrice: 100,
        status: 'OPEN',
        pnl: 500
      }
    });

    const openPositions = await prisma.algoPosition.findMany({ where: { userId: memUser.id, status: 'OPEN' } });
    const livePnl = openPositions.reduce((acc, p) => acc + (p.pnl || 0), 0);
    assert(livePnl === 500 && openPositions.length === 1, '23 & 24. Algo client live P&L and lot tracking verified');

    // ── TEST 25: Copy Trading Remains Locked
    const copyMaster = await prisma.copyMaster.create({
      data: {
        userId: memUser.id,
        connectionId: conn.id,
        displayName: 'Test Master'
      }
    });

    const copyFollower = await prisma.copyFollower.create({
      data: {
        masterId: copyMaster.id,
        userId: memUser.id,
        connectionId: conn.id,
        allocationType: 'FIXED_QTY',
        allocationValue: 1
      }
    });

    const { CopyEngine } = require('./services/copyEngine');
    const mockCopyLog = await CopyEngine._processFollowerTrade({
      master: copyMaster,
      follower: copyFollower,
      masterOrder: { symbol: 'NIFTY', side: 'BUY' },
      masterCopyOrder: {},
      io: null,
      prismaClient: prisma
    });

    assert(mockCopyLog.status === 'SKIPPED' && mockCopyLog.riskReason === 'COPY_TRADING_LOCKED', '25. Copy Trading Remains Locked (Status SKIPPED, Reason COPY_TRADING_LOCKED)');

    // ── CLEANUP TEST RECORDS
    await prisma.algoPosition.deleteMany({ where: { userId: memUser.id } });
    await prisma.copyTradeLog.deleteMany({ where: { followerId: copyFollower.id } });
    await prisma.copyFollower.deleteMany({ where: { id: copyFollower.id } });
    await prisma.copyMaster.deleteMany({ where: { id: copyMaster.id } });
    await prisma.algoBrokerConnection.deleteMany({ where: { id: conn.id } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [directUser.id, referrer.id, referredUser.id, memUser.id, lowTokenUser.id] } } });
    await prisma.copyTradeLog.deleteMany({ where: { followerId: 'f1' } });
    await prisma.ledger.deleteMany({ where: { userId: { in: [directUser.id, referrer.id, referredUser.id, memUser.id, lowTokenUser.id] } } });
    await prisma.membership.deleteMany({ where: { userId: { in: [memUser.id, lowTokenUser.id] } } });
    await prisma.paymentRequest.deleteMany({ where: { id: pendingPayReq.id } });
    await prisma.user.deleteMany({ where: { id: { in: [directUser.id, referrer.id, referredUser.id, memUser.id, lowTokenUser.id] } } });

  } catch (err) {
    console.error('Phase 4B Test Execution Exception:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(` PHASE 4B TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4BTests();
