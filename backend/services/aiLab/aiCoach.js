/**
 * aiCoach.js — Automated Performance & Discipline Insights Engine
 */

const aiTools = require('./aiTools');

async function generateCoachInsights(userId) {
  const perf = await aiTools.getUserPerformance(userId);
  const strat = await aiTools.getStrategyPerformance(userId);
  const risk = await aiTools.getRiskMetrics(userId);
  const trades = await aiTools.getUserTrades(userId, 10);

  const insights = [
    {
      category: 'STRENGTH',
      title: 'Top Strategy Identified',
      message: `Your best performance comes from ${strat.bestStrategy.name} with a ${strat.bestStrategy.winRate} win rate and ₹${strat.bestStrategy.totalPnL} profit.`,
      action: 'Prioritize this setup over random discretionary trades.'
    },
    {
      category: 'WARNING',
      title: 'Strategy Underperformance',
      message: `${strat.worstStrategy.name} currently has a ${strat.worstStrategy.winRate} win rate resulting in ₹${Math.abs(strat.worstStrategy.totalPnL)} loss.`,
      action: 'Pause or backtest this setup before deploying live capital.'
    },
    {
      category: 'RISK_RULE',
      title: 'Position Sizing Discipline',
      message: `Recommended max risk per trade for your balance (₹${risk.accountBalance.toLocaleString()}) is ₹${risk.recommendedRiskPerTrade.toLocaleString()} (${risk.maxDailyRiskPercent}).`,
      action: 'Do not exceed 1-2 NIFTY lots on high volatility days.'
    }
  ];

  return {
    userId,
    generatedAt: new Date().toISOString(),
    winRate: perf.winRate,
    totalPnL: perf.totalPnL,
    insights,
  };
}

module.exports = { generateCoachInsights };
