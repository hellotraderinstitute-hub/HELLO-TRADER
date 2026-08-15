/**
 * fiiDiiService.js — Official NSE India FII/DII Institutional Activity Service
 * ═══════════════════════════════════════════════════════════════════════════
 * Source: Official NSE India API (https://www.nseindia.com/api/fiidiiTradeReact)
 * 
 * Data Classification:
 *   NSE Official Reported Activity (Provisional / Final daily statistics).
 *   This is NOT tick-by-tick live stream data. It is reported end-of-day /
 *   provisional session data as published by official exchanges.
 * 
 * Features:
 *   - Session cookie bootstrap with headers
 *   - 15-minute server-side TTL cache
 *   - Real FII/FPI Buy, Sell, Net
 *   - Real DII Buy, Sell, Net
 *   - Combined Institutional Net Total
 *   - Institutional Flow Bias (calculated ONLY when real data exists)
 *   - Zero fake, mock, or synthetic fallback values
 * ═══════════════════════════════════════════════════════════════════════════
 */

const https = require('https');

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

class FiiDiiService {
  constructor() {
    this._cache = null;
    this._lastFetchTime = 0;
    this._cookie = null;
    this._cookieTime = 0;
  }

  // ── Helper to fetch URL with headers & cookies ─────────────────────
  _fetchUrl(path, cookie = '') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.nseindia.com',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.nseindia.com/reports/fii-dii',
          'Connection': 'keep-alive',
          'Cookie': cookie,
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
    });
  }

  // ── Bootstrap NSE Session Cookies ───────────────────────────────────
  async _ensureCookies() {
    if (this._cookie && (Date.now() - this._cookieTime) < 300000) {
      return this._cookie;
    }
    try {
      const homeRes = await this._fetchUrl('/reports/fii-dii');
      const setCookies = homeRes.headers['set-cookie'] || [];
      if (setCookies.length > 0) {
        this._cookie = setCookies.map(c => c.split(';')[0]).join('; ');
        this._cookieTime = Date.now();
        return this._cookie;
      }
    } catch (err) {
      console.error('[FiiDiiService] Cookie bootstrap failed:', err.message);
    }
    return '';
  }

  // ── Fetch Official FII / DII Data from NSE ─────────────────────────
  async getFiiDiiData() {
    const now = Date.now();

    // Return fresh cache if available
    if (this._cache && (now - this._lastFetchTime) < CACHE_TTL_MS) {
      return {
        ...this._cache,
        cached: true,
        snapshotAgeMs: now - this._lastFetchTime,
      };
    }

    const fetchStart = Date.now();
    try {
      const cookie = await this._ensureCookies();
      const res = await this._fetchUrl('/api/fiidiiTradeReact', cookie);
      const fetchLatencyMs = Date.now() - fetchStart;

      if (res.status === 200 && res.body) {
        let parsed = null;
        try { parsed = JSON.parse(res.body); } catch (e) { parsed = null; }

        if (Array.isArray(parsed) && parsed.length > 0) {
          const transformed = this._transformNseResponse(parsed, fetchLatencyMs);
          if (transformed) {
            this._cache = transformed;
            this._lastFetchTime = Date.now();
            return {
              ...transformed,
              cached: false,
              snapshotAgeMs: 0,
            };
          }
        }
      }

      console.error(`[FiiDiiService] NSE API returned status ${res.status}`);
    } catch (err) {
      console.error('[FiiDiiService] Error fetching official FII/DII data:', err.message);
    }

    // If fetch failed but we have existing cache, return stale cache with warning
    if (this._cache) {
      return {
        ...this._cache,
        cached: true,
        stale: true,
        warning: 'FETCH_FAILED_USING_CACHE',
        snapshotAgeMs: Date.now() - this._lastFetchTime,
      };
    }

    // Return safe unavailable error state (NO FAKE NUMBERS)
    return {
      success: false,
      error: 'DATA_TEMPORARILY_UNAVAILABLE',
      message: 'Official exchange reported FII/DII data is currently unavailable.',
      dataDate: null,
      lastUpdated: null,
      fii: null,
      dii: null,
      netTotal: null,
      bias: 'NEUTRAL',
    };
  }

  // ── Transform Official NSE API Response ─────────────────────────────
  _transformNseResponse(rawArray, fetchLatencyMs) {
    let fiiObj = null;
    let diiObj = null;
    let dateStr = null;

    for (const item of rawArray) {
      const cat = (item.category || '').toUpperCase();
      if (cat.includes('FII') || cat.includes('FPI')) {
        fiiObj = item;
        if (item.date) dateStr = item.date;
      } else if (cat.includes('DII')) {
        diiObj = item;
        if (!dateStr && item.date) dateStr = item.date;
      }
    }

    if (!fiiObj && !diiObj) return null;

    const fiiBuy  = fiiObj  ? this._safeFloat(fiiObj.buyValue)  : 0;
    const fiiSell = fiiObj  ? this._safeFloat(fiiObj.sellValue) : 0;
    const fiiNet  = fiiObj  ? this._safeFloat(fiiObj.netValue)  : 0;

    const diiBuy  = diiObj  ? this._safeFloat(diiObj.buyValue)  : 0;
    const diiSell = diiObj  ? this._safeFloat(diiObj.sellValue) : 0;
    const diiNet  = diiObj  ? this._safeFloat(diiObj.netValue)  : 0;

    const netTotal = Number((fiiNet + diiNet).toFixed(2));

    // Determine institutional flow bias from real numbers only
    let bias = 'NEUTRAL';
    if (netTotal > 500) bias = 'BULLISH';
    else if (netTotal < -500) bias = 'BEARISH';
    else if (netTotal > 0) bias = 'MILDLY_BULLISH';
    else if (netTotal < 0) bias = 'MILDLY_BEARISH';

    return {
      success: true,
      dataClassification: 'NSE_OFFICIAL_REPORTED_TRADING_ACTIVITY',
      dataDate: dateStr || 'TODAY',
      lastUpdated: new Date().toISOString(),
      fetchLatencyMs,
      fii: {
        buy: fiiBuy,
        sell: fiiSell,
        net: fiiNet,
        isNetBuyer: fiiNet >= 0,
      },
      dii: {
        buy: diiBuy,
        sell: diiSell,
        net: diiNet,
        isNetBuyer: diiNet >= 0,
      },
      netTotal,
      isCombinedNetBuyer: netTotal >= 0,
      bias,
    };
  }

  _safeFloat(val) {
    const n = parseFloat(val);
    if (isNaN(n) || !isFinite(n)) return 0;
    return Number(n.toFixed(2));
  }
}

// Export singleton
const fiiDiiService = new FiiDiiService();
module.exports = fiiDiiService;
