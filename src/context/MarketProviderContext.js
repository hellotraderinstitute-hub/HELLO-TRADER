'use client';

/**
 * MarketProviderContext.js
 * ──────────────────────────────────────────────────────────────────
 * Unified Market Data Provider Layer
 *
 * Flow:
 *   Frontend → MarketProviderContext → [Active Adapter]
 *            ↓                             ↓
 *     Binance / Dhan / Breeze / Upstox / TrueData
 *            ↓
 *       WebSocket Tick Stream
 *            ↓
 *   TradingDesk | OptionChain | Scanner | AILab
 * ──────────────────────────────────────────────────────────────────
 */

import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, useMemo
} from 'react';
import { BinanceAdapter, BINANCE_SYMBOLS } from '../providers/BinanceAdapter';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const socket = io(API_URL.replace('/api', ''), { autoConnect: true });

// ─── Provider IDs ─────────────────────────────────────────────────
export const PROVIDERS = {
  BINANCE:  { id: 'BINANCE',  label: 'Binance',   flag: '🔶', type: 'crypto',  requiresAuth: false },
  DHAN:     { id: 'DHAN',     label: 'Dhan HQ',   flag: '🇮🇳', type: 'indian',  requiresAuth: true  },
  BREEZE:   { id: 'BREEZE',   label: 'ICICI Breeze', flag: '🏦', type: 'indian', requiresAuth: true  },
  UPSTOX:   { id: 'UPSTOX',  label: 'Upstox',    flag: '📈', type: 'indian',  requiresAuth: true  },
  TRUEDATA: { id: 'TRUEDATA', label: 'TrueData',  flag: '📊', type: 'indian',  requiresAuth: true  },
};

// ─── Default symbols based on Market Mode ─────────────────────────
export const INDIAN_TICKERS = {
  'NIFTY':     { symbol: 'NIFTY',     display: 'NIFTY 50',    name: 'NSE Nifty 50',    type: 'index',  exchange: 'IDX_I', securityId: '13', price: 24580.40, open: 24580.40, change: 0, changeAmt: 0, high: 24650.00, low: 24500.00, volume: '—', provider: 'DHAN' },
  'BANKNIFTY': { symbol: 'BANKNIFTY', display: 'BANKNIFTY',   name: 'Nifty Bank',      type: 'index',  exchange: 'IDX_I', securityId: '25', price: 52410.15, open: 52410.15, change: 0, changeAmt: 0, high: 52600.00, low: 52200.00, volume: '—', provider: 'DHAN' },
  'FINNIFTY':  { symbol: 'FINNIFTY',  display: 'FIN NIFTY',   name: 'Nifty Financial', type: 'index',  exchange: 'IDX_I', securityId: '27', price: 23680.50, open: 23680.50, change: 0, changeAmt: 0, high: 23800.00, low: 23550.00, volume: '—', provider: 'DHAN' },
  'SENSEX':    { symbol: 'SENSEX',    display: 'SENSEX',      name: 'BSE Sensex',      type: 'index',  exchange: 'IDX_I', securityId: '1',  price: 80550.20, open: 80550.20, change: 0, changeAmt: 0, high: 80800.00, low: 80300.00, volume: '—', provider: 'DHAN' },
  'RELIANCE':  { symbol: 'RELIANCE',  display: 'RELIANCE',    name: 'Reliance Ind.',   type: 'equity', exchange: 'NSE_EQ', securityId: '2885', price: 2980.50, open: 2980.50, change: 0, changeAmt: 0, high: 3010.00, low: 2970.00, volume: '—', provider: 'DHAN' },
  'TCS':       { symbol: 'TCS',       display: 'TCS',         name: 'Tata Consultancy', type: 'equity', exchange: 'NSE_EQ', securityId: '11536', price: 4210.00, open: 4210.00, change: 0, changeAmt: 0, high: 4250.00, low: 4180.00, volume: '—', provider: 'DHAN' },
  'INFY':      { symbol: 'INFY',      display: 'INFY',        name: 'Infosys',         type: 'equity', exchange: 'NSE_EQ', securityId: '1594', price: 1780.00, open: 1780.00, change: 0, changeAmt: 0, high: 1800.00, low: 1765.00, volume: '—', provider: 'DHAN' },
  'HDFCBANK':  { symbol: 'HDFCBANK',  display: 'HDFCBANK',    name: 'HDFC Bank',       type: 'equity', exchange: 'NSE_EQ', securityId: '1333', price: 1610.20, open: 1610.20, change: 0, changeAmt: 0, high: 1630.00, low: 1595.00, volume: '—', provider: 'DHAN' }
};

export const FOREX_TICKERS = {
  'BTCUSDT':  { symbol: 'BTCUSDT',  display: 'BTC/USDT',  name: 'Bitcoin',   type: 'crypto', exchange: 'BINANCE', price: 94250.80, open: 94250.80, change: 0, changeAmt: 0, high: 95100.00, low: 93800.00, volume: '—', provider: 'BINANCE' },
  'ETHUSDT':  { symbol: 'ETHUSDT',  display: 'ETH/USDT',  name: 'Ethereum',  type: 'crypto', exchange: 'BINANCE', price: 3470.50,  open: 3470.50,  change: 0, changeAmt: 0, high: 3520.00,  low: 3410.00,  volume: '—', provider: 'BINANCE' },
  'SOLUSDT':  { symbol: 'SOLUSDT',  display: 'SOL/USDT',  name: 'Solana',    type: 'crypto', exchange: 'BINANCE', price: 184.20,   open: 184.20,   change: 0, changeAmt: 0, high: 189.00,   low: 181.00,   volume: '—', provider: 'BINANCE' },
  'BNBUSDT':  { symbol: 'BNBUSDT',  display: 'BNB/USDT',  name: 'BNB',       type: 'crypto', exchange: 'BINANCE', price: 580.40,   open: 580.40,   change: 0, changeAmt: 0, high: 590.00,   low: 572.00,   volume: '—', provider: 'BINANCE' },
  'XRPUSDT':  { symbol: 'XRPUSDT',  display: 'XRP/USDT',  name: 'Ripple',    type: 'crypto', exchange: 'BINANCE', price: 0.585,    open: 0.585,    change: 0, changeAmt: 0, high: 0.605,    low: 0.571,    volume: '—', provider: 'BINANCE' },
  'DOGEUSDT': { symbol: 'DOGEUSDT', display: 'DOGE/USDT', name: 'Dogecoin',  type: 'crypto', exchange: 'BINANCE', price: 0.142,    open: 0.142,    change: 0, changeAmt: 0, high: 0.151,    low: 0.138,    volume: '—', provider: 'BINANCE' }
};

const buildDefaultTickers = (mode) => {
  const map = mode === 'INDIAN' ? INDIAN_TICKERS : FOREX_TICKERS;
  return Object.values(map);
};

const MarketProviderContext = createContext(null);

export function MarketProviderLayer({ children }) {
  // ── State ────────────────────────────────────────────────────────
  const [marketMode, setMarketMode] = useState('INDIAN');
  const [activeProvider, setActiveProvider] = useState('BINANCE');
  const [providerKeys, setProviderKeys] = useState({
    DHAN:     { clientId: '', accessToken: '' },
    BREEZE:   { apiKey: '', apiSecret: '', sessionToken: '' },
    UPSTOX:   { accessToken: '' },
    TRUEDATA: { username: '', password: '' },
  });
  const [providerStatus, setProviderStatus] = useState({
    BINANCE: 'CONNECTING',
    DHAN: 'IDLE', BREEZE: 'IDLE', UPSTOX: 'IDLE', TRUEDATA: 'IDLE'
  });
  
  const [providerMetrics, setProviderMetrics] = useState({
    DHAN: null,
    BREEZE: null,
    UPSTOX: null,
    TRUEDATA: null,
    BINANCE: null
  });

  const [tickers, setTickers] = useState(() => buildDefaultTickers('INDIAN'));
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY');
  const [scannerSignals, setScannerSignals] = useState([]);
  const [optionChainData, setOptionChainData] = useState(null);

  const binanceRef = useRef(null);
  const indianRef  = useRef(null);
  const nseTimerRef = useRef(null);

  // ── 1. Load persisted settings on mount ────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedMode = localStorage.getItem('marketMode');
        const savedProvider = localStorage.getItem('activeProvider');
        const savedKeys = localStorage.getItem('providerKeys');
        const savedSymbol = localStorage.getItem('selectedSymbol');

        if (savedMode) {
          setMarketMode(savedMode);
          setTickers(buildDefaultTickers(savedMode));
        }
        if (savedProvider) setActiveProvider(savedProvider);
        if (savedKeys) setProviderKeys(JSON.parse(savedKeys));
        if (savedSymbol) {
          setSelectedSymbol(savedSymbol);
        } else {
          setSelectedSymbol(savedMode === 'INDIAN' ? 'NIFTY' : 'BTCUSDT');
        }
      } catch (e) {
        console.error("Failed to load settings from localStorage:", e);
      }
    }
  }, []);

  // ── 2. Persist configurations on changes ───────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('marketMode', marketMode);
      // Reset tickers list when mode changes
      setTickers(buildDefaultTickers(marketMode));
      setSelectedSymbol(marketMode === 'INDIAN' ? 'NIFTY' : 'BTCUSDT');
    }
  }, [marketMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeProvider', activeProvider);
    }
  }, [activeProvider]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('providerKeys', JSON.stringify(providerKeys));
    }
  }, [providerKeys]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedSymbol', selectedSymbol);
    }
  }, [selectedSymbol]);

  // ── Tick handler — merge into unified tickers array ───────────────
  const handleTick = useCallback((tick) => {
    // If Indian mode, ignore Forex/Crypto ticks
    if (marketMode === 'INDIAN' && tick.provider === 'BINANCE') return;
    // If Forex mode, ignore Indian ticks
    if (marketMode === 'FOREX' && tick.provider !== 'BINANCE') return;

    setTickers(prev => {
      const idx = prev.findIndex(t => t.symbol === tick.symbol);
      const updated = { ...tick, prevPrice: idx >= 0 ? prev[idx].price : tick.price, lastTickUp: tick.price >= (idx >= 0 ? prev[idx].price : tick.price) };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });

    // ── Scanner signals from real tick data ──────────────────────
    setScannerSignals(prev => {
      if (Math.abs(tick.change) > 0.8) { // lower threshold for Indian market momentum alerts
        const sig = {
          id: `${tick.symbol}-${Date.now()}`,
          symbol: tick.display || tick.symbol,
          signal: tick.change > 0 ? 'BULLISH MOMENTUM' : 'BEARISH PRESSURE',
          type:   tick.change > 0 ? 'LONG' : 'SHORT',
          price:  tick.price,
          change: tick.change,
          strength: Math.min(100, Math.abs(tick.change) * 40),
          time:   new Date().toLocaleTimeString(),
          provider: tick.provider,
        };
        return [sig, ...prev.slice(0, 49)];
      }
      return prev;
    });
  }, [marketMode]);

  const setStatus = useCallback((providerId, status, metrics = null) => {
    setProviderStatus(prev => ({ ...prev, [providerId]: status }));
    if (metrics) {
      setProviderMetrics(prev => ({ 
        ...prev, 
        [providerId]: { ...(prev[providerId] || {}), ...metrics } 
      }));
    }
  }, []);

  // ── Always run Binance (free, no auth) for Forex mode ────────────
  useEffect(() => {
    const adapter = new BinanceAdapter({
      onTick:   handleTick,
      onStatus: (s, m) => setStatus('BINANCE', s, m),
    });
    adapter.connect();
    binanceRef.current = adapter;
    return () => adapter.destroy();
  }, [handleTick, setStatus]);

  // ── Listen to local backend mock ticks ───────────────────────────
  useEffect(() => {
    const onTicks = (ticks) => {
      ticks.forEach(t => {
        const meta = INDIAN_TICKERS[t.symbol];
        if (meta) {
          handleTick({
            ...meta,
            price: t.price,
            change: parseFloat(((t.price - meta.open) / meta.open * 100).toFixed(2)),
            changeAmt: parseFloat((t.price - meta.open).toFixed(2)),
            provider: 'DHAN' // spoofing DHAN for UI
          });
        }
      });
    };
    socket.on('market_ticks', onTicks);
    return () => socket.off('market_ticks', onTicks);
  }, [handleTick]);

  // ── NSE Yahoo Finance fallback for Indian tickers (30s polling) ──
  useEffect(() => {
    const YAHOO_MAP = {
      'NIFTY': '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'FINNIFTY': '^CNXFIN',
      'SENSEX': '^BSESN',
      'RELIANCE': 'RELIANCE.NS',
      'TCS': 'TCS.NS',
      'INFY': 'INFY.NS',
      'HDFCBANK': 'HDFCBANK.NS'
    };

    const fetchNSE = async () => {
      if (marketMode !== 'INDIAN') return;
      // Skip fallback if Dhan is active and streaming live ticks
      if (activeProvider === 'DHAN' && providerStatus.DHAN === 'LIVE') return;

      for (const [sym, yahooSym] of Object.entries(YAHOO_MAP)) {
        try {
          const meta = INDIAN_TICKERS[sym];
          const encoded = encodeURIComponent(yahooSym);
          const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`
          )}`;
          const res  = await fetch(proxy);
          const outer = await res.json();
          const data = JSON.parse(outer.contents);
          const m = data?.chart?.result?.[0]?.meta;
          if (!m) continue;
          const price = m.regularMarketPrice || 0;
          const prev  = m.chartPreviousClose || m.previousClose || price;
          handleTick({
            ...meta,
            symbol: sym,
            price,
            change:    parseFloat(((price - prev) / prev * 100).toFixed(2)),
            changeAmt: parseFloat((price - prev).toFixed(2)),
            high:      m.regularMarketDayHigh || price,
            low:       m.regularMarketDayLow  || price,
            volume:    m.regularMarketVolume
              ? `${(m.regularMarketVolume / 1e7).toFixed(2)}Cr`
              : '—',
            provider: 'YAHOO_FALLBACK'
          });
        } catch (_) {}
      }
    };
    
    fetchNSE();
    nseTimerRef.current = setInterval(fetchNSE, 30000);
    return () => clearInterval(nseTimerRef.current);
  }, [handleTick, marketMode, activeProvider, providerStatus.DHAN]);

  // ── Switch Indian provider when user selects one ──────────────────
  useEffect(() => {
    if (indianRef.current) {
      indianRef.current.destroy?.();
      indianRef.current = null;
    }
    if (activeProvider === 'BINANCE') return;

    const keys = providerKeys[activeProvider] || {};

    const load = async () => {
      let adapter;
      if (activeProvider === 'DHAN') {
        const { DhanAdapter } = await import('../providers/DhanAdapter');
        adapter = new DhanAdapter({
          apiKey:   keys.accessToken,
          clientId: keys.clientId,
          onTick:   handleTick,
          onStatus: (s, m) => setStatus('DHAN', s, m),
        });
      } else if (activeProvider === 'BREEZE') {
        const { BreezeAdapter } = await import('../providers/IndianAdapters');
        adapter = new BreezeAdapter({
          apiKey:       keys.apiKey,
          apiSecret:    keys.apiSecret,
          sessionToken: keys.sessionToken,
          onTick:       handleTick,
          onStatus:     (s) => setStatus('BREEZE', s),
        });
      } else if (activeProvider === 'UPSTOX') {
        const { UpstoxAdapter } = await import('../providers/IndianAdapters');
        adapter = new UpstoxAdapter({
          accessToken: keys.accessToken,
          onTick:      handleTick,
          onStatus:    (s) => setStatus('UPSTOX', s),
        });
      } else if (activeProvider === 'TRUEDATA') {
        const { TrueDataAdapter } = await import('../providers/IndianAdapters');
        adapter = new TrueDataAdapter({
          username: keys.username,
          password: keys.password,
          onTick:   handleTick,
          onStatus: (s) => setStatus('TRUEDATA', s),
        });
        await adapter.connect();
        indianRef.current = adapter;
        return;
      }
      if (adapter) {
        adapter.connect();
        indianRef.current = adapter;
      }
    };

    load();

    return () => {
      if (indianRef.current) indianRef.current.destroy?.();
    };
  }, [activeProvider, providerKeys, handleTick, setStatus]);

  // ── Getters ───────────────────────────────────────────────────────
  const currentTicker = useMemo(
    () => tickers.find(t => t.symbol === selectedSymbol) || tickers[0],
    [tickers, selectedSymbol]
  );

  // ── Kline fetchers (route to correct adapter) ─────────────────────
  const fetchKlines = useCallback(async (symbol, interval = '5m', limit = 200) => {
    const ticker = tickers.find(t => t.symbol === symbol);
    if (!ticker) return [];

    // Crypto/Forex
    if (ticker.type === 'crypto' || ticker.provider === 'BINANCE') {
      if (!binanceRef.current) return [];
      return binanceRef.current.fetchKlines(symbol, interval, limit);
    }

    // Indian Market Live Provider (Dhan/Breeze)
    if (activeProvider === 'DHAN' && providerStatus.DHAN === 'LIVE' && indianRef.current?.fetchKlines) {
      try {
        const candles = await indianRef.current.fetchKlines(symbol, interval);
        if (candles && candles.length > 0) return candles;
      } catch (err) {
        console.warn("Failed to fetch klines from Dhan, using Yahoo fallback:", err);
      }
    }

    // Indian Fallback - Yahoo Finance chart proxy
    const YAHOO_MAP = {
      'NIFTY': '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'FINNIFTY': '^CNXFIN',
      'SENSEX': '^BSESN',
      'RELIANCE': 'RELIANCE.NS',
      'TCS': 'TCS.NS',
      'INFY': 'INFY.NS',
      'HDFCBANK': 'HDFCBANK.NS'
    };

    const yahooSym = YAHOO_MAP[symbol] || `${symbol}.NS`;
    let yahooInterval = '5m';
    let yahooRange = '5d';

    if (interval === '1m') { yahooInterval = '1m'; yahooRange = '1d'; }
    else if (interval === '5m') { yahooInterval = '5m'; yahooRange = '5d'; }
    else if (interval === '15m') { yahooInterval = '15m'; yahooRange = '5d'; }
    else if (interval === '1h') { yahooInterval = '60m'; yahooRange = '1mo'; }
    else if (interval === '1D') { yahooInterval = '1d'; yahooRange = '3mo'; }

    try {
      const encoded = encodeURIComponent(yahooSym);
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${yahooInterval}&range=${yahooRange}`
      )}`;
      const res = await fetch(proxy);
      const outer = await res.json();
      const data = JSON.parse(outer.contents);
      const result = data?.chart?.result?.[0];
      if (!result) return [];

      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const open = quote.open || [];
      const high = quote.high || [];
      const low = quote.low || [];
      const close = quote.close || [];
      const volume = quote.volume || [];

      return timestamps.map((t, idx) => ({
        time: t,
        open: open[idx] || close[idx] || 0,
        high: high[idx] || close[idx] || 0,
        low: low[idx] || close[idx] || 0,
        close: close[idx] || 0,
        volume: volume[idx] || 0
      })).filter(c => c.open > 0 && c.close > 0);

    } catch (err) {
      console.error("Yahoo klines fetch error:", err);
      return [];
    }
  }, [tickers, activeProvider, providerStatus.DHAN]);

  const subscribeKline = useCallback((symbol, interval, onCandle) => {
    const ticker = tickers.find(t => t.symbol === symbol);
    if (ticker?.type === 'crypto' && binanceRef.current) {
      return binanceRef.current.subscribeKline(symbol, interval, onCandle);
    }
    return () => {};
  }, [tickers]);

  const fetchOptionChain = useCallback(async (symbol, expiry) => {
    if (indianRef.current?.fetchOptionChain) {
      return indianRef.current.fetchOptionChain(symbol, expiry);
    }
    return null;
  }, []);

  // ── Save/update provider keys ─────────────────────────────────────
  const updateProviderKeys = useCallback((providerId, keys) => {
    setProviderKeys(prev => ({ ...prev, [providerId]: { ...prev[providerId], ...keys } }));
  }, []);

  const ctx = useMemo(() => ({
    // Market Mode
    marketMode, setMarketMode,

    // Provider management
    activeProvider, setActiveProvider,
    providerKeys, updateProviderKeys,
    providerStatus, providerMetrics,
    PROVIDERS,

    // Market data
    tickers, selectedSymbol, setSelectedSymbol,
    currentTicker,

    // Data fetchers
    fetchKlines, subscribeKline, fetchOptionChain,

    // Derived feeds for modules
    scannerSignals,
    optionChainData,

    // Computed
    activeBinanceStatus: providerStatus.BINANCE,
  }), [
    activeProvider, providerKeys, updateProviderKeys, providerStatus, providerMetrics,
    tickers, selectedSymbol, currentTicker,
    fetchKlines, subscribeKline, fetchOptionChain,
    scannerSignals, optionChainData,
  ]);

  return (
    <MarketProviderContext.Provider value={ctx}>
      {children}
    </MarketProviderContext.Provider>
  );
}

export function useMarketProvider() {
  const ctx = useContext(MarketProviderContext);
  if (!ctx) throw new Error('useMarketProvider must be used inside MarketProviderLayer');
  if (!ctx.tickers) {
    console.error("CRITICAL: ctx.tickers is undefined!", ctx);
    ctx.tickers = []; // fallback so it doesn't crash the UI completely
  }
  return ctx;
}
