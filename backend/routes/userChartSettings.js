/**
 * userChartSettings.js
 * ─────────────────────────────────────────────────────────────
 * Permanent per-user chart configuration & indicator persistence API.
 * - Stores active indicator instance IDs, custom input parameters, styles, and visibility.
 * - Stores chart layout (sub-pane sizes, chart type, theme).
 * - Per-symbol and per-timeframe overriding with GLOBAL fallbacks.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── GET /api/user/chart-settings ─────────────────────────────
// Query parameters: symbol (e.g. 'NIFTY'), timeframe (e.g. '5m')
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const symbol = (req.query.symbol || 'GLOBAL').toUpperCase();
    const timeframe = req.query.timeframe || 'GLOBAL';

    // 1. Try exact symbol + timeframe match
    let setting = await prisma.userChartSetting.findUnique({
      where: {
        userId_symbol_timeframe: {
          userId,
          symbol,
          timeframe
        }
      }
    });

    // 2. Fallback to symbol + GLOBAL timeframe match
    if (!setting && timeframe !== 'GLOBAL') {
      setting = await prisma.userChartSetting.findUnique({
        where: {
          userId_symbol_timeframe: {
            userId,
            symbol,
            timeframe: 'GLOBAL'
          }
        }
      });
    }

    // 3. Fallback to GLOBAL symbol + GLOBAL timeframe match
    if (!setting) {
      setting = await prisma.userChartSetting.findUnique({
        where: {
          userId_symbol_timeframe: {
            userId,
            symbol: 'GLOBAL',
            timeframe: 'GLOBAL'
          }
        }
      });
    }

    if (!setting) {
      return res.json({
        success: true,
        hasSettings: false,
        settings: null,
        indicators: [],
        layout: null
      });
    }

    let parsedIndicators = [];
    let parsedLayout = null;

    try {
      if (setting.indicatorsJson) parsedIndicators = JSON.parse(setting.indicatorsJson);
    } catch (_) {}

    try {
      if (setting.layoutJson) parsedLayout = JSON.parse(setting.layoutJson);
    } catch (_) {}

    res.json({
      success: true,
      hasSettings: true,
      symbol: setting.symbol,
      timeframe: setting.timeframe,
      indicators: parsedIndicators,
      layout: parsedLayout,
      updatedAt: setting.updatedAt
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/user/chart-settings ────────────────────────────
// Body: { symbol, timeframe, indicators, layout }
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      symbol = 'GLOBAL',
      timeframe = 'GLOBAL',
      indicators = [],
      layout = null
    } = req.body || {};

    const cleanSymbol = (symbol || 'GLOBAL').toUpperCase();
    const cleanTimeframe = timeframe || 'GLOBAL';
    const indicatorsJson = JSON.stringify(Array.isArray(indicators) ? indicators : []);
    const layoutJson = layout ? JSON.stringify(layout) : null;

    const setting = await prisma.userChartSetting.upsert({
      where: {
        userId_symbol_timeframe: {
          userId,
          symbol: cleanSymbol,
          timeframe: cleanTimeframe
        }
      },
      update: {
        indicatorsJson,
        layoutJson,
        updatedAt: new Date()
      },
      create: {
        userId,
        symbol: cleanSymbol,
        timeframe: cleanTimeframe,
        indicatorsJson,
        layoutJson
      }
    });

    res.json({
      success: true,
      message: 'Chart settings saved successfully',
      id: setting.id,
      symbol: setting.symbol,
      timeframe: setting.timeframe
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/user/chart-settings ──────────────────────────
// Reset user chart settings
router.delete('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { symbol, timeframe } = req.query || {};

    if (symbol && timeframe) {
      await prisma.userChartSetting.deleteMany({
        where: {
          userId,
          symbol: symbol.toUpperCase(),
          timeframe
        }
      });
    } else {
      await prisma.userChartSetting.deleteMany({
        where: { userId }
      });
    }

    res.json({ success: true, message: 'Chart settings reset to default.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
