/**
 * dhanOptionChainService.js — Authenticated DhanHQ v2 Option Chain Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Architecture:
 *   DhanHQ REST API → Backend-only service → Server-side snapshot cache
 *   → API response / WebSocket push to frontend
 * 
 * Rate Limiting:
 *   Official DhanHQ limit: 1 unique request per 3 seconds.
 *   This service enforces minimum 3s between requests per symbol/expiry pair.
 *   One cached snapshot serves ALL connected clients simultaneously.
 * 
 * Security:
 *   All credentials (access-token, client-id) remain strictly server-side.
 *   No broker name, API key, or provider identity is exposed to clients.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const https = require('https');

// ── Underlying Security Registry ──────────────────────────────────────
const UNDERLYING_REGISTRY = {
  'NIFTY':     { securityId: 13, segment: 'IDX_I',   lotSize: 65,  strikeStep: 50  },
  'BANKNIFTY': { securityId: 25, segment: 'IDX_I',   lotSize: 15,  strikeStep: 100 },
  'FINNIFTY':  { securityId: 27, segment: 'IDX_I',   lotSize: 65,  strikeStep: 50  },
  'SENSEX':    { securityId: 1,  segment: 'BSE_FNO', lotSize: 20,  strikeStep: 100 },
};

// ── Cache Configuration ───────────────────────────────────────────────
const MIN_POLL_INTERVAL_MS  = 3100;   // 3.1s (slightly above 3s API limit)
const STALE_THRESHOLD_MS    = 30000;  // 30s — after this, data is considered stale
const EXPIRY_CACHE_TTL_MS   = 300000; // 5 minutes for expiry list (changes infrequently)

class DhanOptionChainService {
  constructor() {
    // Cache: Map<cacheKey, { data, dataTime, lastUpdated, fetchLatencyMs, raw }>
    this._snapshotCache = new Map();
    // Last request timestamps per cache key to enforce rate limit
    this._lastRequestTime = new Map();
    // Expiry cache: Map<symbol, { expiries, lastUpdated }>
    this._expiryCache = new Map();
    // Credentials (loaded lazily from DB)
    this._clientId = null;
    this._accessToken = null;
    this._credentialsLoaded = false;
  }

  // ── Reload / Invalidate Credentials Cache ───────────────────────────
  reloadCredentials(clientId = null, accessToken = null) {
    if (clientId && accessToken) {
      this._clientId = clientId;
      this._accessToken = accessToken;
      this._credentialsLoaded = true;
    } else {
      this._credentialsLoaded = false;
      this._clientId = null;
      this._accessToken = null;
    }
    this._expiryCache.clear();
    this._snapshotCache.clear();
    this._lastRequestTime.clear();
    console.log('[OptionChainService] Credentials reloaded & in-memory caches flushed.');
  }

  // ── Load Credentials from Database ──────────────────────────────────
  async _ensureCredentials() {
    if (this._credentialsLoaded && this._clientId && this._accessToken) return true;
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const config = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
      await prisma.$disconnect();
      if (config && config.dhanClientId && config.dhanAccessToken) {
        const { decryptCredential } = require('./crypto');
        this._clientId = config.dhanClientId;
        this._accessToken = decryptCredential(config.dhanAccessToken);
        this._credentialsLoaded = true;
        return true;
      }
    } catch (err) {
      console.error('[OptionChainService] Failed to load credentials:', err.message);
    }
    return false;
  }

  // ── Rate-Limited HTTPS POST to DhanHQ ───────────────────────────────
  _dhanPost(path, body) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const options = {
        hostname: 'api.dhan.co',
        port: 443,
        path: `/v2${path}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this._accessToken,
          'client-id': this._clientId,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(payload);
      req.end();
    });
  }

  // ── Enforce Rate Limit ──────────────────────────────────────────────
  _canRequest(cacheKey) {
    const lastTime = this._lastRequestTime.get(cacheKey) || 0;
    return (Date.now() - lastTime) >= MIN_POLL_INTERVAL_MS;
  }

  _markRequested(cacheKey) {
    this._lastRequestTime.set(cacheKey, Date.now());
  }

  // ── Fetch Expiry List ───────────────────────────────────────────────
  async getExpiries(symbol) {
    const sym = String(symbol).toUpperCase();
    const registry = UNDERLYING_REGISTRY[sym];
    if (!registry) {
      return { success: false, error: 'UNKNOWN_UNDERLYING', expiries: [] };
    }

    // Check cache freshness
    const cached = this._expiryCache.get(sym);
    if (cached && (Date.now() - cached.lastUpdated) < EXPIRY_CACHE_TTL_MS) {
      return { success: true, symbol: sym, expiries: cached.expiries, cached: true, lastUpdated: new Date(cached.lastUpdated).toISOString() };
    }

    // Rate limit check
    const cacheKey = `expiry_${sym}`;
    if (!this._canRequest(cacheKey)) {
      if (cached) {
        return { success: true, symbol: sym, expiries: cached.expiries, cached: true, lastUpdated: new Date(cached.lastUpdated).toISOString() };
      }
      return { success: false, error: 'RATE_LIMITED', expiries: [] };
    }

    // Ensure credentials
    const hasCredentials = await this._ensureCredentials();
    if (!hasCredentials) {
      return { success: false, error: 'CREDENTIALS_UNAVAILABLE', expiries: [] };
    }

    this._markRequested(cacheKey);
    const fetchStart = Date.now();

    try {
      const res = await this._dhanPost('/optionchain/expirylist', {
        UnderlyingScrip: registry.securityId,
        UnderlyingSeg: registry.segment,
      });

      const fetchLatencyMs = Date.now() - fetchStart;

      if (res.status === 200 && res.body && Array.isArray(res.body.data)) {
        const expiries = res.body.data; // Array of "YYYY-MM-DD" strings
        this._expiryCache.set(sym, { expiries, lastUpdated: Date.now() });
        return {
          success: true,
          symbol: sym,
          expiries,
          cached: false,
          fetchLatencyMs,
          lastUpdated: new Date().toISOString(),
        };
      }

      return { success: false, error: 'API_ERROR', message: res.body?.message || 'Unknown error', expiries: [] };
    } catch (err) {
      console.error(`[OptionChainService] Expiry fetch error for ${sym}:`, err.message);
      if (cached) {
        return { success: true, symbol: sym, expiries: cached.expiries, cached: true, lastUpdated: new Date(cached.lastUpdated).toISOString(), warning: 'STALE_CACHE' };
      }
      return { success: false, error: 'FETCH_FAILED', message: err.message, expiries: [] };
    }
  }

  // ── Fetch Option Chain Snapshot ─────────────────────────────────────
  async getOptionChain(symbol, expiry) {
    const sym = String(symbol).toUpperCase();
    const registry = UNDERLYING_REGISTRY[sym];
    if (!registry) {
      return { success: false, error: 'UNKNOWN_UNDERLYING' };
    }
    if (!expiry) {
      return { success: false, error: 'EXPIRY_REQUIRED' };
    }

    const cacheKey = `oc_${sym}_${expiry}`;

    // Check cache — return immediately if fresh
    const cached = this._snapshotCache.get(cacheKey);
    if (cached) {
      const ageMs = Date.now() - cached.lastUpdated;
      const isStale = ageMs > STALE_THRESHOLD_MS;

      // If cache is within rate-limit window, always return it
      if (!this._canRequest(cacheKey)) {
        return {
          success: !isStale,
          symbol: sym,
          expiry,
          spotPrice: cached.spotPrice,
          contracts: isStale ? null : cached.contracts,
          dataTime: cached.dataTime,
          lastUpdated: new Date(cached.lastUpdated).toISOString(),
          fetchLatencyMs: cached.fetchLatencyMs,
          snapshotAgeMs: ageMs,
          cached: true,
          stale: isStale,
          error: isStale ? 'SNAPSHOT_STALE' : undefined,
        };
      }

      // If fresh enough and within 3s window, return cached
      if (ageMs < MIN_POLL_INTERVAL_MS) {
        return {
          success: true,
          symbol: sym,
          expiry,
          spotPrice: cached.spotPrice,
          contracts: cached.contracts,
          dataTime: cached.dataTime,
          lastUpdated: new Date(cached.lastUpdated).toISOString(),
          fetchLatencyMs: cached.fetchLatencyMs,
          snapshotAgeMs: ageMs,
          cached: true,
          stale: false,
        };
      }
    }

    // Ensure credentials
    const hasCredentials = await this._ensureCredentials();
    if (!hasCredentials) {
      if (cached && (Date.now() - cached.lastUpdated) < STALE_THRESHOLD_MS) {
        return {
          success: true, symbol: sym, expiry,
          spotPrice: cached.spotPrice, contracts: cached.contracts,
          dataTime: cached.dataTime,
          lastUpdated: new Date(cached.lastUpdated).toISOString(),
          fetchLatencyMs: cached.fetchLatencyMs,
          snapshotAgeMs: Date.now() - cached.lastUpdated,
          cached: true, stale: false, warning: 'CREDENTIALS_UNAVAILABLE_USING_CACHE',
        };
      }
      return { success: false, error: 'CREDENTIALS_UNAVAILABLE' };
    }

    this._markRequested(cacheKey);
    const fetchStart = Date.now();

    try {
      const res = await this._dhanPost('/optionchain', {
        UnderlyingScrip: registry.securityId,
        UnderlyingSeg: registry.segment,
        Expiry: expiry,
      });

      const fetchLatencyMs = Date.now() - fetchStart;

      if (res.status === 200 && res.body && res.body.data && res.body.data.oc) {
        const rawOc = res.body.data.oc;
        const spotPrice = res.body.data.last_price || 0;
        const dataTime = new Date().toISOString();

        // Transform raw DhanHQ response into unified strike contract array
        const contracts = this._transformOptionChain(rawOc, spotPrice, registry.strikeStep);

        // Store in cache
        const snapshot = {
          contracts,
          spotPrice,
          dataTime,
          lastUpdated: Date.now(),
          fetchLatencyMs,
        };
        this._snapshotCache.set(cacheKey, snapshot);

        return {
          success: true,
          symbol: sym,
          expiry,
          spotPrice,
          contracts,
          dataTime,
          lastUpdated: new Date(snapshot.lastUpdated).toISOString(),
          fetchLatencyMs,
          snapshotAgeMs: 0,
          cached: false,
          stale: false,
          totalStrikes: contracts.length,
        };
      }

      // API returned but with error/empty data
      const errorMsg = res.body?.message || res.body?.remarks?.error_message || 'Unknown API error';
      console.error(`[OptionChainService] API error for ${sym}/${expiry}:`, errorMsg);

      // Return stale cache if available
      if (cached && (Date.now() - cached.lastUpdated) < STALE_THRESHOLD_MS) {
        return {
          success: true, symbol: sym, expiry,
          spotPrice: cached.spotPrice, contracts: cached.contracts,
          dataTime: cached.dataTime,
          lastUpdated: new Date(cached.lastUpdated).toISOString(),
          fetchLatencyMs: cached.fetchLatencyMs,
          snapshotAgeMs: Date.now() - cached.lastUpdated,
          cached: true, stale: false, warning: 'API_ERROR_USING_CACHE',
        };
      }

      return { success: false, error: 'API_ERROR', message: errorMsg };
    } catch (err) {
      console.error(`[OptionChainService] Fetch error for ${sym}/${expiry}:`, err.message);

      if (cached && (Date.now() - cached.lastUpdated) < STALE_THRESHOLD_MS) {
        return {
          success: true, symbol: sym, expiry,
          spotPrice: cached.spotPrice, contracts: cached.contracts,
          dataTime: cached.dataTime,
          lastUpdated: new Date(cached.lastUpdated).toISOString(),
          fetchLatencyMs: cached.fetchLatencyMs,
          snapshotAgeMs: Date.now() - cached.lastUpdated,
          cached: true, stale: false, warning: 'FETCH_ERROR_USING_CACHE',
        };
      }

      return { success: false, error: 'FETCH_FAILED', message: err.message };
    }
  }

  // ── Transform DhanHQ Raw Option Chain into Unified Strike Array ─────
  _transformOptionChain(rawOc, spotPrice, strikeStep) {
    const contracts = [];

    for (const [strikeStr, strikeData] of Object.entries(rawOc)) {
      const strike = parseFloat(strikeStr);
      if (isNaN(strike)) continue;

      const ce = strikeData.ce || {};
      const pe = strikeData.pe || {};

      // Only include strikes that have at least some data
      const hasData = (ce.last_price > 0 || pe.last_price > 0 || ce.oi > 0 || pe.oi > 0);
      if (!hasData) continue;

      const ceGreeks = ce.greeks || {};
      const peGreeks = pe.greeks || {};

      contracts.push({
        strike,
        isAtm: Math.abs(strike - spotPrice) <= (strikeStep / 2),

        // CE (Call) Data
        ceLtp:       this._safeNum(ce.last_price),
        ceOI:        this._safeInt(ce.oi),
        ceOiChange:  this._safeInt(ce.oi_change || ce.oiChange || 0),
        ceVolume:    this._safeInt(ce.volume || ce.previous_volume || 0),
        ceIv:        this._safeNum(ce.implied_volatility, 2),
        ceBidPrice:  this._safeNum(ce.bid_price || ce.best_bid_price),
        ceAskPrice:  this._safeNum(ce.ask_price || ce.best_ask_price),
        ceDelta:     this._safeNum(ceGreeks.delta, 3),
        ceGamma:     this._safeNum(ceGreeks.gamma, 4),
        ceTheta:     this._safeNum(ceGreeks.theta, 2),
        ceVega:      this._safeNum(ceGreeks.vega, 2),
        ceSecurityId: ce.security_id ? String(ce.security_id) : '',

        // PE (Put) Data
        peLtp:       this._safeNum(pe.last_price),
        peOI:        this._safeInt(pe.oi),
        peOiChange:  this._safeInt(pe.oi_change || pe.oiChange || 0),
        peVolume:    this._safeInt(pe.volume || pe.previous_volume || 0),
        peIv:        this._safeNum(pe.implied_volatility, 2),
        peBidPrice:  this._safeNum(pe.bid_price || pe.best_bid_price),
        peAskPrice:  this._safeNum(pe.ask_price || pe.best_ask_price),
        peDelta:     this._safeNum(peGreeks.delta, 3),
        peGamma:     this._safeNum(peGreeks.gamma, 4),
        peTheta:     this._safeNum(peGreeks.theta, 2),
        peVega:      this._safeNum(peGreeks.vega, 2),
        peSecurityId: pe.security_id ? String(pe.security_id) : '',
      });
    }

    // Sort by strike price ascending
    contracts.sort((a, b) => a.strike - b.strike);
    return contracts;
  }

  // ── Numeric Safety Helpers ──────────────────────────────────────────
  _safeNum(val, decimals = 2) {
    const n = parseFloat(val);
    if (isNaN(n) || !isFinite(n)) return 0;
    return Number(n.toFixed(decimals));
  }

  _safeInt(val) {
    const n = parseInt(val, 10);
    if (isNaN(n) || !isFinite(n)) return 0;
    return n;
  }

  // ── Service Health Diagnostics ──────────────────────────────────────
  getServiceStatus() {
    const snapshots = {};
    for (const [key, snap] of this._snapshotCache.entries()) {
      snapshots[key] = {
        totalStrikes: snap.contracts?.length || 0,
        spotPrice: snap.spotPrice,
        dataTime: snap.dataTime,
        lastUpdated: new Date(snap.lastUpdated).toISOString(),
        fetchLatencyMs: snap.fetchLatencyMs,
        snapshotAgeMs: Date.now() - snap.lastUpdated,
        stale: (Date.now() - snap.lastUpdated) > STALE_THRESHOLD_MS,
      };
    }
    return {
      credentialsLoaded: this._credentialsLoaded,
      cachedSnapshots: snapshots,
      expiryCache: Object.fromEntries(
        [...this._expiryCache.entries()].map(([k, v]) => [k, { count: v.expiries?.length || 0, lastUpdated: new Date(v.lastUpdated).toISOString() }])
      ),
    };
  }
}

// Export singleton
const dhanOptionChainService = new DhanOptionChainService();
module.exports = dhanOptionChainService;
