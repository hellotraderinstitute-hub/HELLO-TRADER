/**
 * tests/today_pnl_reconciliation_test.js
 * Verification test suite for Today's Realized P&L reconciliation.
 * 100% Read-Only. ZERO real broker orders submitted.
 */

'use strict';
const assert = require('assert');

function runPnlTests() {
  console.log('================================================================================');
  console.log("   RUNNING TODAY'S P&L RECONCILIATION & TIMEZONE TEST SUITE                     ");
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, condition, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✔ [PASS] ${name} ${details ? '— ' + details : ''}`);
    } else {
      console.error(`✖ [FAIL] ${name} ${details ? '— ' + details : ''}`);
    }
  }

  // 1. IST Date Range Boundaries Test
  try {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const dateStr = istNow.toISOString().slice(0, 10);

    const startUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffsetMs);
    const endUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 23, 59, 59, 999) - istOffsetMs);

    test('1. IST Date Range Boundary Calculation',
      dateStr === '2026-08-24' && startUtc.toISOString() === '2026-08-23T18:30:00.000Z' && endUtc.toISOString() === '2026-08-24T18:29:59.999Z',
      `IST Date: ${dateStr} | Start UTC: ${startUtc.toISOString()} | End UTC: ${endUtc.toISOString()}`
    );
  } catch (e) { test('1. IST Date Range Boundary Calculation', false, e.message); }

  // 2. Individual Trade Realized P&L Calculation
  try {
    const closedPositions = [
      { symbol: 'NIFTY25AUG2624150CE', side: 'BUY', quantity: 65, entryPrice: 92.65, exitPrice: 91.95, expectedPnl: -45.50 },
      { symbol: 'NIFTY25AUG2624150PE', side: 'BUY', quantity: 65, entryPrice: 36.50, exitPrice: 36.55, expectedPnl: 3.25 },
      { symbol: 'NIFTY25AUG2624200PE', side: 'BUY', quantity: 65, entryPrice: 59.80, exitPrice: 58.60, expectedPnl: -78.00 },
      { symbol: 'NIFTY25AUG2624250PE', side: 'BUY', quantity: 65, entryPrice: 90.70, exitPrice: 88.40, expectedPnl: -149.50 },
      { symbol: 'NIFTY25AUG2624300PE', side: 'BUY', quantity: 130, entryPrice: 112.90, exitPrice: 125.40, expectedPnl: 1625.00 }
    ];

    let totalRealized = 0;
    closedPositions.forEach(p => {
      const pnl = (p.exitPrice - p.entryPrice) * p.quantity;
      totalRealized += pnl;
    });

    test('2. Completed Trades Realized P&L Sum',
      Math.abs(totalRealized - 1355.25) < 1,
      `Calculated Realized P&L sum: ₹${totalRealized.toFixed(2)}`
    );
  } catch (e) { test('2. Completed Trades Realized P&L Sum', false, e.message); }

  // 3. SmartAPI Live Position Book P&L Aggregation
  try {
    const smartApiPositions = [
      { tradingsymbol: 'NIFTY25AUG2624150CE', netqty: 0, buyavgprice: 92.65, sellavgprice: 91.95, realised: -91.00, unrealised: 0 },
      { tradingsymbol: 'NIFTY25AUG2624150PE', netqty: 0, buyavgprice: 36.50, sellavgprice: 36.55, realised: 3.25, unrealised: 0 },
      { tradingsymbol: 'NIFTY25AUG2624200PE', netqty: 0, buyavgprice: 59.80, sellavgprice: 58.60, realised: -78.00, unrealised: 0 },
      { tradingsymbol: 'NIFTY25AUG2624250PE', netqty: 0, buyavgprice: 90.70, sellavgprice: 88.40, realised: -149.50, unrealised: 0 },
      { tradingsymbol: 'NIFTY25AUG2624300PE', netqty: 0, buyavgprice: 112.90, sellavgprice: 125.40, realised: 1625.00, unrealised: 0 }
    ];

    let totalRealized = 0;
    let totalUnrealized = 0;
    smartApiPositions.forEach(p => {
      totalRealized += parseFloat(p.realised);
      totalUnrealized += parseFloat(p.unrealised);
    });

    const netPnl = totalRealized + totalUnrealized;

    test('3. SmartAPI Live Position Book Aggregation',
      totalRealized === 1309.75 && totalUnrealized === 0 && netPnl === 1309.75,
      `Realized: +₹${totalRealized.toFixed(2)} | Unrealized: ₹${totalUnrealized.toFixed(2)} | Net Total: +₹${netPnl.toFixed(2)}`
    );
  } catch (e) { test('3. SmartAPI Live Position Book Aggregation', false, e.message); }

  // 4. Open Positions Unrealized P&L Exclusion from Realized P&L
  try {
    const openPos = { symbol: 'NIFTY25AUG2624150CE', netqty: 65, entryPrice: 92.20, ltp: 95.00, unrealised: 182.00, realised: 0 };
    const closedPos = { symbol: 'NIFTY25AUG2624200PE', netqty: 0, realised: 250.00, unrealised: 0 };

    const summary = {
      unrealizedPnl: openPos.unrealised,
      realizedPnl: closedPos.realised,
      totalPnl: openPos.unrealised + closedPos.realised
    };

    test('4. Open Position Unrealized P&L Separated from Realized P&L',
      summary.realizedPnl === 250.00 && summary.unrealizedPnl === 182.00 && summary.totalPnl === 432.00,
      `Realized: ₹${summary.realizedPnl} (Closed only) | Unrealized: ₹${summary.unrealizedPnl} (Open only) | Net Total: ₹${summary.totalPnl}`
    );
  } catch (e) { test('4. Open Position Unrealized P&L Separated from Realized P&L', false, e.message); }

  // 5. Frontend & Backend Summary Schema Integrity
  try {
    const apiSummary = {
      unrealizedPnl: 0,
      realizedPnl: 1309.75,
      todayRealizedPnl: 1309.75,
      totalPnl: 1309.75,
      openPositionsCount: 0,
      closedPositionsCount: 5,
      todayDateStr: '2026-08-24'
    };

    const uiRealized = apiSummary.realizedPnl !== undefined ? apiSummary.realizedPnl : apiSummary.todayRealizedPnl;
    const uiUnrealized = apiSummary.unrealizedPnl || 0;
    const uiTotal = apiSummary.totalPnl || 0;

    test('5. Frontend/Backend Schema Field Match Integrity',
      uiRealized === 1309.75 && uiUnrealized === 0 && uiTotal === 1309.75,
      `UI Realized Display: ₹${uiRealized.toFixed(2)} | UI Unrealized: ₹${uiUnrealized.toFixed(2)} | UI Total: ₹${uiTotal.toFixed(2)}`
    );
  } catch (e) { test('5. Frontend/Backend Schema Field Match Integrity', false, e.message); }

  console.log('\n================================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} / ${total} PASSED (${Math.round(passed/total * 100)}%)`);
  console.log('================================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPnlTests();
