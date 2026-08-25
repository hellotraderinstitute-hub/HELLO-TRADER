/**
 * optionsConfig.js — Macroeconomic Parameters for Black-Scholes Greeks Engine
 */
module.exports = {
  // RBI 91-Day Treasury Bill Annualized Risk-Free Yield (6.75%)
  RISK_FREE_RATE: 0.0675,

  // Nifty 50 Index Annualized Dividend Yield (1.2%)
  DIVIDEND_YIELD: 0.012,

  // Default Expiry Days Fallback if metadata missing
  DEFAULT_EXPIRY_DAYS: 5,
};
