/**
 * smdeOptionEngine.js — Deterministic Option Analytics Engine (PCR, Max Pain, Build-up Tags)
 */
import { calculateIV, calculateOptionGreeks } from './blackScholesEngine.js';

// ── 1. Calculate Put-Call Ratio (PCR) ────────────────────────────────
export function calculatePCR(strikes) {
  if (!strikes || strikes.length === 0) return { pcr: null, sentiment: '—', totalCeOI: 0, totalPeOI: 0 };

  let totalCeOI = 0;
  let totalPeOI = 0;

  strikes.forEach(s => {
    totalCeOI += s.ceOI || 0;
    totalPeOI += s.peOI || 0;
  });

  if (totalCeOI === 0) return { pcr: null, sentiment: '—', totalCeOI, totalPeOI };

  const pcr = Number((totalPeOI / totalCeOI).toFixed(2));
  const sentiment = pcr >= 1.2 ? 'BULLISH' : pcr <= 0.8 ? 'BEARISH' : 'NEUTRAL';

  return { pcr, sentiment, totalCeOI, totalPeOI };
}

// ── 2. Calculate Max Pain Strike Price ────────────────────────────────
export function calculateMaxPain(strikes) {
  if (!strikes || strikes.length === 0) return { maxPainStrike: null, minPayout: 0 };

  let minPayout = Infinity;
  let maxPainStrike = strikes[0].strike;

  strikes.forEach(target => {
    const evalPrice = target.strike;
    let totalPayout = 0;

    strikes.forEach(s => {
      // Call Seller Payout if spot > strike
      if (evalPrice > s.strike) {
        totalPayout += (evalPrice - s.strike) * (s.ceOI || 0);
      }
      // Put Seller Payout if spot < strike
      if (evalPrice < s.strike) {
        totalPayout += (s.strike - evalPrice) * (s.peOI || 0);
      }
    });

    if (totalPayout < minPayout) {
      minPayout = totalPayout;
      maxPainStrike = evalPrice;
    }
  });

  return { maxPainStrike, minPayout };
}

// ── 3. Classify Option Build-up Tag ──────────────────────────────────
export function classifyBuildUp(ceOiChange, peOiChange) {
  if (peOiChange > ceOiChange && peOiChange > 1000) {
    return { tag: 'Put Writing', color: '🟢', type: 'BULLISH' };
  } else if (ceOiChange > peOiChange && ceOiChange > 1000) {
    return { tag: 'Call Writing', color: '🔴', type: 'BEARISH' };
  } else if (peOiChange < 0 && ceOiChange > 0) {
    return { tag: 'Put Unwinding', color: '🔴', type: 'BEARISH' };
  } else if (ceOiChange < 0 && peOiChange > 0) {
    return { tag: 'Call Unwinding', color: '🟢', type: 'BULLISH' };
  }
  return { tag: 'Neutral', color: '🟡', type: 'NEUTRAL' };
}

// ── 4. Process Full Strike Chain & Compute Greeks Suite ──────────────
export function processOptionChainGrid(spotPrice, strikes, daysToExpiry = 5) {
  if (!strikes || strikes.length === 0) return [];
  const T = Math.max(0.001, daysToExpiry / 365);

  return strikes.map(s => {
    const K = s.strike;

    // CE Metrics
    const ceIv = calculateIV(s.ceLtp, spotPrice, K, T, true);
    const ceGreeks = calculateOptionGreeks(spotPrice, K, T, ceIv, true);

    // PE Metrics
    const peIv = calculateIV(s.peLtp, spotPrice, K, T, false);
    const peGreeks = calculateOptionGreeks(spotPrice, K, T, peIv, false);

    const buildUp = classifyBuildUp(s.ceOiChange || 0, s.peOiChange || 0);

    return {
      ...s,
      ceIv,
      ceDelta: ceGreeks.delta,
      ceGamma: ceGreeks.gamma,
      ceTheta: ceGreeks.theta,
      ceVega: ceGreeks.vega,
      peIv,
      peDelta: peGreeks.delta,
      peGamma: peGreeks.gamma,
      peTheta: peGreeks.theta,
      peVega: peGreeks.vega,
      buildUp
    };
  });
}

// ── 5. Generate AI Option Summary ────────────────────────────────────
export function generateAIOptionSummary(spotPrice, strikes, pcrData, maxPainData) {
  // Return safe empty state when no real data exists
  if (!strikes || strikes.length === 0 || pcrData.pcr === null || maxPainData.maxPainStrike === null) {
    return { bias: '—', confidence: null, reasons: [] };
  }

  const pcr = pcrData.pcr;
  const maxPain = maxPainData.maxPainStrike;
  const isBullish = pcr >= 1.0;

  let score = 50;
  const reasons = [];

  if (pcr >= 1.2) {
    score += 15;
    reasons.push(`PCR at ${pcr} indicates heavy Put Writing (Bullish Demand Floor)`);
  } else if (pcr <= 0.8) {
    score -= 15;
    reasons.push(`PCR at ${pcr} indicates heavy Call Writing (Bearish Resistance)`);
  } else {
    reasons.push(`PCR at ${pcr} indicates Balanced Neutral Option Flow`);
  }

  if (maxPain >= spotPrice) {
    score += 10;
    reasons.push(`Max Pain Strike (₹${maxPain}) is higher than Spot (₹${spotPrice})`);
  } else {
    score -= 8;
    reasons.push(`Max Pain Strike (₹${maxPain}) is below Spot (₹${spotPrice})`);
  }

  const freshPutWriting = strikes.some(s => (s.peOiChange || 0) > 5000);
  if (freshPutWriting) {
    score += 10;
    reasons.push('Fresh Put Writing detected at key support strikes');
  }

  const callUnwinding = strikes.some(s => (s.ceOiChange || 0) < -2000);
  if (callUnwinding) {
    score += 8;
    reasons.push('Call Unwinding detected (Sellers closing resistance positions)');
  }

  const confidence = Math.min(96, Math.max(35, score));
  const bias = confidence >= 60 ? 'BULLISH' : confidence <= 45 ? 'BEARISH' : 'NEUTRAL';

  return {
    bias,
    confidence,
    reasons
  };
}
