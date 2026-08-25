/**
 * ============================================================================
 * HELLO TRADER MODULAR INDICATOR & TECHNICAL ANALYSIS ENGINE v4.5
 * ============================================================================
 * Full Mathematical Calculation Suite & Registry for:
 * 1. Trend (EMA, SMA, WMA, HMA, VWMA, DEMA, TEMA, Supertrend, PSAR, Donchian, Keltner)
 * 2. Momentum (RSI, Stochastic, Stoch RSI, MACD, CCI, Momentum, ROC, Williams %R, Awesome Oscillator)
 * 3. Volatility (Bollinger Bands, ATR)
 * 4. Volume & Flow (VWAP, OBV)
 * 5. Smart Money Concepts / SMC (Order Blocks, FVG, BOS/CHOCH, ORB)
 * 6. Auto-Analysis & Pivots (CPR, Multi-Mode Pivots: Standard, Fibonacci, Camarilla, Woodie, DeMark, Auto Trendlines)
 * ============================================================================
 */

export function extractOHLCV(candles = []) {
  const times = [];
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const volumes = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    times.push(c.time);
    opens.push(c.open);
    highs.push(c.high);
    lows.push(c.low);
    closes.push(c.close);
    volumes.push(c.volume || 0);
  }

  return { times, opens, highs, lows, closes, volumes };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. TREND INDICATORS
// ────────────────────────────────────────────────────────────────────────────

export function calculateSMA(candles = [], period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      result.push({ time: candles[i].time, value: Number((sum / period).toFixed(2)) });
    }
  }
  return result;
}

export function calculateEMA(candles = [], period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];
  const k = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let ema = sum / period;
  result.push({ time: candles[period - 1].time, value: Number(ema.toFixed(2)) });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({ time: candles[i].time, value: Number(ema.toFixed(2)) });
  }
  return result;
}

export function calculateWMA(candles = [], period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];
  const denom = (period * (period + 1)) / 2;

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - (period - 1 - j)].close * (j + 1);
    }
    result.push({ time: candles[i].time, value: Number((sum / denom).toFixed(2)) });
  }
  return result;
}

export function calculateHMA(candles = [], period = 20) {
  if (!candles || candles.length < period) return [];
  const halfLength = Math.max(1, Math.floor(period / 2));
  const sqrtLength = Math.max(1, Math.floor(Math.sqrt(period)));

  const wmaHalf = calculateWMA(candles, halfLength);
  const wmaFull = calculateWMA(candles, period);

  const offset = period - halfLength;
  const diffCandles = [];

  for (let i = 0; i < wmaFull.length; i++) {
    const halfVal = wmaHalf[i + offset]?.value ?? wmaFull[i].value;
    const fullVal = wmaFull[i].value;
    diffCandles.push({
      time: wmaFull[i].time,
      close: 2 * halfVal - fullVal
    });
  }

  const hma = calculateWMA(diffCandles, sqrtLength);
  return hma.map(h => ({ time: h.time, value: Number(h.value.toFixed(2)) }));
}

export function calculateVWMA(candles = [], period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sumPV = 0;
    let sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = candles[j].volume || 1;
      sumPV += candles[j].close * v;
      sumV += v;
    }
    const vwma = sumV > 0 ? sumPV / sumV : candles[i].close;
    result.push({ time: candles[i].time, value: Number(vwma.toFixed(2)) });
  }
  return result;
}

export function calculateDEMA(candles = [], period = 20) {
  if (!candles || candles.length < period * 2) return [];
  const ema1 = calculateEMA(candles, period);
  const ema2 = calculateEMA(ema1.map(e => ({ time: e.time, close: e.value })), period);

  const result = [];
  const offset = period - 1;
  for (let i = 0; i < ema2.length; i++) {
    const e1 = ema1[i + offset].value;
    const e2 = ema2[i].value;
    result.push({ time: ema2[i].time, value: Number((2 * e1 - e2).toFixed(2)) });
  }
  return result;
}

export function calculateTEMA(candles = [], period = 20) {
  if (!candles || candles.length < period * 3) return [];
  const ema1 = calculateEMA(candles, period);
  const ema2 = calculateEMA(ema1.map(e => ({ time: e.time, close: e.value })), period);
  const ema3 = calculateEMA(ema2.map(e => ({ time: e.time, close: e.value })), period);

  const result = [];
  const offset1 = (period - 1) * 2;
  const offset2 = period - 1;
  for (let i = 0; i < ema3.length; i++) {
    const e1 = ema1[i + offset1].value;
    const e2 = ema2[i + offset2].value;
    const e3 = ema3[i].value;
    result.push({ time: ema3[i].time, value: Number((3 * e1 - 3 * e2 + e3).toFixed(2)) });
  }
  return result;
}

export function calculateSupertrend(candles = [], period = 10, multiplier = 3) {
  if (!candles || candles.length < period) {
    return { upper: [], lower: [], trend: [], line: [], upLine: [], downLine: [] };
  }

  const atrList = calculateATR(candles, period);
  if (atrList.length === 0) {
    return { upper: [], lower: [], trend: [], line: [], upLine: [], downLine: [] };
  }

  const upper = [];
  const lower = [];
  const trend = [];
  const line = [];
  const upLine = [];
  const downLine = [];

  const startIndex = candles.length - atrList.length;
  let isUpTrend = true;
  let prevFinalUpper = 0;
  let prevFinalLower = 0;

  for (let i = 0; i < atrList.length; i++) {
    const candleIndex = startIndex + i;
    const c = candles[candleIndex];
    const atr = atrList[i].value;

    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    const prevClose = candleIndex > 0 ? candles[candleIndex - 1].close : c.close;

    let finalUpper = basicUpper;
    let finalLower = basicLower;

    if (i > 0) {
      finalUpper = (basicUpper < prevFinalUpper || prevClose > prevFinalUpper) ? basicUpper : prevFinalUpper;
      finalLower = (basicLower > prevFinalLower || prevClose < prevFinalLower) ? basicLower : prevFinalLower;
    }

    if (isUpTrend && c.close < finalLower) {
      isUpTrend = false;
    } else if (!isUpTrend && c.close > finalUpper) {
      isUpTrend = true;
    }

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;

    const currentVal = isUpTrend ? finalLower : finalUpper;
    const entry = { time: c.time, value: Number(currentVal.toFixed(2)), color: isUpTrend ? '#00E676' : '#FF5252' };
    line.push(entry);

    if (isUpTrend) {
      upLine.push({ time: c.time, value: Number(finalLower.toFixed(2)) });
      lower.push({ time: c.time, value: Number(finalLower.toFixed(2)) });
      trend.push({ time: c.time, value: 1 });
    } else {
      downLine.push({ time: c.time, value: Number(finalUpper.toFixed(2)) });
      upper.push({ time: c.time, value: Number(finalUpper.toFixed(2)) });
      trend.push({ time: c.time, value: -1 });
    }
  }

  return { upper, lower, trend, line, upLine, downLine };
}

export function calculateParabolicSAR(candles = [], step = 0.02, maxStep = 0.2) {
  if (!candles || candles.length < 2) return [];
  const result = [];

  let isLong = candles[1].close >= candles[0].close;
  let sar = isLong ? candles[0].low : candles[0].high;
  let ep = isLong ? candles[1].high : candles[1].low;
  let af = step;

  result.push({ time: candles[0].time, value: Number(sar.toFixed(2)) });

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    let nextSar = sar + af * (ep - sar);

    if (isLong) {
      nextSar = Math.min(nextSar, prevC.low, c.low);
      if (c.low < nextSar) {
        isLong = false;
        nextSar = ep;
        ep = c.low;
        af = step;
      } else {
        if (c.high > ep) {
          ep = c.high;
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      nextSar = Math.max(nextSar, prevC.high, c.high);
      if (c.high > nextSar) {
        isLong = true;
        nextSar = ep;
        ep = c.high;
        af = step;
      } else {
        if (c.low < ep) {
          ep = c.low;
          af = Math.min(af + step, maxStep);
        }
      }
    }

    sar = nextSar;
    result.push({ time: c.time, value: Number(sar.toFixed(2)) });
  }

  return result;
}

export function calculateDonchian(candles = [], period = 20) {
  if (!candles || candles.length < period) return { upper: [], lower: [], middle: [] };
  const upper = [];
  const lower = [];
  const middle = [];

  for (let i = period - 1; i < candles.length; i++) {
    let maxHigh = -Infinity;
    let minLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > maxHigh) maxHigh = candles[j].high;
      if (candles[j].low < minLow) minLow = candles[j].low;
    }
    const mid = (maxHigh + minLow) / 2;
    upper.push({ time: candles[i].time, value: Number(maxHigh.toFixed(2)) });
    lower.push({ time: candles[i].time, value: Number(minLow.toFixed(2)) });
    middle.push({ time: candles[i].time, value: Number(mid.toFixed(2)) });
  }
  return { upper, lower, middle };
}

export function calculateKeltner(candles = [], emaPeriod = 20, atrPeriod = 10, multiplier = 2) {
  if (!candles || candles.length < Math.max(emaPeriod, atrPeriod)) return { upper: [], lower: [], middle: [] };
  const ema = calculateEMA(candles, emaPeriod);
  const atr = calculateATR(candles, atrPeriod);

  const upper = [];
  const lower = [];
  const middle = [];

  const offsetEma = candles.length - ema.length;
  const offsetAtr = candles.length - atr.length;

  for (let i = 0; i < candles.length; i++) {
    const idxEma = i - offsetEma;
    const idxAtr = i - offsetAtr;
    if (idxEma >= 0 && idxAtr >= 0) {
      const mid = ema[idxEma].value;
      const a = atr[idxAtr].value;
      middle.push({ time: candles[i].time, value: mid });
      upper.push({ time: candles[i].time, value: Number((mid + multiplier * a).toFixed(2)) });
      lower.push({ time: candles[i].time, value: Number((mid - multiplier * a).toFixed(2)) });
    }
  }

  return { upper, lower, middle };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. MOMENTUM INDICATORS
// ────────────────────────────────────────────────────────────────────────────

export function calculateRSI(candles = [], period = 14) {
  if (!candles || candles.length < period + 1) return [];
  const result = [];

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - 100 / (1 + rs);
  result.push({ time: candles[period].time, value: Number(rsi.toFixed(2)) });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
    result.push({ time: candles[i].time, value: Number(rsi.toFixed(2)) });
  }

  return result;
}

export function calculateMACD(candles = [], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!candles || candles.length < slowPeriod + signalPeriod) return { macd: [], signal: [], histogram: [] };

  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  const macdLine = [];
  const fastOffset = slowPeriod - fastPeriod;

  for (let i = 0; i < slowEma.length; i++) {
    const time = slowEma[i].time;
    const fastVal = fastEma[i + fastOffset].value;
    const slowVal = slowEma[i].value;
    macdLine.push({ time, close: fastVal - slowVal });
  }

  const signalLine = calculateEMA(macdLine, signalPeriod);
  const macdResult = [];
  const signalResult = [];
  const histogramResult = [];

  const signalOffset = signalPeriod - 1;
  for (let i = 0; i < signalLine.length; i++) {
    const time = signalLine[i].time;
    const macdVal = macdLine[i + signalOffset].close;
    const sigVal = signalLine[i].value;
    const histVal = macdVal - sigVal;

    macdResult.push({ time, value: Number(macdVal.toFixed(2)) });
    signalResult.push({ time, value: Number(sigVal.toFixed(2)) });
    histogramResult.push({
      time,
      value: Number(histVal.toFixed(2)),
      color: histVal >= 0 ? '#00E676' : '#FF5252'
    });
  }

  return { macd: macdResult, signal: signalResult, histogram: histogramResult };
}

export function calculateStochastic(candles = [], kPeriod = 14, dPeriod = 3) {
  if (!candles || candles.length < kPeriod + dPeriod) return { k: [], d: [] };

  const kValues = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    const currentClose = candles[i].close;
    const k = highest === lowest ? 50 : ((currentClose - lowest) / (highest - lowest)) * 100;
    kValues.push({ time: candles[i].time, close: k });
  }

  const dValues = calculateSMA(kValues, dPeriod);

  return {
    k: kValues.slice(dPeriod - 1).map(v => ({ time: v.time, value: Number(v.close.toFixed(2)) })),
    d: dValues.map(v => ({ time: v.time, value: Number(v.value.toFixed(2)) }))
  };
}

export function calculateStochRSI(candles = [], rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsi = calculateRSI(candles, rsiPeriod);
  if (rsi.length < stochPeriod + kPeriod + dPeriod) return { k: [], d: [] };

  const rawStoch = [];
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsi[j].value > highest) highest = rsi[j].value;
      if (rsi[j].value < lowest) lowest = rsi[j].value;
    }
    const currentRsi = rsi[i].value;
    const val = highest === lowest ? 50 : ((currentRsi - lowest) / (highest - lowest)) * 100;
    rawStoch.push({ time: rsi[i].time, close: val });
  }

  const k = calculateSMA(rawStoch, kPeriod);
  const d = calculateSMA(k.map(x => ({ time: x.time, close: x.value })), dPeriod);

  return {
    k: k.slice(dPeriod - 1).map(x => ({ time: x.time, value: Number(x.value.toFixed(2)) })),
    d: d.map(x => ({ time: x.time, value: Number(x.value.toFixed(2)) }))
  };
}

export function calculateCCI(candles = [], period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];

  for (let i = period - 1; i < candles.length; i++) {
    let tpSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      tpSum += (candles[j].high + candles[j].low + candles[j].close) / 3;
    }
    const meanTp = tpSum / period;
    const currentTp = (candles[i].high + candles[i].low + candles[i].close) / 3;

    let devSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      devSum += Math.abs(tp - meanTp);
    }
    const meanDev = devSum / period;
    const cci = meanDev === 0 ? 0 : (currentTp - meanTp) / (0.015 * meanDev);
    result.push({ time: candles[i].time, value: Number(cci.toFixed(2)) });
  }
  return result;
}

export function calculateMomentum(candles = [], period = 10) {
  if (!candles || candles.length <= period) return [];
  const result = [];
  for (let i = period; i < candles.length; i++) {
    const mom = candles[i].close - candles[i - period].close;
    result.push({ time: candles[i].time, value: Number(mom.toFixed(2)) });
  }
  return result;
}

export function calculateROC(candles = [], period = 12) {
  if (!candles || candles.length <= period) return [];
  const result = [];
  for (let i = period; i < candles.length; i++) {
    const prev = candles[i - period].close;
    const roc = prev > 0 ? ((candles[i].close - prev) / prev) * 100 : 0;
    result.push({ time: candles[i].time, value: Number(roc.toFixed(2)) });
  }
  return result;
}

export function calculateWilliamsR(candles = [], period = 14) {
  if (!candles || candles.length < period) return [];
  const result = [];
  for (let i = period - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    const wr = highest === lowest ? -50 : ((highest - candles[i].close) / (highest - lowest)) * -100;
    result.push({ time: candles[i].time, value: Number(wr.toFixed(2)) });
  }
  return result;
}

export function calculateAwesomeOscillator(candles = []) {
  if (!candles || candles.length < 34) return [];
  const medianPrices = candles.map(c => ({ time: c.time, close: (c.high + c.low) / 2 }));
  const sma5 = calculateSMA(medianPrices, 5);
  const sma34 = calculateSMA(medianPrices, 34);

  const result = [];
  const offset = 34 - 5;
  for (let i = 0; i < sma34.length; i++) {
    const ao = sma5[i + offset].value - sma34[i].value;
    const prevAo = i > 0 ? result[i - 1].value : ao;
    result.push({
      time: sma34[i].time,
      value: Number(ao.toFixed(2)),
      color: ao >= prevAo ? '#00E676' : '#FF5252'
    });
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. VOLATILITY INDICATORS
// ────────────────────────────────────────────────────────────────────────────

export function calculateBollingerBands(candles = [], period = 20, stdDevMult = 2) {
  if (!candles || candles.length < period) return { middle: [], upper: [], lower: [] };

  const middle = calculateSMA(candles, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < middle.length; i++) {
    const candleIdx = i + period - 1;
    const mean = middle[i].value;
    let sumSqDiff = 0;

    for (let j = candleIdx - period + 1; j <= candleIdx; j++) {
      const diff = candles[j].close - mean;
      sumSqDiff += diff * diff;
    }
    const stdDev = Math.sqrt(sumSqDiff / period);

    upper.push({ time: middle[i].time, value: Number((mean + stdDevMult * stdDev).toFixed(2)) });
    lower.push({ time: middle[i].time, value: Number((mean - stdDevMult * stdDev).toFixed(2)) });
  }

  return { middle, upper, lower };
}

export function calculateATR(candles = [], period = 14) {
  if (!candles || candles.length < period + 1) return [];

  const trList = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const prevC = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trList.push(tr);
  }

  const result = [];
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trList[i];
  atr = atr / period;
  result.push({ time: candles[period].time, value: Number(atr.toFixed(2)) });

  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trList[i]) / period;
    result.push({ time: candles[i].time, value: Number(atr.toFixed(2)) });
  }

  return result;
}

export function calculateADX(candles = [], period = 14) {
  if (!candles || candles.length < period * 2) return { adx: [], plusDI: [], minusDI: [] };

  const plusDM = [];
  const minusDM = [];
  const tr = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    const upMove = c.high - prev.high;
    const downMove = prev.low - c.low;

    plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);

    const trueRange = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    tr.push(trueRange);
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const dxList = [];
  const plusDIList = [];
  const minusDIList = [];

  let plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
  let minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
  let diSum = plusDI + minusDI;
  let dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

  dxList.push({ time: candles[period].time, value: dx });
  plusDIList.push({ time: candles[period].time, value: Number(plusDI.toFixed(2)) });
  minusDIList.push({ time: candles[period].time, value: Number(minusDI.toFixed(2)) });

  for (let i = period; i < tr.length; i++) {
    smoothTR = smoothTR - (smoothTR / period) + tr[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];

    plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    diSum = plusDI + minusDI;
    dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

    dxList.push({ time: candles[i + 1].time, value: dx });
    plusDIList.push({ time: candles[i + 1].time, value: Number(plusDI.toFixed(2)) });
    minusDIList.push({ time: candles[i + 1].time, value: Number(minusDI.toFixed(2)) });
  }

  if (dxList.length < period) return { adx: [], plusDI: plusDIList, minusDI: minusDIList };

  let adxSum = 0;
  for (let i = 0; i < period; i++) adxSum += dxList[i].value;
  let adx = adxSum / period;

  const adxResult = [{ time: dxList[period - 1].time, value: Number(adx.toFixed(2)) }];

  for (let i = period; i < dxList.length; i++) {
    adx = ((adx * (period - 1)) + dxList[i].value) / period;
    adxResult.push({ time: dxList[i].time, value: Number(adx.toFixed(2)) });
  }

  return {
    adx: adxResult,
    plusDI: plusDIList.slice(period - 1),
    minusDI: minusDIList.slice(period - 1)
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. VOLUME & ORDER FLOW
// ────────────────────────────────────────────────────────────────────────────

export function calculateVWAP(candles = []) {
  if (!candles || candles.length === 0) return [];
  const result = [];
  let cumTPV = 0;
  let cumVol = 0;
  let currentDay = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const candleDate = new Date(c.time * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    if (candleDate !== currentDay) {
      currentDay = candleDate;
      cumTPV = 0;
      cumVol = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume && c.volume > 0 ? c.volume : 1;
    cumTPV += typicalPrice * vol;
    cumVol += vol;

    const vwap = cumVol > 0 ? cumTPV / cumVol : typicalPrice;
    result.push({ time: c.time, value: Number(vwap.toFixed(2)) });
  }
  return result;
}

export function calculateOBV(candles = []) {
  if (!candles || candles.length === 0) return [];
  const result = [{ time: candles[0].time, value: 0 }];
  let obv = 0;

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const vol = current.volume || 1;
    if (current.close > prev.close) obv += vol;
    else if (current.close < prev.close) obv -= vol;
    result.push({ time: current.time, value: obv });
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. SMART MONEY CONCEPTS (SMC) & INSTITUTIONAL ORDER BLOCKS
// ────────────────────────────────────────────────────────────────────────────

export function detectOrderBlocks(candles = [], lookback = 200) {
  if (!candles || candles.length < 5) return { bullishOBs: [], bearishOBs: [] };
  const bullishOBs = [];
  const bearishOBs = [];
  const start = Math.max(0, candles.length - lookback);
  const latestTime = candles[candles.length - 1].time;

  for (let i = start; i < candles.length - 2; i++) {
    const c = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];

    // Bullish Order Block: Red/down candle followed by strong upward displacement
    const isBearishCandle = c.close < c.open || (c.close === c.open && c.close <= c.low + (c.high - c.low) * 0.3);
    const strongBullishDisplacement = (next1.close > c.high) || (next2.close > c.high && next1.close > c.open);

    if (isBearishCandle && strongBullishDisplacement) {
      let isMitigated = false;
      let mitigationTime = latestTime;

      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].close < c.low) {
          isMitigated = true;
          mitigationTime = candles[j].time;
          break;
        }
      }

      bullishOBs.push({
        id: `ob_bull_${c.time}`,
        time: c.time,
        startTime: c.time,
        endTime: mitigationTime,
        top: Number(c.high.toFixed(2)),
        bottom: Number(c.low.toFixed(2)),
        type: 'BULLISH_OB',
        isMitigated,
        color: isMitigated ? 'rgba(0, 230, 118, 0.12)' : 'rgba(0, 230, 118, 0.28)',
        borderColor: isMitigated ? 'rgba(0, 230, 118, 0.5)' : '#00E676'
      });
    }

    // Bearish Order Block: Green/up candle followed by strong downward displacement
    const isBullishCandle = c.close > c.open || (c.close === c.open && c.close >= c.high - (c.high - c.low) * 0.3);
    const strongBearishDisplacement = (next1.close < c.low) || (next2.close < c.low && next1.close < c.open);

    if (isBullishCandle && strongBearishDisplacement) {
      let isMitigated = false;
      let mitigationTime = latestTime;

      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].close > c.high) {
          isMitigated = true;
          mitigationTime = candles[j].time;
          break;
        }
      }

      bearishOBs.push({
        id: `ob_bear_${c.time}`,
        time: c.time,
        startTime: c.time,
        endTime: mitigationTime,
        top: Number(c.high.toFixed(2)),
        bottom: Number(c.low.toFixed(2)),
        type: 'BEARISH_OB',
        isMitigated,
        color: isMitigated ? 'rgba(255, 82, 82, 0.12)' : 'rgba(255, 82, 82, 0.28)',
        borderColor: isMitigated ? 'rgba(255, 82, 82, 0.5)' : '#FF5252'
      });
    }
  }

  return {
    bullishOBs: bullishOBs.slice(-15),
    bearishOBs: bearishOBs.slice(-15)
  };
}

export function detectFairValueGaps(candles = [], lookback = 80) {
  if (!candles || candles.length < 3) return { bullishFVGs: [], bearishFVGs: [] };
  const bullishFVGs = [];
  const bearishFVGs = [];
  const start = Math.max(0, candles.length - lookback);
  const latestTime = candles[candles.length - 1].time;

  for (let i = start; i < candles.length - 2; i++) {
    const c0 = candles[i];
    const c1 = candles[i + 1];
    const c2 = candles[i + 2];

    if (c2.low > c0.high) {
      bullishFVGs.push({
        id: `fvg_bull_${c1.time}`,
        time: c1.time,
        startTime: c1.time,
        endTime: latestTime,
        top: Number(c2.low.toFixed(2)),
        bottom: Number(c0.high.toFixed(2)),
        type: 'BULLISH_FVG',
        color: 'rgba(0, 212, 255, 0.2)',
        borderColor: '#00D4FF'
      });
    }

    if (c2.high < c0.low) {
      bearishFVGs.push({
        id: `fvg_bear_${c1.time}`,
        time: c1.time,
        startTime: c1.time,
        endTime: latestTime,
        top: Number(c0.low.toFixed(2)),
        bottom: Number(c2.high.toFixed(2)),
        type: 'BEARISH_FVG',
        color: 'rgba(255, 171, 0, 0.2)',
        borderColor: '#FFAB00'
      });
    }
  }

  return {
    bullishFVGs: bullishFVGs.slice(-8),
    bearishFVGs: bearishFVGs.slice(-8)
  };
}

export function detectBOSandCHOCH(candles = [], leftBars = 3, rightBars = 3) {
  if (!candles || candles.length < leftBars + rightBars + 5) return { structureLevels: [] };

  const swingHighs = [];
  const swingLows = [];

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) isHigh = false;
      if (candles[j].low <= current.low) isLow = false;
    }

    if (isHigh) swingHighs.push({ time: current.time, price: current.high, index: i });
    if (isLow) swingLows.push({ time: current.time, price: current.low, index: i });
  }

  const structureLevels = [];

  swingHighs.forEach(sh => {
    for (let i = sh.index + 1; i < candles.length; i++) {
      if (candles[i].close > sh.price) {
        structureLevels.push({
          id: `bos_bull_${sh.time}`,
          type: 'BOS',
          direction: 'BULLISH',
          price: Number(sh.price.toFixed(2)),
          startTime: sh.time,
          endTime: candles[i].time,
          label: 'BOS ▲',
          color: '#00E676'
        });
        break;
      }
    }
  });

  swingLows.forEach(sl => {
    for (let i = sl.index + 1; i < candles.length; i++) {
      if (candles[i].close < sl.price) {
        structureLevels.push({
          id: `bos_bear_${sl.time}`,
          type: 'BOS',
          direction: 'BEARISH',
          price: Number(sl.price.toFixed(2)),
          startTime: sl.time,
          endTime: candles[i].time,
          label: 'BOS ▼',
          color: '#FF5252'
        });
        break;
      }
    }
  });

  return { structureLevels: structureLevels.slice(-8) };
}

export function calculateORB(candles = [], rangeMinutes = 5) {
  if (!candles || candles.length === 0) return null;
  const minutes = Number(rangeMinutes) > 0 ? Number(rangeMinutes) : 5;
  const lastCandle = candles[candles.length - 1];

  // Group by current trading session day in IST (Asia/Kolkata)
  const todayStr = new Date(lastCandle.time * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
  const sessionCandles = candles.filter(c => new Date(c.time * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }));

  if (sessionCandles.length === 0) return null;

  const sessionStart = sessionCandles[0].time;
  const rangeSeconds = minutes * 60;
  
  // Find candles that fall within the initial rangeMinutes
  let orbCandles = sessionCandles.filter(c => (c.time - sessionStart) < rangeSeconds);
  if (orbCandles.length === 0) orbCandles = [sessionCandles[0]];

  let orbHigh = -Infinity;
  let orbLow = Infinity;
  orbCandles.forEach(c => {
    if (c.high > orbHigh) orbHigh = c.high;
    if (c.low < orbLow) orbLow = c.low;
  });

  const orbMid = (orbHigh + orbLow) / 2;

  // Check for Breakout after the opening range window
  let breakout = 'NONE';
  let breakoutTime = null;
  let breakoutPrice = null;

  const postOrbCandles = sessionCandles.filter(c => (c.time - sessionStart) >= rangeSeconds);
  for (const c of postOrbCandles) {
    if (c.close > orbHigh) {
      breakout = 'BULLISH';
      breakoutTime = c.time;
      breakoutPrice = c.close;
      break;
    } else if (c.close < orbLow) {
      breakout = 'BEARISH';
      breakoutTime = c.time;
      breakoutPrice = c.close;
      break;
    }
  }

  return {
    rangeMinutes: minutes,
    high: Number(orbHigh.toFixed(2)),
    low: Number(orbLow.toFixed(2)),
    mid: Number(orbMid.toFixed(2)),
    startTime: sessionStart,
    endTime: sessionCandles[sessionCandles.length - 1].time,
    breakout,
    breakoutTime,
    breakoutPrice
  };
}

export function calculateAutoTrendlines(candles = [], lookback = 80, swingLength = 3) {
  if (!candles || candles.length < lookback) return [];
  const slice = candles.slice(-lookback);
  const swingHighs = [];
  const swingLows = [];

  for (let i = swingLength; i < slice.length - swingLength; i++) {
    const c = slice[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - swingLength; j <= i + swingLength; j++) {
      if (j === i) continue;
      if (slice[j].high >= c.high) isHigh = false;
      if (slice[j].low <= c.low) isLow = false;
    }

    if (isHigh) swingHighs.push({ time: c.time, price: c.high, index: i });
    if (isLow) swingLows.push({ time: c.time, price: c.low, index: i });
  }

  const lines = [];

  if (swingHighs.length >= 2) {
    const p1 = swingHighs[swingHighs.length - 2];
    const p2 = swingHighs[swingHighs.length - 1];
    lines.push({
      id: 'auto_tl_res',
      type: 'RESISTANCE_TRENDLINE',
      p1: { time: p1.time, price: Number(p1.price.toFixed(2)) },
      p2: { time: p2.time, price: Number(p2.price.toFixed(2)) },
      color: '#FF5252',
      lineWidth: 2
    });
  }

  if (swingLows.length >= 2) {
    const p1 = swingLows[swingLows.length - 2];
    const p2 = swingLows[swingLows.length - 1];
    lines.push({
      id: 'auto_tl_sup',
      type: 'SUPPORT_TRENDLINE',
      p1: { time: p1.time, price: Number(p1.price.toFixed(2)) },
      p2: { time: p2.time, price: Number(p2.price.toFixed(2)) },
      color: '#00E676',
      lineWidth: 2
    });
  }

  return lines;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. CENTRAL PIVOT RANGE (CPR) & MULTI-MODE PIVOTS
// ────────────────────────────────────────────────────────────────────────────

export function calculateCPR(candles = []) {
  if (!candles || candles.length === 0) return { tc: [], p: [], bc: [], levels: null };

  const lastCandle = candles[candles.length - 1];
  let isDaily = false;
  if (candles.length > 1) {
    const spacing = candles[1].time - candles[0].time;
    if (spacing >= 86400) isDaily = true;
  }

  let H, L, C;
  if (isDaily) {
    const ref = candles[candles.length - 2] || lastCandle;
    H = ref.high;
    L = ref.low;
    C = ref.close;
  } else {
    const lastDate = new Date(lastCandle.time * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    let prevDayCandles = [];
    let prevDateStr = null;

    for (let i = candles.length - 1; i >= 0; i--) {
      const c = candles[i];
      const dateStr = new Date(c.time * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (dateStr !== lastDate) {
        if (prevDateStr === null) prevDateStr = dateStr;
        if (dateStr === prevDateStr) prevDayCandles.push(c);
        else break;
      }
    }

    if (prevDayCandles.length > 0) {
      H = Math.max(...prevDayCandles.map(c => c.high));
      L = Math.min(...prevDayCandles.map(c => c.low));
      C = prevDayCandles[0].close;
    } else {
      const ref = candles[candles.length - 2] || lastCandle;
      H = ref.high;
      L = ref.low;
      C = ref.close;
    }
  }

  const P = (H + L + C) / 3;
  const BC = (H + L) / 2;
  const TC = 2 * P - BC;
  const range = H - L;
  const R1 = 2 * P - L;
  const S1 = 2 * P - H;
  const R2 = P + range;
  const S2 = P - range;
  const R3 = H + 2 * (P - L);
  const S3 = L - 2 * (H - P);

  const topC = Math.max(TC, BC);
  const botC = Math.min(TC, BC);

  const pLine = candles.map(c => ({ time: c.time, value: Number(P.toFixed(2)) }));
  const tcLine = candles.map(c => ({ time: c.time, value: Number(topC.toFixed(2)) }));
  const bcLine = candles.map(c => ({ time: c.time, value: Number(botC.toFixed(2)) }));

  return {
    tc: tcLine,
    p: pLine,
    bc: bcLine,
    levels: {
      P: Number(P.toFixed(2)),
      TC: Number(topC.toFixed(2)),
      BC: Number(botC.toFixed(2)),
      R1: Number(R1.toFixed(2)),
      S1: Number(S1.toFixed(2)),
      R2: Number(R2.toFixed(2)),
      S2: Number(S2.toFixed(2)),
      R3: Number(R3.toFixed(2)),
      S3: Number(S3.toFixed(2)),
      cprWidth: Number(Math.abs(TC - BC).toFixed(2))
    }
  };
}

export function calculatePivotPoints(candles = [], mode = 'STANDARD') {
  if (!candles || candles.length === 0) return null;

  const lastCandle = candles[candles.length - 1];
  let isDaily = false;
  if (candles.length > 1) {
    const spacing = candles[1].time - candles[0].time;
    if (spacing >= 86400) isDaily = true;
  }

  let H, L, C, O;

  if (isDaily) {
    const ref = candles[candles.length - 2] || lastCandle;
    H = ref.high;
    L = ref.low;
    C = ref.close;
    O = ref.open;
  } else {
    const lastDate = new Date(lastCandle.time * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    let prevDayCandles = [];
    let prevDateStr = null;

    for (let i = candles.length - 1; i >= 0; i--) {
      const c = candles[i];
      const dateStr = new Date(c.time * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (dateStr !== lastDate) {
        if (prevDateStr === null) prevDateStr = dateStr;
        if (dateStr === prevDateStr) prevDayCandles.push(c);
        else break;
      }
    }

    if (prevDayCandles.length > 0) {
      H = Math.max(...prevDayCandles.map(c => c.high));
      L = Math.min(...prevDayCandles.map(c => c.low));
      C = prevDayCandles[0].close;
      O = prevDayCandles[prevDayCandles.length - 1].open;
    } else {
      const ref = candles[candles.length - 2] || lastCandle;
      H = ref.high;
      L = ref.low;
      C = ref.close;
      O = ref.open;
    }
  }

  const range = H - L;
  let P = (H + L + C) / 3;
  let R1 = 0, S1 = 0, R2 = 0, S2 = 0, R3 = 0, S3 = 0;

  const m = (mode || 'STANDARD').toUpperCase();

  if (m === 'FIBONACCI') {
    R1 = P + 0.382 * range;
    S1 = P - 0.382 * range;
    R2 = P + 0.618 * range;
    S2 = P - 0.618 * range;
    R3 = P + 1.000 * range;
    S3 = P - 1.000 * range;
  } else if (m === 'CAMARILLA') {
    R3 = C + range * 1.25 / 4;
    R2 = C + range * 1.166 / 4;
    R1 = C + range * 1.0833 / 4;
    S1 = C - range * 1.0833 / 4;
    S2 = C - range * 1.166 / 4;
    S3 = C - range * 1.25 / 4;
  } else if (m === 'WOODIE') {
    P = (H + L + 2 * O) / 4;
    R1 = 2 * P - L;
    S1 = 2 * P - H;
    R2 = P + range;
    S2 = P - range;
  } else if (m === 'DEMARK') {
    let X = 0;
    if (C < O) X = H + 2 * L + C;
    else if (C > O) X = 2 * H + L + C;
    else X = H + L + 2 * C;
    P = X / 4;
    R1 = X / 2 - L;
    S1 = X / 2 - H;
    R2 = P + range;
    S2 = P - range;
  } else {
    // STANDARD / CLASSIC
    R1 = 2 * P - L;
    S1 = 2 * P - H;
    R2 = P + range;
    S2 = P - range;
    R3 = H + 2 * (P - L);
    S3 = L - 2 * (H - P);
  }

  return {
    mode: m,
    P: Number(P.toFixed(2)),
    R1: Number(R1.toFixed(2)),
    S1: Number(S1.toFixed(2)),
    R2: Number(R2.toFixed(2)),
    S2: Number(S2.toFixed(2)),
    R3: Number(R3.toFixed(2)),
    S3: Number(S3.toFixed(2)),
    prevSessionOHLC: {
      high: Number(H.toFixed(2)),
      low: Number(L.toFixed(2)),
      close: Number(C.toFixed(2)),
      open: Number(O.toFixed(2))
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 7. COMPLETE INDICATOR REGISTRY (ALL 40+ INDICATORS)
// ────────────────────────────────────────────────────────────────────────────

export const INDICATOR_REGISTRY = [
  // ── TREND (OVERLAYS) ──
  { id: 'ema', name: 'Exponential Moving Average (EMA)', shortName: 'EMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#00D4FF', lineWidth: 2 } },
  { id: 'sma', name: 'Simple Moving Average (SMA)', shortName: 'SMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 50 }, defaultStyles: { color: '#FFD700', lineWidth: 2 } },
  { id: 'wma', name: 'Weighted Moving Average (WMA)', shortName: 'WMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#38BDF8', lineWidth: 2 } },
  { id: 'hma', name: 'Hull Moving Average (HMA)', shortName: 'HMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#F43F5E', lineWidth: 2 } },
  { id: 'vwma', name: 'Volume Weighted Moving Average (VWMA)', shortName: 'VWMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#A855F7', lineWidth: 2 } },
  { id: 'dema', name: 'Double Exponential Moving Average (DEMA)', shortName: 'DEMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#10B981', lineWidth: 2 } },
  { id: 'tema', name: 'Triple Exponential Moving Average (TEMA)', shortName: 'TEMA', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#F59E0B', lineWidth: 2 } },
  { id: 'supertrend', name: 'Supertrend', shortName: 'Supertrend', category: 'TREND', isOverlay: true, defaultInputs: { period: 10, multiplier: 3 }, defaultStyles: { upColor: '#00E676', downColor: '#FF5252', lineWidth: 2 } },
  { id: 'psar', name: 'Parabolic SAR', shortName: 'PSAR', category: 'TREND', isOverlay: true, defaultInputs: { step: 0.02, maxStep: 0.2 }, defaultStyles: { color: '#F59E0B', lineWidth: 2 } },
  { id: 'donchian', name: 'Donchian Channels', shortName: 'Donchian', category: 'TREND', isOverlay: true, defaultInputs: { period: 20 }, defaultStyles: { color: '#38BDF8', lineWidth: 1.5 } },
  { id: 'keltner', name: 'Keltner Channels', shortName: 'Keltner', category: 'TREND', isOverlay: true, defaultInputs: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 }, defaultStyles: { color: '#A78BFA', lineWidth: 1.5 } },

  // ── MOMENTUM (SEPARATE PANES) ──
  { id: 'rsi', name: 'Relative Strength Index (RSI)', shortName: 'RSI', category: 'MOMENTUM', isOverlay: false, defaultInputs: { period: 14, overbought: 70, oversold: 30 }, defaultStyles: { color: '#A855F7', lineWidth: 2 } },
  { id: 'macd', name: 'Moving Average Convergence Divergence (MACD)', shortName: 'MACD', category: 'MOMENTUM', isOverlay: false, defaultInputs: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, defaultStyles: { macdColor: '#00D4FF', signalColor: '#FFD700' } },
  { id: 'stoch', name: 'Stochastic Oscillator', shortName: 'Stoch', category: 'MOMENTUM', isOverlay: false, defaultInputs: { kPeriod: 14, dPeriod: 3 }, defaultStyles: { kColor: '#00E676', dColor: '#FF5252' } },
  { id: 'stoch_rsi', name: 'Stochastic RSI', shortName: 'Stoch RSI', category: 'MOMENTUM', isOverlay: false, defaultInputs: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 }, defaultStyles: { kColor: '#38BDF8', dColor: '#F59E0B' } },
  { id: 'cci', name: 'Commodity Channel Index (CCI)', shortName: 'CCI', category: 'MOMENTUM', isOverlay: false, defaultInputs: { period: 20 }, defaultStyles: { color: '#EC4899', lineWidth: 2 } },
  { id: 'momentum', name: 'Momentum', shortName: 'MOM', category: 'MOMENTUM', isOverlay: false, defaultInputs: { period: 10 }, defaultStyles: { color: '#00E676', lineWidth: 2 } },
  { id: 'roc', name: 'Rate of Change (ROC)', shortName: 'ROC', category: 'MOMENTUM', isOverlay: false, defaultInputs: { period: 12 }, defaultStyles: { color: '#F97316', lineWidth: 2 } },
  { id: 'williams_r', name: 'Williams %R', shortName: '%R', category: 'MOMENTUM', isOverlay: false, defaultInputs: { period: 14 }, defaultStyles: { color: '#06B6D4', lineWidth: 2 } },
  { id: 'awesome_osc', name: 'Awesome Oscillator (AO)', shortName: 'AO', category: 'MOMENTUM', isOverlay: false, defaultInputs: {}, defaultStyles: { upColor: '#00E676', downColor: '#FF5252' } },
  { id: 'adx', name: 'Average Directional Index (ADX)', shortName: 'ADX', category: 'MOMENTUM', isOverlay: false, defaultInputs: { period: 14 }, defaultStyles: { adxColor: '#00D4FF', plusColor: '#00E676', minusColor: '#FF5252' } },

  // ── VOLATILITY ──
  { id: 'bollinger', name: 'Bollinger Bands', shortName: 'BB', category: 'VOLATILITY', isOverlay: true, defaultInputs: { period: 20, stdDev: 2 }, defaultStyles: { middleColor: '#3B82F6', bandColor: '#60A5FA', lineWidth: 1.5 } },
  { id: 'atr', name: 'Average True Range (ATR)', shortName: 'ATR', category: 'VOLATILITY', isOverlay: false, defaultInputs: { period: 14 }, defaultStyles: { color: '#F97316', lineWidth: 2 } },

  // ── VOLUME / ORDER FLOW ──
  { id: 'vwap', name: 'Volume Weighted Average Price (VWAP)', shortName: 'VWAP', category: 'VOLUME', isOverlay: true, defaultInputs: {}, defaultStyles: { color: '#E11D48', lineWidth: 2 } },
  { id: 'obv', name: 'On-Balance Volume (OBV)', shortName: 'OBV', category: 'VOLUME', isOverlay: false, defaultInputs: {}, defaultStyles: { color: '#06B6D4', lineWidth: 2 } },

  // ── PRICE ACTION / SMC (OVERLAYS) ──
  { id: 'cpr', name: 'Central Pivot Range (CPR)', shortName: 'CPR', category: 'AUTO', isOverlay: true, defaultInputs: {}, defaultStyles: { tcColor: '#38BDF8', pColor: '#FACC15', bcColor: '#38BDF8', lineWidth: 2 } },
  { id: 'order_blocks', name: 'Order Block (OB) Detector', shortName: 'Order Blocks', category: 'SMC', isOverlay: true, defaultInputs: { lookback: 100 }, defaultStyles: { bullColor: 'rgba(0,230,118,0.22)', bearColor: 'rgba(255,82,82,0.22)' } },
  { id: 'fvg', name: 'Fair Value Gap (FVG)', shortName: 'FVG', category: 'SMC', isOverlay: true, defaultInputs: { lookback: 80 }, defaultStyles: { bullColor: 'rgba(0,212,255,0.2)', bearColor: 'rgba(255,171,0,0.2)' } },
  { id: 'bos_choch', name: 'Market Structure (BOS / CHOCH)', shortName: 'BOS / CHOCH', category: 'SMC', isOverlay: true, defaultInputs: { leftBars: 3, rightBars: 3 }, defaultStyles: { bullColor: '#00E676', bearColor: '#FF5252' } },
  { id: 'orb', name: 'Opening Range Breakout (ORB)', shortName: 'ORB', category: 'SMC', isOverlay: true, defaultInputs: { rangeMinutes: 5 }, defaultStyles: { color: '#FACC15', lineWidth: 1.5 } },

  // ── AUTO-ANALYSIS ──
  { id: 'auto_trendlines', name: 'Auto Trendline', shortName: 'Auto TL', category: 'AUTO', isOverlay: true, defaultInputs: { lookback: 80, swingLength: 3 }, defaultStyles: { resColor: '#FF5252', supColor: '#00E676', lineWidth: 2 } },
  { id: 'pivots', name: 'Multi-Mode Pivot Points (Standard/Fib/Camarilla/Woodie/DeMark)', shortName: 'Pivots', category: 'AUTO', isOverlay: true, defaultInputs: { mode: 'STANDARD' }, defaultStyles: { pColor: '#FACC15', rColor: '#FF5252', sColor: '#00E676' } }
];
