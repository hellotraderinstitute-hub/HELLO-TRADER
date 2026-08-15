/**
 * blackScholesEngine.js — Pure Deterministic Black-Scholes Engine & Implied Volatility (IV) Solver
 */

const RISK_FREE_RATE = 0.0675; // 6.75% RBI T-Bill Yield
const DIVIDEND_YIELD = 0.012;  // 1.2% Nifty 50 Dividend Yield

// Standard Normal Cumulative Distribution Function N(x) using Abramowitz & Stegun approximation
function CND(x) {
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const L = Math.abs(x);
  const k = 1.0 / (1.0 + 0.2316419 * L);
  let cnd = 1.0 - 1.0 / Math.sqrt(2 * Math.PI) * Math.exp(-L * L / 2) *
            (a1 * k + a2 * Math.pow(k, 2) + a3 * Math.pow(k, 3) + a4 * Math.pow(k, 4) + a5 * Math.pow(k, 5));

  if (x < 0) return 1.0 - cnd;
  return cnd;
}

// Standard Normal Probability Density Function N'(x)
function ND(x) {
  return (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

// Calculate Black-Scholes Option Price
export function calculateBSPrice(S, K, T, r, q, sigma, isCall) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (isCall) {
    return S * Math.exp(-q * T) * CND(d1) - K * Math.exp(-r * T) * CND(d2);
  } else {
    return K * Math.exp(-r * T) * CND(-d2) - S * Math.exp(-q * T) * CND(-d1);
  }
}

// Newton-Raphson Numerical Solver for Implied Volatility (IV)
export function calculateIV(marketPrice, S, K, T, isCall, r = RISK_FREE_RATE, q = DIVIDEND_YIELD) {
  if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return 18.5; // Default IV baseline if price unavailable

  let sigma = 0.20; // Initial guess (20% IV)
  const maxIter = 100;
  const tolerance = 1e-4;

  for (let i = 0; i < maxIter; i++) {
    const price = calculateBSPrice(S, K, T, r, q, sigma, isCall);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const vega = S * Math.exp(-q * T) * Math.sqrt(T) * ND(d1);

    const diff = price - marketPrice;
    if (Math.abs(diff) < tolerance) break;
    if (Math.abs(vega) < 1e-6) break;

    sigma = sigma - diff / vega;
    if (sigma <= 0.001) sigma = 0.001;
    if (sigma > 3.0) sigma = 3.0;
  }

  return Number((sigma * 100).toFixed(2));
}

// Calculate Full Option Greeks Suite (Delta, Gamma, Theta, Vega)
export function calculateOptionGreeks(S, K, T, IV, isCall, r = RISK_FREE_RATE, q = DIVIDEND_YIELD) {
  if (S <= 0 || K <= 0 || T <= 0 || IV <= 0) {
    return { delta: 0.50, gamma: 0.001, theta: -2.50, vega: 12.50 };
  }

  const sigma = IV / 100;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nD1 = ND(d1);
  const cndD1 = CND(d1);
  const cndD2 = CND(d2);

  // 1. Delta
  let delta = 0;
  if (isCall) {
    delta = Math.exp(-q * T) * cndD1;
  } else {
    delta = -Math.exp(-q * T) * CND(-d1);
  }

  // 2. Gamma
  const gamma = (Math.exp(-q * T) * nD1) / (S * sigma * sqrtT);

  // 3. Theta (Per Calendar Day)
  let theta = 0;
  const term1 = -(S * Math.exp(-q * T) * nD1 * sigma) / (2 * sqrtT);
  if (isCall) {
    theta = term1 - r * K * Math.exp(-r * T) * cndD2 + q * S * Math.exp(-q * T) * cndD1;
  } else {
    theta = term1 + r * K * Math.exp(-r * T) * CND(-d2) - q * S * Math.exp(-q * T) * CND(-d1);
  }
  theta = theta / 365; // Annualized to Per-Day decay

  // 4. Vega (Per 1% Volatility Change)
  const vega = (S * Math.exp(-q * T) * sqrtT * nD1) / 100;

  return {
    delta: Number(delta.toFixed(3)),
    gamma: Number(gamma.toFixed(4)),
    theta: Number(theta.toFixed(2)),
    vega: Number(vega.toFixed(2))
  };
}
