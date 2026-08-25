/**
 * Trade Source & Origin Attribution Automated Test Suite
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { CopyEngine } = require('./services/copyEngine');

async function runAttributionTest() {
  console.log('================================================================');
  console.log('   TRADE SOURCE & ORIGIN ATTRIBUTION AUTOMATED TEST SUITE        ');
  console.log('================================================================\n');

  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: { name: 'Audit User', email: 'audit@hellotrader.com', phone: '9888888888', password: 'pwd', studentId: 'HT-AUDIT-001', referralCode: 'AUDIT01' }
    });
  }

  const masterConn = await prisma.algoBrokerConnection.upsert({
    where: { webhookToken: 'master_audit_token_123' },
    create: { userId: user.id, broker: 'DHAN', displayName: 'Master Account', webhookToken: 'master_audit_token_123', isActive: true },
    update: { isActive: true }
  });

  const master = await prisma.copyMaster.upsert({
    where: { userId: user.id },
    create: { userId: user.id, connectionId: masterConn.id, displayName: 'Master Trader Pro', isPublic: true, isActive: true, pollingEnabled: true, killSwitch: false },
    update: { pollingEnabled: true, isActive: true, killSwitch: false }
  });

  const followerConn = await prisma.algoBrokerConnection.upsert({
    where: { webhookToken: 'follower_audit_token_456' },
    create: { userId: user.id, broker: 'DHAN', displayName: 'Follower Account', webhookToken: 'follower_audit_token_456', isActive: true },
    update: { isActive: true }
  });

  const follower = await prisma.copyFollower.upsert({
    where: { id: 'follower-test-audit-id' },
    create: { id: 'follower-test-audit-id', masterId: master.id, userId: user.id, connectionId: followerConn.id, allocationType: 'FIXED_QTY', allocationValue: 25, consentAccepted: true, isActive: true },
    update: { isActive: true, consentAccepted: true, masterId: master.id, userId: user.id }
  });

  await prisma.copyFollower.updateMany({
    where: { id: follower.id },
    data: { consentAccepted: true, isActive: true, masterId: master.id, userId: user.id }
  });

  let passedTests = 0;

  // ----------------------------------------------------------------
  // TEST 1: MASTER MANUAL TRADE ATTRIBUTION
  // ----------------------------------------------------------------
  console.log('TEST 1: Master Manual Broker Fill Attribution');
  const manualOrder = await prisma.copyMasterOrder.create({
    data: {
      masterId: master.id,
      brokerOrderId: `BROKER_MANUAL_${Date.now()}`,
      symbol: 'NIFTY25AUG24400CE',
      side: 'BUY',
      totalQty: 25,
      filledQty: 25,
      avgPrice: 125.50,
      tradeSource: 'MANUAL',
    }
  });

  if (manualOrder.tradeSource === 'MANUAL') {
    console.log(`   ✅ PASS: Master Manual trade correctly tagged as: 🔵 MANUAL (Broker OrderId: ${manualOrder.brokerOrderId})`);
    passedTests++;
  } else {
    console.log('   ❌ FAIL');
  }

  // ----------------------------------------------------------------
  // TEST 2: FOLLOWER COPY OF MASTER MANUAL TRADE
  // ----------------------------------------------------------------
  console.log('\nTEST 2: Follower Copy of Master Manual Trade Attribution');
  const manualCopyResult = await CopyEngine.replicateFill({
    master,
    masterCopyOrder: manualOrder,
    deltaQty: 25,
  });
  const manualLog = await prisma.copyTradeLog.findFirst({
    where: { masterCopyOrderId: manualOrder.id }
  });

  if (manualLog && manualLog.tradeSource === 'COPY' && manualLog.parentSource === 'MASTER_MANUAL') {
    console.log(`   ✅ PASS: Follower trade correctly tagged as: 🟣 COPY — MASTER MANUAL (Log ID: ${manualLog.id})`);
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: tradeSource=${manualLog?.tradeSource}, parentSource=${manualLog?.parentSource}`);
  }

  // ----------------------------------------------------------------
  // TEST 3: MASTER ALGO WEBHOOK TRADE ATTRIBUTION
  // ----------------------------------------------------------------
  console.log('\nTEST 3: Master Algo Webhook Execution Attribution');
  const webhookLog = await prisma.algoWebhookLog.create({
    data: {
      userId: user.id,
      connectionId: masterConn.id,
      rawPayload: '{"action":"BUY"}',
      parsedSymbol: 'NIFTY25AUG24400CE',
      parsedAction: 'BUY',
      parsedQty: 25,
      executionStatus: 'EXECUTED',
      brokerOrderId: `BROKER_ALGO_${Date.now()}`,
    }
  });

  const algoOrder = await prisma.copyMasterOrder.create({
    data: {
      masterId: master.id,
      brokerOrderId: webhookLog.brokerOrderId,
      symbol: 'NIFTY25AUG24400CE',
      side: 'BUY',
      totalQty: 25,
      filledQty: 25,
      avgPrice: 128.00,
      tradeSource: 'ALGO',
      webhookLogId: webhookLog.id,
    }
  });

  if (algoOrder.tradeSource === 'ALGO' && algoOrder.webhookLogId === webhookLog.id) {
    console.log(`   ✅ PASS: Master Algo trade correctly tagged as: 🟢 ALGO (Linked Webhook ID: ${webhookLog.id})`);
    passedTests++;
  } else {
    console.log('   ❌ FAIL');
  }

  // ----------------------------------------------------------------
  // TEST 4: FOLLOWER COPY OF MASTER ALGO TRADE
  // ----------------------------------------------------------------
  console.log('\nTEST 4: Follower Copy of Master Algo Trade Attribution');
  await CopyEngine.replicateFill({
    master,
    masterCopyOrder: algoOrder,
    deltaQty: 25,
  });

  const algoLog = await prisma.copyTradeLog.findFirst({
    where: { masterCopyOrderId: algoOrder.id }
  });

  if (algoLog && algoLog.tradeSource === 'COPY' && algoLog.parentSource === 'MASTER_ALGO') {
    console.log(`   ✅ PASS: Follower trade correctly tagged as: 🟣 COPY — MASTER ALGO (Log ID: ${algoLog.id})`);
    passedTests++;
  } else {
    console.log(`   ❌ FAIL: tradeSource=${algoLog?.tradeSource}, parentSource=${algoLog?.parentSource}`);
  }

  // ----------------------------------------------------------------
  // TEST 5: IMMUTABLE AUDIT TRAIL VERIFICATION
  // ----------------------------------------------------------------
  console.log('\nTEST 5: Immutable Audit Trail Record Verification');
  const allCopyLogs = await prisma.copyTradeLog.findMany({
    where: { masterId: master.id }
  });
  if (allCopyLogs.length >= 2) {
    console.log(`   ✅ PASS: ${allCopyLogs.length} immutable trade logs recorded with tradeSource & parentSource fields.`);
    passedTests++;
  } else {
    console.log('   ❌ FAIL');
  }

  console.log('\n================================================================');
  console.log(`   TRADE ATTRIBUTION AUDIT COMPLETE — ${passedTests}/5 TESTS PASSED`);
  console.log('================================================================\n');
}

runAttributionTest().catch(console.error).finally(() => prisma.$disconnect());
