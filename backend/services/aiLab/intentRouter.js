/**
 * intentRouter.js — Dynamic Stock & Index Intent Classification Engine
 *
 * Automatically routes ANY valid stock or index query to STOCK_RESEARCH.
 * Zero hardcoded symbol whitelists.
 */

const stockTools = require('./stockIntelligenceTools');

function classifyIntent(text = '', activeMode = 'ANALYSE') {
  const query = text.toLowerCase().trim();
  const rawUpper = text.toUpperCase().trim();

  // 1. Dynamic Stock / Index Symbol Resolution Check
  const rawWords = rawUpper.replace(/[^A-Z0-9_]/g, ' ').split(/\s+/);
  const ignoreWords = ['STOCK', 'ANALYSE', 'ANALYSIS', 'KARO', 'KYA', 'HAI', 'TODAY', 'LATEST', 'DETAILS', 'REPORT', 'ISKA', 'MERI', 'MERA', 'TEST', 'COMPLETE', 'RISK', 'TARGET', 'SHOW', 'GET'];
  const potentialTicker = rawWords.find(w => w.length >= 2 && !ignoreWords.includes(w)) || rawUpper;

  const resolved = stockTools.resolveStock(potentialTicker) || stockTools.resolveStock(text);

  if (resolved && resolved.success) {
    return 'STOCK_RESEARCH';
  }

  // 2. Specific Functional Intent Filters
  if (query.includes('webhook') || query.includes('broker') || query.includes('tradingview') || query.includes('fail') || query.includes('rejected')) {
    return 'ALGO';
  }

  if (query.includes('capital') || query.includes('position size') || query.includes('quantity') || query.includes('lot') || query.includes('risk') || query.includes('stop loss') || query.includes('sl')) {
    return 'RISK';
  }

  if (query.includes('trade') || query.includes('galti') || query.includes('loss') || query.includes('mistake') || query.includes('kharab') || query.includes('aaj ke trades')) {
    return 'TRADE_ANALYSIS';
  }

  if (query.includes('strategy') || query.includes('setup') || query.includes('trigger') || query.includes('improve')) {
    return 'STRATEGY';
  }

  if (query.includes('win rate') || query.includes('pnl') || query.includes('p&l') || query.includes('profit') || query.includes('drawdown') || query.includes('comparison') || query.includes('performance')) {
    return 'USER_PERFORMANCE';
  }

  if (query.includes('fvg') || query.includes('kya hota') || query.includes('what is') || query.includes('explain') || query.includes('order block')) {
    return 'EDUCATION';
  }

  if (query.includes('rsi') || query.includes('ema') || query.includes('vwap') || query.includes('smc')) {
    return 'TECHNICAL';
  }

  if (query.includes('position') || query.includes('portfolio') || query.includes('holdings')) {
    return 'PORTFOLIO';
  }

  return 'GENERAL';
}

module.exports = { classifyIntent };
