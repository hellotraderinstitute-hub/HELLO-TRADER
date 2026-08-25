/**
 * aiLab.js — Hello Trader AI Lab REST Router
 *
 * PUBLIC / AUTHENTICATED endpoints for contextual AI Trading Assistant & Stock Intelligence Engine.
 * Dynamic symbol resolution — ZERO hardcoded fallbacks to RELIANCE or NIFTY.
 */

const express = require('express');
const router = express.Router();
const { processAiLabQuery } = require('../services/aiLab/contextEngine');
const { generateCoachInsights } = require('../services/aiLab/aiCoach');

const { requireEntitlement } = require('../services/entitlementService');

// ─── POST /api/ai-lab/chat ─────────────────────────────────────
router.post('/chat', requireEntitlement('AI_LAB'), async (req, res) => {
  try {
    const reqId = req.headers['x-ai-lab-request-id'] || 'req_' + Date.now();
    const userId = req.user.id;
    const { userQuery, activeMode = 'ANALYSE', conversationHistory = [] } = req.body;

    if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
      return res.status(400).json({ success: false, message: 'userQuery is required.' });
    }

    const result = await processAiLabQuery({
      userId,
      userQuery,
      activeMode,
      conversationHistory
    });

    // Extract top-level metadata from stockDossier if present
    const stockDossier = result.toolResults?.stockDossier;
    const profile = stockDossier?.profile || {};
    const tech = stockDossier?.technicals || {};
    const marketStatusInfo = stockDossier?.marketStatus || { isOpen: false, status: 'CLOSED', statusLabel: '🟡 MARKET CLOSED — Analysis based on latest available session data' };

    const resolvedSymbol = stockDossier?.symbol || null;
    const resolvedType = profile.assetType || tech.assetType || (result.intent === 'STOCK_RESEARCH' ? 'EQUITY' : 'UNKNOWN');

    console.log(`[AI-LAB BACKEND ${reqId}] QUERY="${userQuery}" | INTENT="${result.intent}" | SYMBOL="${resolvedSymbol}" | TYPE="${resolvedType}"`);

    res.json({
      success: result.intent !== 'INVALID_SYMBOL' && !!stockDossier,
      requestId: reqId,
      query: userQuery,
      mode: result.mode,
      intent: result.intent,
      asset: resolvedSymbol || userQuery.trim().toUpperCase(),
      assetType: resolvedType,
      symbol: resolvedSymbol || userQuery.trim().toUpperCase(),
      exchange: profile.exchange || (resolvedSymbol ? 'NSE / BSE' : '—'),
      name: profile.name || resolvedSymbol || userQuery.trim().toUpperCase(),
      price: tech.price || 0,
      change: tech.changePercent ? `${tech.changePercent}%` : '0.00%',
      marketStatus: marketStatusInfo.status,
      marketStatusInfo: marketStatusInfo,
      dataTimestamp: tech.timestamp || new Date().toISOString(),
      dataQuality: tech.dataStatus || 'VERIFIED',
      stockDossier: stockDossier || null,
      toolsUsed: result.toolsUsed,
      toolResults: result.toolResults,
      reply: result.answer,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[ai-lab/chat]', err);
    res.status(500).json({ success: false, message: 'AI Lab processing error: ' + err.message });
  }
});

// ─── GET /api/ai-lab/coach-insights ───────────────────────────
router.get('/coach-insights', requireEntitlement('AI_LAB'), async (req, res) => {
  try {
    const userId = req.user.id;
    const insights = await generateCoachInsights(userId);
    res.json({ success: true, insights });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
