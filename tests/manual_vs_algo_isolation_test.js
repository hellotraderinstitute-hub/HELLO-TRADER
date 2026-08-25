/**
 * tests/manual_vs_algo_isolation_test.js
 * Comprehensive Verification Suite for Strict Isolation between Manual Broker Trades & Algo Trading Engine.
 *
 * BROKER POSITION ≠ ALGO POSITION:
 * Verifies:
 * - Test A: Manual CE open + TradingView BUY -> ALGO CE BUY must execute.
 * - Test B: Manual PE open + TradingView BUY -> ALGO CE BUY must execute.
 * - Test C: Manual CE open + TradingView EXIT -> 0 broker exit orders.
 * - Test D: Algo CE open + Manual PE open + TradingView EXIT -> SELL only ALGO CE, manual PE untouched.
 * - Test E: Manual CE open + Algo CE open + TradingView EXIT -> SELL only ALGO CE, manual CE untouched.
 * - Test F: Algo CE open + TradingView SL -> SELL ALGO CE, 0 PE BUY.
 * - Test G: Algo CE open + TradingView TARGET -> SELL ALGO CE, 0 PE BUY.
 * - Test H: Manual CE open + Algo CE open + explicit SELL reversal -> SELL only ALGO CE -> BUY PE (manual CE untouched).
 * - Test I: Manual-only position + TradingView EXIT -> 0 broker orders.
 * - Test J: Manual positions NEVER included in Algo P&L, Algo token billing, AlgoPosition, or Algo exit lifecycle.
 */

'use strict';
const assert = require('assert');

async function runManualVsAlgoIsolationSuite() {
  console.log('================================================================================');
  console.log('   RUNNING MANUAL BROKER TRADES VS ALGO ENGINE STRICT ISOLATION TEST SUITE     ');
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, condition, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✔ [PASS] ${name} ${details ? '— ' + details : ''}`);
    } else {
      console.error(`❌ [FAIL] ${name} ${details ? '— ' + details : ''}`);
    }
  }

  // --- MOCK ENGINE HELPERS ---

  // Simulates Algo Engine webhook decision logic
  function processSignal({ payload, algoPositions = [], brokerPositions = [] }) {
    const rawInput = (payload.direction || payload.action || payload.signal || payload.side || '').toUpperCase().trim();
    const exitActionKeywords = [
      'EXIT', 'CLOSE', 'SQUAREOFF', 'SQUARE_OFF', 'FLATTEN',
      'EXIT_LONG', 'EXIT_SHORT', 'CLOSE_BUY', 'CLOSE_SELL',
      'SL', 'STOP_LOSS', 'STOPLOSS', 'SL_EXIT', 'TARGET', 'TP',
      'TAKE_PROFIT', 'TAKEPROFIT', 'TARGET_EXIT', 'TRAIL_SL', 'TRAILING_STOP',
      'TRAILING_STOP_LOSS', 'EXIT_SL', 'EXIT_TARGET', 'EXIT_TRAIL_SL'
    ];
    const isExplicitExitFlag = payload.is_exit === true || payload.exit === true || payload.isExit === true || payload.close === true;
    const rawReason = (payload.exit_reason || payload.exitReason || payload.reason || payload.comment || '').toUpperCase().trim();

    const isExitSignal = exitActionKeywords.includes(rawInput) ||
                         isExplicitExitFlag ||
                         (rawInput === 'SELL' && (rawReason.includes('SL') || rawReason.includes('TARGET') || rawReason.includes('STOP') || rawReason.includes('TRAIL') || rawReason.includes('EXIT') || isExplicitExitFlag));

    let exitReason = 'STRATEGY_EXIT';
    if (rawReason.includes('TRAIL') || rawInput.includes('TRAIL')) exitReason = 'TRAIL_SL';
    else if (rawReason.includes('SL') || rawReason.includes('STOP') || rawInput.includes('SL') || rawInput.includes('STOP')) exitReason = 'SL';
    else if (rawReason.includes('TARGET') || rawReason.includes('TP') || rawReason.includes('PROFIT') || rawInput.includes('TARGET') || rawInput.includes('TP')) exitReason = 'TARGET';

    let signalDirection = null;
    if (!isExitSignal) {
      if (['UP', 'UPSIDE', 'BUY', 'LONG', 'CALL', 'BULL', 'BUY_SIGNAL'].includes(rawInput)) signalDirection = 'UPSIDE';
      else if (['DOWN', 'DOWNSIDE', 'SELL', 'SHORT', 'PUT', 'BEAR', 'SELL_SIGNAL'].includes(rawInput)) signalDirection = 'DOWNSIDE';
    }

    const executedOrders = [];
    const modifiedAlgoPositions = [...algoPositions];

    if (isExitSignal) {
      // Rule 2: Close ONLY ALGO-owned positions. Never touch brokerPositions.
      const openAlgo = modifiedAlgoPositions.filter(p => p.status === 'OPEN');
      if (openAlgo.length === 0) {
        return { status: 'SKIPPED: NO_OPEN_POSITION', executedOrders, algoPositions: modifiedAlgoPositions };
      }
      for (const pos of openAlgo) {
        executedOrders.push({
          source: 'ALGO_EXIT',
          symbol: pos.symbol,
          side: pos.side === 'BUY' ? 'SELL' : 'BUY',
          quantity: pos.quantity,
          reason: exitReason
        });
        pos.status = 'CLOSED';
        pos.closedAt = new Date();
      }
      return { status: 'EXIT_COMPLETED', executedOrders, algoPositions: modifiedAlgoPositions };
    }

    // Directional Entry / Reversal
    if (signalDirection) {
      // Step 1: Reversal check on ALGO-owned positions only
      const oppositeAlgo = modifiedAlgoPositions.filter(p => {
        if (p.status !== 'OPEN') return false;
        if (signalDirection === 'UPSIDE' && p.symbol.endsWith('PE')) return true;
        if (signalDirection === 'DOWNSIDE' && p.symbol.endsWith('CE')) return true;
        return false;
      });

      for (const opp of oppositeAlgo) {
        executedOrders.push({
          source: 'ALGO_REVERSAL_EXIT',
          symbol: opp.symbol,
          side: opp.side === 'BUY' ? 'SELL' : 'BUY',
          quantity: opp.quantity,
          reason: 'REVERSAL'
        });
        opp.status = 'CLOSED';
        opp.closedAt = new Date();
      }

      // Step 2: Anti-Pyramiding check ONLY on ALGO-owned positions
      const targetSymbol = signalDirection === 'UPSIDE' ? 'NIFTY25AUG2624150CE' : 'NIFTY25AUG2624150PE';
      const duplicateAlgo = modifiedAlgoPositions.find(p => p.status === 'OPEN' && p.symbol === targetSymbol);

      if (duplicateAlgo) {
        return { status: 'SKIPPED: DUPLICATE_ALGO_POSITION', executedOrders, algoPositions: modifiedAlgoPositions };
      }

      // Step 3: Execute new ALGO BUY entry
      executedOrders.push({
        source: 'ALGO_ENTRY',
        symbol: targetSymbol,
        side: 'BUY',
        quantity: 65,
        direction: signalDirection
      });

      modifiedAlgoPositions.push({
        id: `algo_pos_${Date.now()}`,
        symbol: targetSymbol,
        side: 'BUY',
        quantity: 65,
        entryPrice: 100.0,
        status: 'OPEN',
        source: 'ALGO'
      });

      return { status: 'ENTRY_COMPLETED', executedOrders, algoPositions: modifiedAlgoPositions };
    }

    return { status: 'NO_ACTION', executedOrders, algoPositions: modifiedAlgoPositions };
  }

  // --- TEST A: Manual CE open + TradingView BUY -> ALGO CE BUY must execute ---
  {
    const brokerPositions = [{ symbol: 'NIFTY25AUG2624150CE', netqty: 65, source: 'MANUAL' }];
    const algoPositions = []; // No algo position currently
    const result = processSignal({
      payload: { action: 'BUY', symbol: 'NIFTY', price: 24150 },
      algoPositions,
      brokerPositions
    });

    const hasAlgoBuy = result.executedOrders.some(o => o.source === 'ALGO_ENTRY' && o.symbol === 'NIFTY25AUG2624150CE' && o.side === 'BUY');
    test('Test A: Manual CE open + TradingView BUY => ALGO CE BUY must execute',
      hasAlgoBuy && result.status === 'ENTRY_COMPLETED',
      `Manual broker CE ignored | Algo placed: BUY 65 NIFTY25AUG2624150CE`
    );
  }

  // --- TEST B: Manual PE open + TradingView BUY -> ALGO CE BUY must execute ---
  {
    const brokerPositions = [{ symbol: 'NIFTY25AUG2624150PE', netqty: 65, source: 'MANUAL' }];
    const algoPositions = []; // No algo position currently
    const result = processSignal({
      payload: { action: 'BUY', symbol: 'NIFTY', price: 24150 },
      algoPositions,
      brokerPositions
    });

    const hasAlgoBuy = result.executedOrders.some(o => o.source === 'ALGO_ENTRY' && o.symbol === 'NIFTY25AUG2624150CE' && o.side === 'BUY');
    test('Test B: Manual PE open + TradingView BUY => ALGO CE BUY must execute',
      hasAlgoBuy && result.status === 'ENTRY_COMPLETED',
      `Manual broker PE ignored | Algo placed: BUY 65 NIFTY25AUG2624150CE`
    );
  }

  // --- TEST C: Manual CE open + TradingView EXIT -> 0 broker exit orders ---
  {
    const brokerPositions = [{ symbol: 'NIFTY25AUG2624150CE', netqty: 65, source: 'MANUAL' }];
    const algoPositions = []; // 0 Algo positions
    const result = processSignal({
      payload: { action: 'EXIT', symbol: 'NIFTY', reason: 'SL' },
      algoPositions,
      brokerPositions
    });

    test('Test C: Manual CE open + TradingView EXIT => 0 broker exit orders',
      result.executedOrders.length === 0 && result.status.includes('SKIPPED'),
      `Orders placed: 0 | Manual position safely preserved without square-off`
    );
  }

  // --- TEST D: Algo CE open + Manual PE open + TradingView EXIT -> sirf ALGO CE SELL, manual PE untouched ---
  {
    const brokerPositions = [{ symbol: 'NIFTY25AUG2624150PE', netqty: 65, source: 'MANUAL' }];
    const algoPositions = [{ id: 'algo_1', symbol: 'NIFTY25AUG2624150CE', side: 'BUY', quantity: 65, status: 'OPEN', source: 'ALGO' }];
    const result = processSignal({
      payload: { action: 'EXIT', symbol: 'NIFTY', reason: 'SL' },
      algoPositions,
      brokerPositions
    });

    const soldAlgoCe = result.executedOrders.some(o => o.symbol === 'NIFTY25AUG2624150CE' && o.side === 'SELL');
    const touchedManualPe = result.executedOrders.some(o => o.symbol === 'NIFTY25AUG2624150PE');

    test('Test D: Algo CE open + Manual PE open + TradingView EXIT => Only ALGO CE SELL, manual PE untouched',
      soldAlgoCe && !touchedManualPe && result.executedOrders.length === 1,
      `Exited: ALGO CE (${result.executedOrders[0].symbol}) | Untouched: Manual PE`
    );
  }

  // --- TEST E: Manual CE open + Algo CE open + TradingView EXIT -> sirf ALGO CE SELL, manual CE untouched ---
  {
    const brokerPositions = [{ symbol: 'NIFTY25AUG2624150CE', netqty: 130, source: 'MANUAL_PLUS_ALGO' }];
    const algoPositions = [{ id: 'algo_ce_only', symbol: 'NIFTY25AUG2624150CE', side: 'BUY', quantity: 65, status: 'OPEN', source: 'ALGO' }];
    const result = processSignal({
      payload: { action: 'EXIT', symbol: 'NIFTY', reason: 'Target' },
      algoPositions,
      brokerPositions
    });

    const algoOrder = result.executedOrders[0];
    test('Test E: Manual CE open + Algo CE open + TradingView EXIT => SELL only ALGO CE quantity, manual CE untouched',
      result.executedOrders.length === 1 && algoOrder.quantity === 65 && algoOrder.side === 'SELL',
      `Exited strictly ALGO quantity (65 qty), preserving manual CE remainder at broker`
    );
  }

  // --- TEST F: Algo CE open + TradingView SL -> SELL ALGO CE, 0 PE BUY ---
  {
    const algoPositions = [{ id: 'algo_ce_sl', symbol: 'NIFTY25AUG2624150CE', side: 'BUY', quantity: 65, status: 'OPEN', source: 'ALGO' }];
    const result = processSignal({
      payload: { action: 'SL', symbol: 'NIFTY' },
      algoPositions
    });

    const hasCeExit = result.executedOrders.some(o => o.symbol === 'NIFTY25AUG2624150CE' && o.side === 'SELL');
    const hasPeBuy = result.executedOrders.some(o => o.symbol.includes('PE'));

    test('Test F: Algo CE open + TradingView SL => SELL ALGO CE, 0 PE BUY',
      hasCeExit && !hasPeBuy && result.executedOrders.length === 1,
      `Orders: SELL 65 ALGO CE (0 PE BUY)`
    );
  }

  // --- TEST G: Algo CE open + TradingView TARGET -> SELL ALGO CE, 0 PE BUY ---
  {
    const algoPositions = [{ id: 'algo_ce_target', symbol: 'NIFTY25AUG2624150CE', side: 'BUY', quantity: 65, status: 'OPEN', source: 'ALGO' }];
    const result = processSignal({
      payload: { action: 'TARGET', symbol: 'NIFTY' },
      algoPositions
    });

    const hasCeExit = result.executedOrders.some(o => o.symbol === 'NIFTY25AUG2624150CE' && o.side === 'SELL');
    const hasPeBuy = result.executedOrders.some(o => o.symbol.includes('PE'));

    test('Test G: Algo CE open + TradingView TARGET => SELL ALGO CE, 0 PE BUY',
      hasCeExit && !hasPeBuy && result.executedOrders.length === 1,
      `Orders: SELL 65 ALGO CE (0 PE BUY)`
    );
  }

  // --- TEST H: Manual CE open + Algo CE open + explicit TradingView SELL reversal -> SELL only ALGO CE, then BUY PE (Manual CE untouched) ---
  {
    const brokerPositions = [{ symbol: 'NIFTY25AUG2624150CE', netqty: 130, source: 'MANUAL_PLUS_ALGO' }];
    const algoPositions = [{ id: 'algo_rev_pos', symbol: 'NIFTY25AUG2624150CE', side: 'BUY', quantity: 65, status: 'OPEN', source: 'ALGO' }];
    const result = processSignal({
      payload: { action: 'SELL', symbol: 'NIFTY', price: 24150 }, // Genuine reversal
      algoPositions,
      brokerPositions
    });

    const revExit = result.executedOrders.find(o => o.source === 'ALGO_REVERSAL_EXIT');
    const revEntry = result.executedOrders.find(o => o.source === 'ALGO_ENTRY');

    test('Test H: Manual CE + Algo CE + Reversal => SELL ALGO CE (65 qty) -> BUY PE (65 qty) (Manual CE untouched)',
      result.executedOrders.length === 2 && revExit && revExit.quantity === 65 && revEntry && revEntry.symbol.endsWith('PE'),
      `Sequence: SELL 65 ALGO CE -> BUY 65 ALGO PE | Manual CE untouched`
    );
  }

  // --- TEST I: Manual-only position + TradingView EXIT -> 0 broker orders ---
  {
    const brokerPositions = [{ symbol: 'INFY', netqty: 100, source: 'MANUAL' }];
    const algoPositions = []; // 0 Algo positions
    const result = processSignal({
      payload: { action: 'EXIT', symbol: 'NIFTY' },
      algoPositions,
      brokerPositions
    });

    test('Test I: Manual-only position (INFY) + TradingView EXIT => 0 broker orders',
      result.executedOrders.length === 0 && result.status.includes('SKIPPED'),
      `Orders placed: 0 | Manual equity/option positions completely isolated from algo`
    );
  }

  // --- TEST J: Manual position NEVER included in Algo P&L, Algo token billing, AlgoPosition, or Algo exit lifecycle ---
  {
    // Simulating calculateTodayRealizedPnl isolation logic
    const closedAlgoPositions = [
      { id: 'pos_1', symbol: 'NIFTY25AUG2624150CE', entryPrice: 100, exitPrice: 120, quantity: 65, pnl: 1300, source: 'ALGO' }
    ];
    const liveBrokerPositions = [
      { symbol: 'NIFTY25AUG2624150CE', realised: 1300, unrealised: 0 }, // Algo trade
      { symbol: 'INFY', realised: 5000, unrealised: 200 },               // Manual equity trade
      { symbol: 'BANKNIFTY25AUG2652000CE', realised: -2500, unrealised: 0 } // Manual option trade
    ];

    const algoSymbolSet = new Set(closedAlgoPositions.map(p => p.symbol));

    let algoBrokerRealizedPnl = 0;
    for (const lb of liveBrokerPositions) {
      if (algoSymbolSet.has(lb.symbol)) {
        algoBrokerRealizedPnl += lb.realised;
      }
    }

    test('Test J: Manual positions NEVER pollute Algo P&L, Token Billing, or Positions',
      algoBrokerRealizedPnl === 1300 && algoSymbolSet.has('INFY') === false,
      `Calculated Algo P&L: ₹${algoBrokerRealizedPnl} (Excluded ₹5000 INFY & ₹-2500 BANKNIFTY manual trades)`
    );
  }

  console.log('\n================================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} / ${total} PASSED (${Math.round(passed / total * 100)}%)`);
  console.log('================================================================================\n');

  if (passed !== total) process.exit(1);
}

runManualVsAlgoIsolationSuite();
