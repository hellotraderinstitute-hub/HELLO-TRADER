/**
 * technicalIndicators.js — Professional Technical Indicator Engine
 *
 * All calculations execute strictly on verified input OHLC candle arrays.
 * Zero synthetic or fake data is generated.
 */

// Helper: Extract arrays
export function getOHLCV(candles) {
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

// ── 1. TREND INDICATORS ───────────────────────────────────────────────

export function calculateSMA(candles, period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result.push({ time: candles[i].time, value: Number((sum / period).toFixed(2)) });
    }
  }
  return result;
}

export function calculateEMA(candles, period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];
  const k = 2 / (period + 1);

  let ema = 0;
  for (let i = 0; i < period; i++) {
    ema += candles[i].close;
  }
  ema = ema / period;
  result.push({ time: candles[period - 1].time, value: Number(ema.toFixed(2)) });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({ time: candles[i].time, value: Number(ema.toFixed(2)) });
  }
  return result;
}

export function calculateWMA(candles, period = 20) {
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

export function calculateVWAP(candles) {
  if (!candles || candles.length === 0) return [];
  const result = [];
  let cumTPV = 0;
  let cumVol = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumTPV += typicalPrice * vol;
    cumVol += vol;

    const vwap = cumVol > 0 ? cumTPV / cumVol : typicalPrice;
    result.push({ time: c.time, value: Number(vwap.toFixed(2)) });
  }
  return result;
}

export function calculateSupertrend(candles, period = 10, multiplier = 3) {
  if (!candles || candles.length < period) return { upper: [], lower: [], trend: [], line: [], upLine: [], downLine: [] };

  const atrList = calculateATR(candles, period);
  if (atrList.length === 0) return { upper: [], lower: [], trend: [], line: [], upLine: [], downLine: [] };

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
    line.push({ time: c.time, value: Number(currentVal.toFixed(2)), color: isUpTrend ? '#00E676' : '#FF5252' });

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

export function calculateParabolicSAR(candles, step = 0.02, maxStep = 0.2) {
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

// ── 2. MOMENTUM INDICATORS ────────────────────────────────────────────

export function calculateRSI(candles, period = 14) {
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

export function calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!candles || candles.length < slowPeriod + signalPeriod) return { macd: [], signal: [], histogram: [] };

  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  const macdLine = [];
  const slowStartIndex = slowPeriod - 1;
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
      color: histVal >= 0 ? 'rgba(0,230,57,0.6)' : 'rgba(255,180,171,0.6)'
    });
  }

  return { macd: macdResult, signal: signalResult, histogram: histogramResult };
}

export function calculateStochastic(candles, kPeriod = 14, dPeriod = 3) {
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

export function calculateCCI(candles, period = 20) {
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

// ── 3. VOLATILITY INDICATORS ──────────────────────────────────────────

export function calculateBollingerBands(candles, period = 20, stdDevMult = 2) {
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

export function calculateATR(candles, period = 14) {
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
  for (let i = 0; i < period; i++) {
    atr += trList[i];
  }
  atr = atr / period;
  result.push({ time: candles[period].time, value: Number(atr.toFixed(2)) });

  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trList[i]) / period;
    result.push({ time: candles[i].time, value: Number(atr.toFixed(2)) });
  }

  return result;
}

// ── 4. VOLUME & PRICE ACTION LEVELS ───────────────────────────────────

export function calculateVolumeMA(candles, period = 20) {
  if (!candles || candles.length < period) return [];
  const result = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += (candles[i].volume || 0);
    if (i >= period) {
      sum -= (candles[i - period].volume || 0);
    }
    if (i >= period - 1) {
      result.push({ time: candles[i].time, value: Number((sum / period).toFixed(0)) });
    }
  }
  return result;
}

export function calculateOBV(candles) {
  if (!candles || candles.length === 0) return [];
  const result = [{ time: candles[0].time, value: 0 }];
  let obv = 0;

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    if (current.close > prev.close) {
      obv += (current.volume || 0);
    } else if (current.close < prev.close) {
      obv -= (current.volume || 0);
    }
    result.push({ time: current.time, value: obv });
  }
  return result;
}

export function calculatePivots(candles) {
  if (!candles || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const p = (last.high + last.low + last.close) / 3;
  const r1 = 2 * p - last.low;
  const s1 = 2 * p - last.high;
  const r2 = p + (last.high - last.low);
  const s2 = p - (last.high - last.low);

  return {
    pivot: Number(p.toFixed(2)),
    r1: Number(r1.toFixed(2)),
    s1: Number(s1.toFixed(2)),
    r2: Number(r2.toFixed(2)),
    s2: Number(s2.toFixed(2))
  };
}

export function calculateCPR(candles) {
  if (!candles || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const pivot = (last.high + last.low + last.close) / 3;
  const bc = (last.high + last.low) / 2;
  const tc = 2 * pivot - bc;

  return {
    pivot: Number(pivot.toFixed(2)),
    bottomCentral: Number(Math.min(bc, tc).toFixed(2)),
    topCentral: Number(Math.max(bc, tc).toFixed(2))
  };
}
