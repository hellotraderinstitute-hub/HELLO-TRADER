/**
 * smdeScannerEngine.js — Deterministic Institutional Market Scanner Engine v2.0
 */
import { 
  calculateEMA, calculateSMA, calculateRSI, calculateMACD, calculateATR,
  calculateVWAP, calculateSupertrend, calculateSMCStructures 
} from './technicalAnalysis.js';

export function evaluateSymbolScanner(symbol, candles) {
  if (!candles || candles.length < 20) {
    return {
      symbol,
      score: 0,
      confidence: 0,
      risk: 'HIGH',
      type: 'NEUTRAL',
      signal: 'INSUFFICIENT_DATA',
      evidence: ['Insufficient historical candle bars'],
      triggers: [],
      breakdown: [],
      volumeRatio: 1.0,
      confirmedSignalsCount: 0
    };
  }

  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle.close;
  const currentVolume = lastCandle.volume || 0;

  // 1. Technical Indicators
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200) || calculateSMA(candles, 20);
  const rsi = calculateRSI(candles, 14) || 50;
  const macdRes = calculateMACD(candles) || { macd: 0, signal: 0, histogram: 0 };
  const vwap = calculateVWAP(candles);
  const atr = calculateATR(candles, 14) || (lastPrice * 0.01);
  const supertrend = calculateSupertrend(candles, 10, 3);
  const smc = calculateSMCStructures(candles);

  // 2. Volume & Donchian Calculations
  const lookback20 = candles.slice(-21, -1);
  const donchianHigh = Math.max(...lookback20.map(c => c.high));
  const donchianLow = Math.min(...lookback20.map(c => c.low));
  const avgVolume20 = lookback20.reduce((acc, c) => acc + (c.volume || 0), 0) / lookback20.length || 1;
  const volumeRatio = Number((currentVolume / avgVolume20).toFixed(2));

  // Condition Flags
  const isBreakout = lastPrice > donchianHigh;
  const isBreakdown = lastPrice < donchianLow;
  const isEma2050Cross = ema20 > ema50;
  const isEma50200Cross = ema50 > ema200;
  const isVwapBull = lastPrice > vwap;
  const isMacdBull = macdRes.histogram > 0;
  const isSupertrendBull = supertrend.trend === 'BULLISH';
  const isAtrExpanded = (lastCandle.high - lastCandle.low) > 1.2 * atr;
  const isVolumeSpike = currentVolume >= 1.8 * avgVolume20;
  const candleRange = lastCandle.high - lastCandle.low;
  const bodyRange = Math.abs(lastCandle.close - lastCandle.open);
  const isDeliverySpike = isVolumeSpike && candleRange > 0 && (bodyRange / candleRange) >= 0.55;

  let rawScore = 50;
  const triggers = [];
  const evidence = [];
  const breakdown = [];

  // Evaluate All 17 Deterministic Conditions

  // 1. Donchian Breakout (+12) / Breakdown (-12)
  if (isBreakout) {
    rawScore += 12;
    triggers.push('Breakout');
    evidence.push(`✔ Price breached 20-bar Donchian High (₹${donchianHigh})`);
    breakdown.push({ condition: 'Donchian Breakout', points: +12 });
  } else if (isBreakdown) {
    rawScore -= 12;
    triggers.push('Breakdown');
    evidence.push(`✖ Price broke 20-bar Donchian Low (₹${donchianLow})`);
    breakdown.push({ condition: 'Donchian Breakdown', points: -12 });
  }

  // 2. EMA Alignment: EMA20 > EMA50 (+8)
  if (isEma2050Cross) {
    rawScore += 8;
    triggers.push('EMA20>EMA50');
    evidence.push(`✔ EMA20 (₹${ema20}) > EMA50 (₹${ema50})`);
    breakdown.push({ condition: 'EMA20 > EMA50', points: +8 });
  } else {
    evidence.push(`✖ EMA20 (₹${ema20}) <= EMA50 (₹${ema50})`);
  }

  // 3. Long-Term Alignment: EMA50 > EMA200 (+8)
  if (isEma50200Cross) {
    rawScore += 8;
    triggers.push('EMA50>EMA200');
    evidence.push(`✔ EMA50 (₹${ema50}) > EMA200 (₹${ema200})`);
    breakdown.push({ condition: 'EMA50 > EMA200', points: +8 });
  } else {
    evidence.push(`✖ EMA50 (₹${ema50}) <= EMA200 (₹${ema200})`);
  }

  // 4. Intraday VWAP Support (+6)
  if (isVwapBull) {
    rawScore += 6;
    triggers.push('Above VWAP');
    evidence.push(`✔ Price (₹${lastPrice}) > VWAP (₹${vwap})`);
    breakdown.push({ condition: 'Above VWAP', points: +6 });
  } else {
    evidence.push(`✖ Price (₹${lastPrice}) <= VWAP (₹${vwap})`);
  }

  // 5. RSI Momentum
  if (rsi >= 70) {
    rawScore += 10;
    triggers.push('RSI Overbought Momentum');
    evidence.push(`✔ RSI ${rsi} (Strong Bullish Impulse)`);
    breakdown.push({ condition: 'RSI >= 70 Momentum', points: +10 });
  } else if (rsi >= 60) {
    rawScore += 6;
    triggers.push('RSI Bullish');
    evidence.push(`✔ RSI ${rsi} (> 60 Bullish Threshold)`);
    breakdown.push({ condition: 'RSI >= 60', points: +6 });
  } else if (rsi <= 40) {
    rawScore -= 8;
    evidence.push(`✖ RSI ${rsi} (< 40 Bearish Weakness)`);
    breakdown.push({ condition: 'RSI <= 40', points: -8 });
  } else {
    evidence.push(`✖ RSI ${rsi} (Neutral Zone)`);
  }

  // 6. MACD Trend (+8)
  if (isMacdBull) {
    rawScore += 8;
    triggers.push('MACD Bullish');
    evidence.push(`✔ MACD Histogram (+${macdRes.histogram}) Positive`);
    breakdown.push({ condition: 'MACD Histogram Positive', points: +8 });
  } else {
    evidence.push(`✖ MACD Histogram (${macdRes.histogram}) Negative`);
  }

  // 7. Supertrend 10,3 (+8)
  if (isSupertrendBull) {
    rawScore += 8;
    triggers.push('Supertrend Bullish');
    evidence.push('✔ Supertrend 10,3 Trailing Support Active');
    breakdown.push({ condition: 'Supertrend Bullish', points: +8 });
  } else {
    evidence.push('✖ Supertrend Bearish Resistance');
  }

  // 8. ATR Volatility Expansion (+5)
  if (isAtrExpanded) {
    rawScore += 5;
    triggers.push('ATR Expansion');
    evidence.push(`✔ Candle Range > 1.2x ATR (₹${atr})`);
    breakdown.push({ condition: 'ATR Range Expansion', points: +5 });
  }

  // 9. SMC Break of Structure (BOS) (+10)
  if (smc.bos === 'BULLISH_BOS') {
    rawScore += 10;
    triggers.push('BOS');
    evidence.push('✔ Bullish Break of Structure (BOS)');
    breakdown.push({ condition: 'Bullish BOS', points: +10 });
  }

  // 10. SMC Change of Character (CHOCH) (+10)
  if (smc.choch === 'BULLISH_CHOCH') {
    rawScore += 10;
    triggers.push('CHOCH');
    evidence.push('✔ Bullish Change of Character (CHOCH)');
    breakdown.push({ condition: 'Bullish CHOCH', points: +10 });
  }

  // 11. SMC Bullish Order Block (OB) (+10)
  if (smc.bullishOB) {
    rawScore += 10;
    triggers.push('Bullish OB');
    evidence.push('✔ Bullish Order Block (OB) Demand Floor');
    breakdown.push({ condition: 'Bullish OB', points: +10 });
  }

  // 12. SMC Bearish Order Block (OB) (-10)
  if (smc.bearishOB) {
    rawScore -= 10;
    triggers.push('Bearish OB');
    evidence.push('✖ Bearish Order Block (OB) Supply Ceiling');
    breakdown.push({ condition: 'Bearish OB', points: -10 });
  }

  // 13. SMC Fair Value Gap (FVG) (+6)
  if (smc.fvg === 'BULLISH_FVG') {
    rawScore += 6;
    triggers.push('Bullish FVG');
    evidence.push('✔ Bullish Fair Value Gap (FVG) Imbalance');
    breakdown.push({ condition: 'Bullish FVG', points: +6 });
  }

  // 14. SMC Liquidity Sweep (+5)
  if (smc.liquiditySweep && smc.liquiditySweep !== 'NONE') {
    rawScore += 5;
    triggers.push('Liquidity Sweep');
    evidence.push(`✔ Liquidity Sweep Detected (${smc.liquiditySweep})`);
    breakdown.push({ condition: 'Liquidity Sweep', points: +5 });
  }

  // 15. Volume Spike (+10)
  if (isVolumeSpike) {
    rawScore += 10;
    triggers.push('Volume Spike');
    evidence.push(`✔ Volume ${currentVolume} >= 1.8x Avg Volume (${Math.round(avgVolume20)})`);
    breakdown.push({ condition: 'Volume Spike', points: +10 });
  }

  // 16. Institutional Delivery Accumulation (+8)
  if (isDeliverySpike) {
    rawScore += 8;
    triggers.push('Delivery Spike');
    evidence.push('✔ Institutional Delivery Accumulation');
    breakdown.push({ condition: 'Delivery Spike', points: +8 });
  }

  const finalScore = Math.min(98, Math.max(15, rawScore));
  const type = finalScore >= 60 ? 'BULLISH' : finalScore <= 45 ? 'BEARISH' : 'NEUTRAL';
  const confidence = finalScore;
  const risk = finalScore >= 75 ? 'LOW' : finalScore >= 55 ? 'MODERATE' : 'HIGH';

  return {
    symbol,
    score: finalScore,
    rawScore,
    confidence,
    risk,
    type,
    price: lastPrice,
    rsi: Number(rsi.toFixed(2)),
    macdHistogram: Number((macdRes.histogram || 0).toFixed(2)),
    volumeRatio,
    confirmedSignalsCount: triggers.length,
    triggers,
    evidence,
    breakdown,
    time: new Date().toLocaleTimeString('en-US', { hour12: false })
  };
}

// Process full scanner grid & apply deterministic tie-breaking logic
export function processMarketScannerGrid(symbolsList, klinesMap) {
  if (!symbolsList || symbolsList.length === 0) return [];

  const results = symbolsList.map(sym => {
    const candles = klinesMap.get(`${sym.toUpperCase()}_5m`) || klinesMap.get(`${sym.toUpperCase()}_1m`) || [];
    return evaluateSymbolScanner(sym, candles);
  });

  // Sort descending by score, with deterministic tie-breaking
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-breaker 1: Confirmed Signals Count
    if (b.confirmedSignalsCount !== a.confirmedSignalsCount) {
      return b.confirmedSignalsCount - a.confirmedSignalsCount;
    }
    // Tie-breaker 2: MACD Histogram Strength
    if (b.macdHistogram !== a.macdHistogram) {
      return b.macdHistogram - a.macdHistogram;
    }
    // Tie-breaker 3: Volume Ratio
    if (b.volumeRatio !== a.volumeRatio) {
      return b.volumeRatio - a.volumeRatio;
    }
    // Tie-breaker 4: RSI Strength
    return b.rsi - a.rsi;
  });
}
