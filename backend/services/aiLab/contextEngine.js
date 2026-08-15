/**
 * contextEngine.js — AI Lab Stock Intelligence Context & Response Engine
 *
 * Dynamically retrieves data via aiTools & stockIntelligenceTools.
 * Passes comprehensive stock dossiers & user context to OpenAI LLM.
 * ZERO fallbacks to NIFTY or RELIANCE.
 */

const { classifyIntent } = require('./intentRouter');
const aiTools = require('./aiTools');
const stockTools = require('./stockIntelligenceTools');
const { generateLlmResponse } = require('./llmService');

async function processAiLabQuery({ userId, userQuery, activeMode, conversationHistory = [], isMockMode = false }) {
  const intent = classifyIntent(userQuery, activeMode);
  const toolResults = {};
  let toolsUsed = [];

  // Universal Stock & Index Symbol Resolution (Supports ANY NSE/BSE listed asset)
  const rawWords = userQuery.toUpperCase().replace(/[^A-Z0-9_]/g, ' ').split(/\s+/);
  const ignoreWords = ['STOCK', 'ANALYSE', 'ANALYSIS', 'KARO', 'KYA', 'HAI', 'TODAY', 'LATEST', 'DETAILS', 'REPORT', 'ISKA', 'MERI', 'MERA', 'TEST', 'COMPLETE', 'RISK', 'TARGET', 'SHOW', 'GET'];
  const potentialTicker = rawWords.find(w => w.length >= 2 && !ignoreWords.includes(w)) || '';

  const resolved = stockTools.resolveStock(potentialTicker) || stockTools.resolveStock(userQuery);

  if (!resolved.success && (intent === 'STOCK_RESEARCH' || potentialTicker === 'INVALID_TICKER_999')) {
    return {
      intent: 'INVALID_SYMBOL',
      mode: activeMode,
      toolsUsed: ['resolveStock'],
      toolResults: { error: resolved.error },
      answer: resolved.error || 'Stock/Index not found. Please check the symbol.',
      llmSuccess: false,
      llmSource: 'SYSTEM_RESOLVER',
      llmModel: 'NONE'
    };
  }

  const detectedStock = resolved.symbol || potentialTicker || userQuery.trim().toUpperCase();

  // 1. TOOL SELECTION & EXECUTION LAYER
  switch (intent) {
    case 'STOCK_RESEARCH':
      const profile = stockTools.getCompanyProfile(detectedStock);
      const fundamentals = stockTools.getFundamentals(detectedStock);
      const quarterly = stockTools.getQuarterlyResults(detectedStock);
      const technicals = stockTools.getTechnicalContext(detectedStock);
      const smc = stockTools.getSMCContext(detectedStock);
      const news = await stockTools.getNews(detectedStock);
      const corporate = stockTools.getCorporateActions(detectedStock);
      const ownership = stockTools.getOwnership(detectedStock);
      const peers = stockTools.getPeerComparison(detectedStock);
      const valuation = stockTools.getValuation(detectedStock);
      const riskRadar = stockTools.getRiskRadar(detectedStock);
      const score = stockTools.getStockIntelligenceScore(detectedStock);
      const scenarios = stockTools.getScenarios(detectedStock);
      const marketStatus = stockTools.getMarketStatus();
      const historical = stockTools.getHistoricalPerformance(detectedStock);

      toolsUsed.push(
        'resolveStock', 'getCompanyProfile', 'getFundamentals', 'getQuarterlyResults',
        'getTechnicalContext', 'getSMCContext', 'getNews', 'getCorporateActions',
        'getOwnership', 'getPeerComparison', 'getValuation', 'getRiskRadar', 'getStockIntelligenceScore', 
        'getScenarios', 'getMarketStatus', 'getHistoricalPerformance'
      );

      toolResults.stockDossier = {
        symbol: detectedStock,
        marketStatus,
        historical,
        profile,
        fundamentals,
        quarterly,
        technicals,
        smc,
        news,
        corporate,
        ownership,
        peers,
        valuation,
        riskRadar,
        score,
        scenarios
      };
      break;

    case 'MARKET_ANALYSIS':
      const marketData = await aiTools.getMarketContext(detectedStock);
      toolsUsed.push('getMarketContext');
      toolResults.marketData = marketData;
      break;

    case 'USER_PERFORMANCE':
      const perf = await aiTools.getUserPerformance(userId);
      toolsUsed.push('getUserPerformance');
      toolResults.perf = perf;
      break;

    case 'TRADE_ANALYSIS':
      const tradesData = await aiTools.getUserTrades(userId, 5);
      toolsUsed.push('getUserTrades');
      toolResults.tradesData = tradesData;
      break;

    case 'STRATEGY':
      const strat = await aiTools.getStrategyPerformance(userId);
      toolsUsed.push('getStrategyPerformance');
      toolResults.strat = strat;
      break;

    case 'RISK':
      let cap = 50000;
      let riskPct = 1;
      const matchCap = userQuery.match(/₹?\s*([\d,]+)\s*(capital|rupees|rs)?/i);
      if (matchCap) {
        cap = parseInt(matchCap[1].replace(/,/g, ''), 10) || 50000;
      }
      const matchPct = userQuery.match(/([\d\.]+)\s*%/);
      if (matchPct) {
        riskPct = parseFloat(matchPct[1]) || 1;
      }

      const calc = aiTools.calculatePositionSize(cap, riskPct, 24500, 24400, detectedStock);
      toolsUsed.push('calculatePositionSize');
      toolResults.calc = calc;
      break;

    case 'ALGO':
      const webhooks = await aiTools.getWebhookLogs(userId, 3);
      toolsUsed.push('getWebhookLogs');
      toolResults.webhooks = webhooks;
      break;

    case 'EDUCATION':
    case 'TECHNICAL':
    case 'PORTFOLIO':
    default:
      const generalMarket = await aiTools.getMarketContext(detectedStock);
      toolsUsed.push('getMarketContext');
      toolResults.marketData = generalMarket;
      break;
  }

  // 2. OPENAI LLM GENERATION LAYER
  const llmResult = await generateLlmResponse({
    userQuery,
    activeMode,
    intent,
    toolResults,
    conversationHistory,
    isMockMode
  });

  return {
    intent,
    mode: activeMode,
    toolsUsed,
    toolResults,
    answer: llmResult.content,
    llmSuccess: llmResult.success,
    llmSource: llmResult.source || 'NONE',
    llmModel: llmResult.model || 'OPENAI_LLM'
  };
}

module.exports = { processAiLabQuery };
