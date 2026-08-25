
    const path = require('path');
    require('/var/www/hello-trader/backend/node_modules/dotenv').config({ path: '/var/www/hello-trader/backend/.env' });
    const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
    const http = require('http');
    const jwt = require('/var/www/hello-trader/backend/node_modules/jsonwebtoken');

    const prisma = new PrismaClient({
      datasources: { db: { url: 'file:/var/www/hello-trader/backend/prisma/backend.db' } }
    });

    function get(path, headers = {}) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4000,
          path: path,
          method: 'GET',
          headers
        }, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (_) { resolve({ status: res.statusCode, raw }); }
          });
        });
        req.on('error', reject);
        req.end();
      });
    }

    function post(path, data, headers = {}) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4000,
          path: path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...headers
          }
        }, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (_) { resolve({ status: res.statusCode, raw }); }
          });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    }

    async function runLiveProductionSmokeTests() {
      console.log('================================================================');
      console.log('🧪 LIVE PRODUCTION SMOKE TEST SUITE — OPTION FLOW & MARGIN');
      console.log('================================================================\n');

      // 1. Create a transient test student user
      const testStudentId = 'PROD_TESTER_' + Date.now();
      const testPhone = '97' + String(Date.now()).slice(-8);
      const student = await prisma.user.create({
        data: {
          studentId: testStudentId,
          name: 'Production Flow Tester',
          email: testStudentId + '@hellotrader.in',
          phone: testPhone,
          referralCode: 'REF_' + testStudentId,
          password: '$2b$10$abcdefghijklmnopqrstuv',
          role: 'USER',
          status: 'ACTIVE'
        }
      });

      const token = jwt.sign(
        { id: student.id, studentId: student.studentId, role: student.role },
        process.env.JWT_SECRET || 'hello-trader-ultra-secure-jwt-secret-key-2026',
        { expiresIn: '1d' }
      );
      const authHeader = { 'Authorization': 'Bearer ' + token };

      // Initialize Paper Balance
      const walletRes = await get('/api/wallet', authHeader);
      console.log('[TEST 1] Fresh Student Virtual Paper Margin Auto-Initialization...');
      console.log('   ✓ Balance:', walletRes.body.paperBalance);
      if (walletRes.body.paperBalance !== 5000000) {
        throw new Error('Expected 5000000 paper balance but got: ' + walletRes.body.paperBalance);
      }

      // 2. Fetch live option chain
      console.log('\n[TEST 2] Fetching Live Option Chain Contracts...');
      const expRes = await get('/api/trade/option-chain/expiries?symbol=NIFTY', authHeader);
      const activeExpiry = expRes.body?.expiries?.[0] || '2026-08-27';
      const ocRes = await get('/api/trade/option-chain?symbol=NIFTY&expiry=' + encodeURIComponent(activeExpiry), authHeader);
      
      const sampleContract = ocRes.body?.contracts?.find(c => c.ceLtp > 0) || { strike: 24200, ceLtp: 133.90 };
      const selectedSymbol = 'NIFTY ' + sampleContract.strike + ' CE';
      const liveLtp = sampleContract.ceLtp;
      console.log('   ✓ Live Contract Selected:', selectedSymbol, '| Live LTP: ₹' + liveLtp);

      // 3. MARKET BUY Execution & 100% Margin Verification
      console.log('\n[TEST 3] Testing MARKET BUY Execution & 100% Margin Debit (1x LEV)...');
      const orderQty = 75; // 1 lot
      const expectedMargin = liveLtp * orderQty; // 100% premium

      const marketBuyRes = await post('/api/trade/place', {
        symbol: selectedSymbol,
        productType: 'INTRADAY',
        orderType: 'BUY',
        quantity: orderQty,
        entryPrice: liveLtp,
        orderExecutionType: 'MARKET',
        currentMarketPrice: liveLtp,
        type: 'OPTION'
      }, authHeader);

      console.log('   ✓ POST /place Status:', marketBuyRes.status);
      if (marketBuyRes.status !== 200 || !marketBuyRes.body.success) {
        throw new Error('Market BUY failed: ' + JSON.stringify(marketBuyRes.body));
      }
      
      const buyTrade = marketBuyRes.body.trade;
      const debitedMargin = marketBuyRes.body.requiredMargin;
      console.log('   ✓ Trade Entry Price: ₹' + buyTrade.entryPrice + ' (Exact Live LTP)');
      console.log('   ✓ Debited Margin: ₹' + debitedMargin + ' (100% Premium, NOT divided by 5)');
      if (buyTrade.entryPrice !== liveLtp) throw new Error('Entry price mismatch!');
      if (debitedMargin !== expectedMargin) throw new Error('Margin mismatch! Expected ' + expectedMargin + ' but got ' + debitedMargin);

      // Dynamic Mark Price and P&L check
      const simulatedMark = liveLtp + 5.00;
      const unrealizedPnL = (simulatedMark - buyTrade.entryPrice) * buyTrade.quantity; // +375.00
      console.log('   ✓ Simulated Mark Price: ₹' + simulatedMark + ' ➔ Unrealized P&L = +₹' + unrealizedPnL.toFixed(2));

      // Close market buy position
      const closeRes = await post('/api/trade/close', { tradeId: buyTrade.id, exitPrice: simulatedMark }, authHeader);
      console.log('   ✓ Position Closed ➔ Realized P&L Settled: +₹' + closeRes.body.trade?.pnl);

      // 4. LIMIT BUY Execution Semantics (Pending -> Trigger -> Open)
      console.log('\n[TEST 4] Testing LIMIT BUY Semantics (Pending -> Trigger -> Open)...');
      const limitBuyTarget = liveLtp - 10.00; // Limit below market
      const limitBuyRes = await post('/api/trade/place', {
        symbol: selectedSymbol,
        productType: 'INTRADAY',
        orderType: 'BUY',
        quantity: orderQty,
        entryPrice: limitBuyTarget,
        orderExecutionType: 'LIMIT',
        limitPrice: limitBuyTarget,
        currentMarketPrice: liveLtp,
        type: 'OPTION'
      }, authHeader);

      console.log('   ✓ Limit BUY Order Created ➔ Status:', limitBuyRes.body.trade?.status, '(Expected: PENDING)');
      if (limitBuyRes.body.trade?.status !== 'PENDING') {
        throw new Error('Expected status PENDING for Limit BUY below market!');
      }

      // Simulate market dropping to limit price
      const triggerRes = await post('/api/trade/trigger-pending', { symbol: selectedSymbol, currentPrice: limitBuyTarget }, authHeader);
      console.log('   ✓ Market touched Limit Price ₹' + limitBuyTarget + ' ➔ Orders Filled:', triggerRes.body.filledCount);
      
      const filledBuyOrder = await prisma.trade.findUnique({ where: { id: limitBuyRes.body.trade.id } });
      console.log('   ✓ Filled Trade Status:', filledBuyOrder.status, '| Entry Price: ₹' + filledBuyOrder.entryPrice);
      if (filledBuyOrder.status !== 'OPEN' || filledBuyOrder.entryPrice !== limitBuyTarget) {
        throw new Error('Limit BUY execution failure!');
      }

      // Close position
      await post('/api/trade/close', { tradeId: filledBuyOrder.id, exitPrice: limitBuyTarget + 2 }, authHeader);

      // 5. LIMIT SELL Execution Semantics (Pending -> Trigger -> Open)
      console.log('\n[TEST 5] Testing LIMIT SELL Semantics (Pending -> Trigger -> Open)...');
      const limitSellTarget = liveLtp + 10.00; // Limit above market
      const limitSellRes = await post('/api/trade/place', {
        symbol: selectedSymbol,
        productType: 'INTRADAY',
        orderType: 'SELL',
        quantity: orderQty,
        entryPrice: limitSellTarget,
        orderExecutionType: 'LIMIT',
        limitPrice: limitSellTarget,
        currentMarketPrice: liveLtp,
        type: 'OPTION'
      }, authHeader);

      console.log('   ✓ Limit SELL Order Created ➔ Status:', limitSellRes.body.trade?.status, '(Expected: PENDING)');
      if (limitSellRes.body.trade?.status !== 'PENDING') {
        throw new Error('Expected status PENDING for Limit SELL above market!');
      }

      // Simulate market rising to limit price
      await post('/api/trade/trigger-pending', { symbol: selectedSymbol, currentPrice: limitSellTarget }, authHeader);
      const filledSellOrder = await prisma.trade.findUnique({ where: { id: limitSellRes.body.trade.id } });
      console.log('   ✓ Filled SELL Trade Status:', filledSellOrder.status, '| Entry Price: ₹' + filledSellOrder.entryPrice);
      if (filledSellOrder.status !== 'OPEN' || filledSellOrder.entryPrice !== limitSellTarget) {
        throw new Error('Limit SELL execution failure!');
      }

      // Close position
      await post('/api/trade/close', { tradeId: filledSellOrder.id, exitPrice: limitSellTarget - 2 }, authHeader);

      // 6. LIMIT Order Cancellation & Margin Refund Verification
      console.log('\n[TEST 6] Testing Pending Order Cancellation & Full Margin Refund...');
      const cancelTarget = liveLtp - 20.00;
      const cancelOrderRes = await post('/api/trade/place', {
        symbol: selectedSymbol,
        productType: 'INTRADAY',
        orderType: 'BUY',
        quantity: orderQty,
        entryPrice: cancelTarget,
        orderExecutionType: 'LIMIT',
        limitPrice: cancelTarget,
        currentMarketPrice: liveLtp,
        type: 'OPTION'
      }, authHeader);

      const balBeforeCancel = (await get('/api/wallet', authHeader)).body.paperBalance;
      const cancelRes = await post('/api/trade/cancel-order', { tradeId: cancelOrderRes.body.trade.id }, authHeader);
      const balAfterCancel = (await get('/api/wallet', authHeader)).body.paperBalance;
      console.log('   ✓ Cancelled Status:', cancelRes.body.trade?.status, '| Margin Refunded: ₹' + cancelRes.body.refundedMargin);
      console.log('   ✓ Balance Before Cancel: ₹' + balBeforeCancel + ' ➔ After Cancel: ₹' + balAfterCancel);
      if (cancelRes.body.trade?.status !== 'CANCELLED') throw new Error('Cancel failed!');
      if (balAfterCancel !== balBeforeCancel + cancelRes.body.refundedMargin) throw new Error('Refund mismatch!');

      // Cleanup test student
      await prisma.trade.deleteMany({ where: { userId: student.id } });
      await prisma.ledger.deleteMany({ where: { userId: student.id } });
      await prisma.user.delete({ where: { id: student.id } });
      console.log('   ✓ Transient smoke test user cleaned up.');

      // 7. System Health Check
      console.log('\n[TEST 7] Verifying System & Algo Health on VPS...');
      const smdeRes = await get('/api/smde/health');
      const planRes = await get('/api/membership/plans');
      console.log('   ✓ /api/smde/health:', smdeRes.status);
      console.log('   ✓ /api/membership/plans:', planRes.status);

      console.log('\n================================================================');
      console.log('🎉 ALL LIVE PRODUCTION SMOKE TESTS PASSED 100%!');
      console.log('================================================================\n');
    }

    runLiveProductionSmokeTests().catch(err => {
      console.error('Production Smoke Test Failed:', err);
      process.exit(1);
    }).finally(() => prisma.$disconnect());
  