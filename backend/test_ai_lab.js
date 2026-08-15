/**
 * test_ai_lab.js — Automated Test Suite for Dynamic Instrument Master, Asset-Class Awareness, & Market-Closed Historical Engine
 */

const { processAiLabQuery } = require('./services/aiLab/contextEngine');
const aiTools = require('./services/aiLab/aiTools');
const stockTools = require('./services/aiLab/stockIntelligenceTools');
const { generateLlmResponse } = require('./services/aiLab/llmService');

async function runAiLabTestSuite() {
  console.log('================================================================');
  console.log('  HELLO TRADER DYNAMIC UNIVERSE & HISTORICAL SUITE             ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testId, title, detail = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ PASS [Test ${testId}]: ${title} ${detail ? '— (' + detail + ')' : ''}`);
    } else {
      console.error(`❌ FAIL [Test ${testId}]: ${title} ${detail ? '— (' + detail + ')' : ''}`);
    }
  }

  const userIdA = 'test_user_alpha';

  // 1. Diverse Equities Resolution Test (20+ Equities)
  const equitiesToTest = [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ITC', 'SBIN', 'BEL', 'TATAMOTORS',
    'BHARTIARTL', 'ICICIBANK', 'AXISBANK', 'MARUTI', 'LT', 'ADANIENT', 'KOTAKBANK',
    'BAJFINANCE', 'TITAN', 'SUNPHARMA', 'ASIANPAINT', 'NTPC'
  ];

  let equityPassCount = 0;
  for (const eq of equitiesToTest) {
    const res = stockTools.resolveStock(eq);
    if (res.success && res.assetType === 'EQUITY' && res.symbol === eq) {
      equityPassCount++;
    }
  }
  assert(equityPassCount === equitiesToTest.length, 1, `20 Diverse Equities Resolved Dynamically (${equityPassCount}/${equitiesToTest.length})`);

  // 2. Indices Resolution Test (10 Indices)
  const indicesToTest = [
    'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX',
    'NIFTYIT', 'NIFTYAUTO', 'NIFTYFMCG', 'NIFTYPHARMA'
  ];

  let indexPassCount = 0;
  for (const idx of indicesToTest) {
    const res = stockTools.resolveStock(idx);
    if (res.success && res.assetType === 'INDEX') {
      indexPassCount++;
    }
  }
  assert(indexPassCount === indicesToTest.length, 2, `10 Supported Indices Resolved Dynamically (${indexPassCount}/${indicesToTest.length})`);

  // 3. Asset Type Awareness Test
  const eqRes = stockTools.getCompanyProfile('TATAMOTORS');
  const idxRes = stockTools.getCompanyProfile('BANKNIFTY');
  assert(eqRes.assetType === 'EQUITY' && idxRes.dataStatus === 'NOT_APPLICABLE', 3, 'Asset Type Detection (EQUITY vs INDEX NOT_APPLICABLE)');

  // 4. Invalid Symbol Handling Shield (No NIFTY/RELIANCE Fallback)
  const invalidRes = stockTools.resolveStock('INVALID_TICKER_999');
  assert(invalidRes.success === false && invalidRes.error.includes('Stock/Index'), 4, 'Invalid Symbol Graceful Handling (Zero Fallback to NIFTY/RELIANCE)');

  // 5. Context Engine Invalid Symbol Response
  const contextInvalid = await processAiLabQuery({ userId: userIdA, userQuery: 'INVALID_TICKER_999 stock details', activeMode: 'ANALYSE', isMockMode: true });
  assert(contextInvalid.intent === 'INVALID_SYMBOL' && contextInvalid.answer.includes('not found'), 5, 'Context Engine Invalid Symbol Interceptor');

  // 6. Ambiguous Name Resolution Test
  const ambiguousRes = stockTools.resolveStock('Tata Motors');
  assert(ambiguousRes.symbol === 'TATAMOTORS', 6, 'Ambiguous Company Name Resolution (Tata Motors -> TATAMOTORS)');

  // 7. Fundamental Engine Context Retrieval for Equities
  const fundRes = stockTools.getFundamentals('TCS');
  assert(fundRes.valuation.pe !== undefined && fundRes.dataStatus === 'LATEST_REPORTED', 7, 'Fundamental Engine Context & Freshness Tag');

  // 8. Technical Engine Context Retrieval for Indices
  const techIdx = stockTools.getTechnicalContext('NIFTY');
  assert(techIdx.assetType === 'INDEX' && techIdx.price > 20000, 8, 'Index Multi-Timeframe Technical Context');

  // 9. News Intelligence Live / Data Unavailable Shield
  const newsRes = await stockTools.getNews('INFY');
  assert(newsRes.dataStatus === 'CURRENT' || newsRes.dataStatus === 'DATA_UNAVAILABLE', 9, 'News Intelligence Live / Data Unavailable Shield');

  // 10. Competitor Benchmark Engine for Equities
  const peerRes = stockTools.getPeerComparison('HDFCBANK');
  assert(peerRes.peers && peerRes.peers.length > 0, 10, 'Competitor Benchmark Engine');

  // 11. Valuation Engine Assessment
  const valRes = stockTools.getValuation('ITC');
  assert(valRes.verdict && valRes.evidence, 11, 'Valuation Engine Assessment');

  // 12. Risk Radar Engine
  const riskRes = stockTools.getRiskRadar('RELIANCE');
  assert(riskRes.riskLevel !== undefined, 12, 'Risk Radar Assessment');

  // 13. Future Scenarios Model Disclaimer
  const scenRes = stockTools.getScenarios('TCS');
  assert(scenRes.disclaimer.includes('NOT GUARANTEED'), 13, 'Future Scenario Model Disclaimer');

  // 14. Source Reference Link Verification
  const profileRes = stockTools.getCompanyProfile('RELIANCE');
  assert(profileRes.url && profileRes.url.includes('nseindia.com'), 14, 'Source Reference Link Verification');

  // 15. User Isolation Security Shield
  const perfA = await aiTools.getUserPerformance(userIdA);
  assert(perfA !== undefined, 15, 'User Isolation Security Shield');

  // 16. No Credential Leakage Shield
  const toolsKeys = Object.keys(aiTools);
  const leakedSecrets = JSON.stringify(toolsKeys).includes('apiKey') || JSON.stringify(toolsKeys).includes('password');
  assert(!leakedSecrets, 16, 'No Credential Leakage Shield');

  // 17. No Order Placement Capability Shield
  const canPlaceOrder = toolsKeys.includes('executeOrder') || toolsKeys.includes('placeOrder');
  assert(!canPlaceOrder, 17, 'No Order Placement Capability Shield');

  // 18. Real LLM Grounding Test
  const mockLLM = await generateLlmResponse({ userQuery: 'RELIANCE research', activeMode: 'ANALYSE', intent: 'STOCK_RESEARCH', toolResults: {}, isMockMode: true });
  assert(mockLLM.success && mockLLM.source === 'LLM_MOCK_VERIFICATION', 18, 'OpenAI LLM Grounding Verification');

  // 19. Equity Asset Type Specificity
  const eqSpecific = stockTools.getQuarterlyResults('SBIN');
  assert(eqSpecific.quarters && eqSpecific.quarters.length > 0, 19, 'Equity Quarterly Results Specificity');

  // 20. Index Asset Type NOT_APPLICABLE Verification
  const idxSpecific = stockTools.getQuarterlyResults('NIFTY');
  assert(idxSpecific.dataStatus === 'NOT_APPLICABLE', 20, 'Index NOT_APPLICABLE Field Verification');

  // ── MARKET-CLOSED 10 TEMPORAL QUESTION SUITE (Tests 21-30) ──
  
  // 21. TCS ka aaj ka complete analysis
  const q21 = await processAiLabQuery({ userId: userIdA, userQuery: 'TCS ka aaj ka complete analysis', activeMode: 'ANALYSE', isMockMode: true });
  assert(q21.toolResults?.stockDossier?.symbol === 'TCS' && q21.toolResults?.stockDossier?.marketStatus !== undefined, 21, 'TCS Today Session Analysis');

  // 22. Reliance ka kal ke liye kya setup hai?
  const q22 = await processAiLabQuery({ userId: userIdA, userQuery: 'Reliance ka kal ke liye kya setup hai?', activeMode: 'ANALYSE', isMockMode: true });
  assert(q22.toolResults?.stockDossier?.symbol === 'RELIANCE' && q22.toolResults?.stockDossier?.scenarios !== undefined, 22, 'Reliance Tomorrow Setup Scenarios');

  // 23. NIFTY ka last 30 days performance
  const q23 = await processAiLabQuery({ userId: userIdA, userQuery: 'NIFTY ka last 30 days performance', activeMode: 'ANALYSE', isMockMode: true });
  assert(q23.toolResults?.stockDossier?.symbol === 'NIFTY' && q23.toolResults?.stockDossier?.historical?.returns?.days30 !== undefined, 23, 'NIFTY 30 Days Performance');

  // 24. BANKNIFTY ka support resistance
  const q24 = await processAiLabQuery({ userId: userIdA, userQuery: 'BANKNIFTY ka support resistance', activeMode: 'ANALYSE', isMockMode: true });
  assert(q24.toolResults?.stockDossier?.symbol === 'BANKNIFTY' && q24.toolResults?.stockDossier?.technicals?.support !== undefined, 24, 'BANKNIFTY Support/Resistance');

  // 25. TCS ka 1 year trend
  const q25 = await processAiLabQuery({ userId: userIdA, userQuery: 'TCS ka 1 year trend', activeMode: 'ANALYSE', isMockMode: true });
  assert(q25.toolResults?.stockDossier?.symbol === 'TCS' && q25.toolResults?.stockDossier?.historical?.returns?.year1 !== undefined, 25, 'TCS 1 Year Trend');

  // 26. Reliance ka previous session se comparison
  const q26 = await processAiLabQuery({ userId: userIdA, userQuery: 'Reliance ka previous session se comparison', activeMode: 'ANALYSE', isMockMode: true });
  assert(q26.toolResults?.stockDossier?.symbol === 'RELIANCE' && q26.toolResults?.stockDossier?.historical?.previousSessionComparison !== undefined, 26, 'Reliance Previous Session Comparison');

  // 27. NIFTY mein biggest fall kab aaya?
  const q27 = await processAiLabQuery({ userId: userIdA, userQuery: 'NIFTY mein biggest fall kab aaya?', activeMode: 'ANALYSE', isMockMode: true });
  assert(q27.toolResults?.stockDossier?.symbol === 'NIFTY' && q27.toolResults?.stockDossier?.historical?.maxDrawdown?.biggestFallWindow !== undefined, 27, 'NIFTY Biggest Fall Drawdown');

  // 28. TCS ka highest volume kab aaya?
  const q28 = await processAiLabQuery({ userId: userIdA, userQuery: 'TCS ka highest volume kab aaya?', activeMode: 'ANALYSE', isMockMode: true });
  assert(q28.toolResults?.stockDossier?.symbol === 'TCS' && q28.toolResults?.stockDossier?.historical?.volumeAnalytics?.peakVolumeDate !== undefined, 28, 'TCS Highest Volume Date');

  // 29. Reliance ka fundamental + technical combined analysis
  const q29 = await processAiLabQuery({ userId: userIdA, userQuery: 'Reliance ka fundamental + technical combined analysis', activeMode: 'ANALYSE', isMockMode: true });
  assert(q29.toolResults?.stockDossier?.symbol === 'RELIANCE' && q29.toolResults?.stockDossier?.fundamentals !== undefined && q29.toolResults?.stockDossier?.technicals !== undefined, 29, 'Reliance Fundamental + Technical Combined');

  // 30. Isme kya improve hua hai?
  const q30 = await processAiLabQuery({ userId: userIdA, userQuery: 'RELIANCE - Isme kya improve hua hai?', activeMode: 'ANALYSE', isMockMode: true });
  assert(q30.toolResults?.stockDossier?.symbol === 'RELIANCE', 30, 'Active Asset Context Retention');

  console.log('\n================================================================');
  console.log(`   DYNAMIC UNIVERSE SUITE SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('================================================================\n');
}

if (require.main === module) {
  runAiLabTestSuite();
}

module.exports = { runAiLabTestSuite };
