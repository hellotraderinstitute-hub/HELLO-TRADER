'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { 
  Layers, ShieldCheck, Zap, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown,
  Info, X, ShoppingCart, Sliders, Activity, Target, Maximize2, Radio, Sparkles, CheckCircle2,
  Clock, RefreshCw
} from 'lucide-react';
import { 
  calculatePCR, calculateMaxPain, generateAIOptionSummary 
} from '../utils/smdeOptionEngine';
import AIDisclaimer from './AIDisclaimer';
import apiClient from '../lib/axios';


// ── Lot Size Registry ─────────────────────────────────────────────────
const LOT_SIZES = { NIFTY: 75, BANKNIFTY: 15, FINNIFTY: 40, SENSEX: 10 };
const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];

import { Lock } from 'lucide-react';

export default function OptionChain() {
  const { placeOrder, paperBalance, isExpiredTrial, openRechargeModal, authLoading } = useTrading();
  const { tickers } = useMarketProvider();

  useEffect(() => {
    if (!authLoading && isExpiredTrial) {
      openRechargeModal();
    }
  }, [authLoading, isExpiredTrial, openRechargeModal]);
  
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [viewMode, setViewMode] = useState('LTP'); // 'LTP' or 'GREEKS'
  const [strikeDepth, setStrikeDepth] = useState(15);

  // Expiry state — fetched from real backend
  const [expiryList, setExpiryList] = useState([]);
  const [expiry, setExpiry] = useState('');
  const [loadingExpiries, setLoadingExpiries] = useState(false);

  // Option chain data state
  const [liveContracts, setLiveContracts] = useState(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [chainMeta, setChainMeta] = useState({
    dataTime: null,
    lastUpdated: null,
    fetchLatencyMs: null,
    snapshotAgeMs: null,
    spotPrice: null,
    totalStrikes: 0,
    cached: false,
    stale: false,
    error: null,
  });

  // Order modal state
  const [activeOrder, setActiveOrder] = useState(null);
  const [lots, setLots] = useState(1);

  // Auto-refresh timer ref
  const refreshTimerRef = useRef(null);

  const spotPrice = useMemo(() => {
    if (chainMeta.spotPrice) return chainMeta.spotPrice;
    const found = tickers.find(t => t.symbol === selectedIndex || t.display === selectedIndex);
    if (found) return found.price;
    return null;
  }, [tickers, selectedIndex, chainMeta.spotPrice]);

  const lotSize = LOT_SIZES[selectedIndex] || 75;

  // ── Fetch Expiry List from Backend ──────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    setLoadingExpiries(true);
    setExpiryList([]);
    setExpiry('');
    setLiveContracts(null);

    apiClient.get(`/trade/option-chain/expiries?symbol=${encodeURIComponent(selectedIndex)}`)
      .then(res => {
        if (!isMounted) return;
        const data = res.data;
        if (data.success && Array.isArray(data.expiries) && data.expiries.length > 0) {
          setExpiryList(data.expiries);
          setExpiry(data.expiries[0]); // Select nearest expiry
        } else {
          setExpiryList([]);
          setExpiry('');
        }
      })
      .catch(() => {
        if (isMounted) { setExpiryList([]); setExpiry(''); }
      })
      .finally(() => {
        if (isMounted) setLoadingExpiries(false);
      });

    return () => { isMounted = false; };
  }, [selectedIndex]);

  // ── Fetch Option Chain from Backend ─────────────────────────────────
  const fetchOptionChain = () => {
    if (!expiry) return;

    setLoadingChain(true);
    apiClient.get(`/trade/option-chain?symbol=${encodeURIComponent(selectedIndex)}&expiry=${encodeURIComponent(expiry)}`)
      .then(res => {
        const data = res.data;
        if (data.success && Array.isArray(data.contracts) && data.contracts.length > 0) {
          setLiveContracts(data.contracts);
          setChainMeta({
            dataTime: data.dataTime || null,
            lastUpdated: data.lastUpdated || null,
            fetchLatencyMs: data.fetchLatencyMs || null,
            snapshotAgeMs: data.snapshotAgeMs || null,
            spotPrice: data.spotPrice || null,
            totalStrikes: data.totalStrikes || data.contracts.length,
            cached: data.cached || false,
            stale: data.stale || false,
            error: null,
          });
        } else {
          setLiveContracts(null);
          setChainMeta(prev => ({
            ...prev,
            error: data.error || 'OPTION_CHAIN_DATA_UNAVAILABLE',
            stale: true,
            contracts: null,
          }));
        }
      })
      .catch(() => {
        setLiveContracts(null);
        setChainMeta(prev => ({ ...prev, error: 'FETCH_FAILED', stale: true }));
      })
      .finally(() => {
        setLoadingChain(false);
      });
  };

  useEffect(() => {
    fetchOptionChain();

    // Auto-refresh every 5 seconds during active viewing
    clearInterval(refreshTimerRef.current);
    if (expiry) {
      refreshTimerRef.current = setInterval(fetchOptionChain, 5000);
    }

    return () => clearInterval(refreshTimerRef.current);
  }, [selectedIndex, expiry]);

  const liveDataAvailable = useMemo(() => {
    return Array.isArray(liveContracts) && liveContracts.length > 0 && !chainMeta.stale;
  }, [liveContracts, chainMeta.stale]);

  // ── Filter strikes around ATM ───────────────────────────────────────
  const filteredContracts = useMemo(() => {
    if (!liveDataAvailable || !liveContracts) return [];
    const sp = spotPrice || chainMeta.spotPrice || 0;
    if (sp === 0) return liveContracts.slice(0, strikeDepth * 2);

    // Find ATM index
    let atmIdx = 0;
    let minDiff = Infinity;
    liveContracts.forEach((c, i) => {
      const diff = Math.abs(c.strike - sp);
      if (diff < minDiff) { minDiff = diff; atmIdx = i; }
    });

    const startIdx = Math.max(0, atmIdx - strikeDepth);
    const endIdx = Math.min(liveContracts.length, atmIdx + strikeDepth + 1);
    return liveContracts.slice(startIdx, endIdx).map(c => ({
      ...c,
      isAtm: Math.abs(c.strike - sp) <= (c.strike * 0.002), // within 0.2%
    }));
  }, [liveContracts, liveDataAvailable, spotPrice, chainMeta.spotPrice, strikeDepth]);

  // ── PCR, Max Pain, AI Summary — ONLY from real data ─────────────────
  const pcrData = useMemo(() => calculatePCR(filteredContracts), [filteredContracts]);
  const maxPainData = useMemo(() => calculateMaxPain(filteredContracts), [filteredContracts]);
  const aiSummary = useMemo(() => {
    const sp = spotPrice || chainMeta.spotPrice || 0;
    return generateAIOptionSummary(sp, filteredContracts, pcrData, maxPainData);
  }, [spotPrice, chainMeta.spotPrice, filteredContracts, pcrData, maxPainData]);

  // ── Format helpers ──────────────────────────────────────────────────
  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    try {
      return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    } catch { return '—'; }
  };

  const formatNum = (val, suffix = '') => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return `${val}${suffix}`;
  };

  const formatOI = (val) => {
    if (!val || isNaN(val) || val === 0) return '—';
    return `${(val / 1000).toFixed(1)}k`;
  };

  const formatLtp = (val) => {
    if (!val || isNaN(val) || val === 0) return '—';
    return `₹${val.toLocaleString()}`;
  };

  // ── Order Handlers ──────────────────────────────────────────────────
  const handleOrderClick = (strikeObj, optionType, side) => {
    const ltp = optionType === 'CE' ? strikeObj.ceLtp : strikeObj.peLtp;
    if (!ltp || ltp === 0) return; // Don't allow orders on zero-price contracts
    setActiveOrder({
      symbol: `${selectedIndex} ${strikeObj.strike} ${optionType}`,
      display: `${selectedIndex} ${strikeObj.strike} ${optionType}`,
      strike: strikeObj.strike,
      type: optionType,
      side,
      price: ltp,
      lotSize,
    });
    setLots(1);
  };

  const handleConfirmOrder = () => {
    if (!activeOrder) return;
    const totalQty = lots * activeOrder.lotSize;
    const totalCost = totalQty * activeOrder.price;

    placeOrder({
      symbol: activeOrder.symbol,
      display: activeOrder.display,
      side: activeOrder.side,
      quantity: totalQty,
      entryPrice: activeOrder.price,
      type: 'OPTION',
      margin: totalCost,
    });

    setActiveOrder(null);
  };

  if (authLoading || isExpiredTrial) {
    return (
      <div className="p-8 text-center bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center space-y-4 font-mono">
        <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.2)]">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-black text-[#D4AF37] tracking-widest uppercase">🔒 PRO FEATURE LOCKED</div>
          <h2 className="text-lg font-bold text-white uppercase">Option Chain AI Locked</h2>
        </div>
        <p className="text-xs text-gray-400 max-w-md leading-relaxed">
          Your free trial has ended. Recharge your wallet tokens to unlock real-time Option Chain, PCR & Max Pain analysis.
        </p>
        <button
          onClick={openRechargeModal}
          className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] via-[#F59E0B] to-[#D97706] hover:brightness-110 text-black font-extrabold text-xs rounded-xl shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all uppercase cursor-pointer"
        >
          [ RECHARGE / ACTIVATE PREMIUM ]
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono flex flex-col gap-4">

      {/* ── TOP HEADER & STATUS ──────────────────────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Layers className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              OPTION CHAIN v2.0
              <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                REAL-TIME MARKET DATA
              </span>
            </h1>
            <p className="text-xs text-gray-400">Institutional Strike Grid, PCR Sentiment, Max Pain & Greeks</p>
          </div>
        </div>

        {/* Spot Price & Feed Status */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-400 font-bold uppercase">{selectedIndex} Spot</div>
            <div className="text-lg font-black text-[#00FF41]">
              {spotPrice ? `₹${spotPrice.toLocaleString()}` : '—'}
            </div>
          </div>

          <div className="pl-3 border-l border-white/10 flex flex-col items-end">
            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border flex items-center gap-1 ${
              liveDataAvailable ? 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              <Radio className="w-3 h-3 animate-pulse" />
              {liveDataAvailable ? 'INSTITUTIONAL LIVE FEED' : 'OPTION CHAIN DATA TEMPORARILY UNAVAILABLE'}
            </span>
            <span className="text-[9px] text-gray-400 mt-1">Lot Size: {lotSize} Qty</span>
          </div>
        </div>
      </div>

      {/* ── TIMESTAMP & FRESHNESS BAR ────────────────────────────────── */}
      <div className="bg-[#161B22] px-4 py-2 rounded-xl border border-white/10 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="font-bold">DATA TIME:</span>
          <span className="text-gray-200">{formatTime(chainMeta.dataTime)}</span>
        </div>
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          <span className="font-bold">LAST UPDATED:</span>
          <span className="text-gray-200">{formatTime(chainMeta.lastUpdated)}</span>
        </div>
        {chainMeta.fetchLatencyMs !== null && (
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="font-bold">LATENCY:</span>
            <span className="text-amber-300">{chainMeta.fetchLatencyMs}ms</span>
          </div>
        )}
        {chainMeta.snapshotAgeMs !== null && (
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span className="font-bold">AGE:</span>
            <span className={chainMeta.snapshotAgeMs > 15000 ? 'text-amber-400' : 'text-gray-200'}>
              {(chainMeta.snapshotAgeMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}
        {chainMeta.totalStrikes > 0 && (
          <div className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            <span className="font-bold">STRIKES:</span>
            <span className="text-gray-200">{chainMeta.totalStrikes}</span>
          </div>
        )}
      </div>

      {/* ── METRICS BAR (INDEX, EXPIRY, PCR, MAX PAIN, VIEW MODE) ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

        {/* Index Selector */}
        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-bold">Underlying:</span>
          <div className="flex gap-1">
            {INDICES.map(idx => (
              <button
                key={idx}
                onClick={() => setSelectedIndex(idx)}
                className={`px-2 py-1 rounded text-xs font-bold ${
                  selectedIndex === idx ? 'bg-purple-500 text-white' : 'bg-[#0B0E14] text-gray-400 hover:text-white'
                }`}
              >
                {idx}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry Selector */}
        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400 font-bold">Expiry:</span>
          {loadingExpiries ? (
            <span className="text-xs text-gray-500 animate-pulse">Loading...</span>
          ) : expiryList.length > 0 ? (
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="bg-[#0B0E14] text-white text-xs font-mono rounded px-2 py-1 border border-white/20 outline-none flex-1"
            >
              {expiryList.map(exp => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-amber-400">No expiries available</span>
          )}
        </div>

        {/* PCR Metric Card */}
        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">Put-Call Ratio (PCR)</div>
            <div className={`text-base font-black ${
              !liveDataAvailable ? 'text-gray-500' : pcrData.pcr >= 1.0 ? 'text-[#00FF41]' : 'text-red-400'
            }`}>
              {liveDataAvailable ? `${pcrData.pcr} (${pcrData.sentiment})` : '—'}
            </div>
          </div>
          <div className="text-[10px] text-gray-400 text-right">
            <div>PE OI: {liveDataAvailable ? `${(pcrData.totalPeOI / 100000).toFixed(1)}L` : '—'}</div>
            <div>CE OI: {liveDataAvailable ? `${(pcrData.totalCeOI / 100000).toFixed(1)}L` : '—'}</div>
          </div>
        </div>

        {/* Max Pain Metric Card */}
        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">Max Pain Strike</div>
            <div className="text-base font-black text-amber-300">
              {liveDataAvailable && maxPainData.maxPainStrike > 0 ? `₹${maxPainData.maxPainStrike.toLocaleString()}` : '—'}
            </div>
          </div>
          <div className="text-[10px] text-amber-400/80 text-right">
            <div>Min Seller Payout</div>
            <div>Target Strike</div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-bold">Display:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('LTP')}
              className={`px-3 py-1 rounded text-xs font-bold ${
                viewMode === 'LTP' ? 'bg-[#00D4FF] text-black' : 'bg-[#0B0E14] text-gray-400 hover:text-white'
              }`}
            >
              LTP & OI
            </button>
            <button
              onClick={() => setViewMode('GREEKS')}
              className={`px-3 py-1 rounded text-xs font-bold ${
                viewMode === 'GREEKS' ? 'bg-purple-500 text-white' : 'bg-[#0B0E14] text-gray-400 hover:text-white'
              }`}
            >
              Greeks & IV
            </button>
          </div>
        </div>
      </div>

      {/* ── AI OPTION SUMMARY PANEL ───────────────────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-xs font-bold text-purple-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            AI OPTION SENTIMENT & CONFLUENCE SUMMARY
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Market Bias:</span>
            <span className={`text-xs font-black px-2.5 py-0.5 rounded border ${
              !liveDataAvailable ? 'bg-gray-500/20 text-gray-400 border-gray-500/40'
              : aiSummary.bias === 'BULLISH' 
                ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/40' 
                : aiSummary.bias === 'BEARISH' 
                ? 'bg-red-500/20 text-red-400 border-red-500/40' 
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}>
              {liveDataAvailable ? `${aiSummary.bias} (${aiSummary.confidence}% Confidence)` : '—'}
            </span>
          </div>
        </div>

        {liveDataAvailable && aiSummary.reasons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {aiSummary.reasons.map((reason, idx) => (
              <div key={idx} className="bg-[#0B0E14] p-2.5 rounded-lg border border-white/5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#00FF41] shrink-0" />
                <span className="text-gray-200">{reason}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 text-center py-2">
            Sentiment analysis requires live option chain data.
          </div>
        )}

        <AIDisclaimer className="mt-2" />
      </div>

      {/* ── OPTION CHAIN STRIKE TABLE / UNAVAILABLE WARNING ──────────── */}
      {!liveDataAvailable ? (
        <div className="bg-[#161B22] rounded-xl border border-amber-500/30 p-12 text-center flex flex-col items-center justify-center space-y-3 my-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-1">
            <Radio className="w-6 h-6 text-amber-400 animate-pulse" />
          </div>
          <h3 className="text-base font-black text-amber-300 tracking-wider">
            OPTION CHAIN DATA TEMPORARILY UNAVAILABLE
          </h3>
          <p className="text-xs text-gray-400 max-w-md leading-relaxed">
            {chainMeta.error === 'CREDENTIALS_UNAVAILABLE'
              ? 'Market data credentials are not configured. Contact administrator.'
              : chainMeta.error === 'SNAPSHOT_STALE'
              ? 'The latest snapshot has expired. Awaiting fresh data from market feed.'
              : 'Live option chain data is currently unavailable. The system will auto-retry.'}
          </p>
          {loadingChain && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Fetching latest data...
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#161B22] rounded-xl border border-white/10 overflow-hidden flex-1">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs font-mono text-left border-collapse">
            <thead className="bg-[#0B0E14] text-gray-400 uppercase text-[10px] sticky top-0 z-10">
              <tr>
                <th colSpan={viewMode === 'LTP' ? 5 : 5} className="p-2 text-center border-b border-r border-white/10 text-cyan-400 font-black">
                  CALL OPTIONS (CE)
                </th>
                <th className="p-2 text-center border-b border-white/10 text-amber-300 font-black bg-white/5">
                  STRIKE
                </th>
                <th colSpan={viewMode === 'LTP' ? 5 : 5} className="p-2 text-center border-b border-l border-white/10 text-purple-400 font-black">
                  PUT OPTIONS (PE)
                </th>
              </tr>

              {viewMode === 'LTP' ? (
                <tr className="bg-[#161B22] text-gray-400 border-b border-white/10">
                  <th className="p-2 text-right">CE OI</th>
                  <th className="p-2 text-right">CE Chg</th>
                  <th className="p-2 text-right">CE Vol</th>
                  <th className="p-2 text-right">CE LTP</th>
                  <th className="p-2 text-center">Action</th>
                  <th className="p-2 text-center bg-white/5">PRICE</th>
                  <th className="p-2 text-center">Action</th>
                  <th className="p-2 text-left">PE LTP</th>
                  <th className="p-2 text-left">PE Vol</th>
                  <th className="p-2 text-left">PE Chg</th>
                  <th className="p-2 text-left">PE OI</th>
                </tr>
              ) : (
                <tr className="bg-[#161B22] text-gray-400 border-b border-white/10">
                  <th className="p-2 text-right">Delta (Δ)</th>
                  <th className="p-2 text-right">Gamma (Γ)</th>
                  <th className="p-2 text-right">Theta (Θ)</th>
                  <th className="p-2 text-right">Vega (v)</th>
                  <th className="p-2 text-right">CE IV</th>
                  <th className="p-2 text-center bg-white/5">STRIKE</th>
                  <th className="p-2 text-left">PE IV</th>
                  <th className="p-2 text-left">Delta (Δ)</th>
                  <th className="p-2 text-left">Gamma (Γ)</th>
                  <th className="p-2 text-left">Theta (Θ)</th>
                  <th className="p-2 text-left">Vega (v)</th>
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-white/5">
              {filteredContracts.map((row, idx) => (
                <tr key={idx} className={`hover:bg-white/5 transition-colors ${
                  row.isAtm ? 'bg-amber-500/10 font-bold border-y border-amber-500/30' : ''
                }`}>

                  {viewMode === 'LTP' ? (
                    <>
                      {/* CE Data */}
                      <td className="p-2 text-right text-gray-300 font-mono">{formatOI(row.ceOI)}</td>
                      <td className={`p-2 text-right font-mono ${row.ceOiChange > 0 ? 'text-[#00FF41]' : row.ceOiChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {row.ceOiChange !== 0 ? `${row.ceOiChange > 0 ? '+' : ''}${formatOI(row.ceOiChange)}` : '—'}
                      </td>
                      <td className="p-2 text-right text-gray-400 font-mono">{formatOI(row.ceVolume)}</td>
                      <td className="p-2 text-right font-black text-cyan-300 font-mono">{formatLtp(row.ceLtp)}</td>
                      <td className="p-2 text-center">
                        {row.ceLtp > 0 && (
                          <button 
                            onClick={() => handleOrderClick(row, 'CE', 'BUY')}
                            className="px-2 py-0.5 bg-[#00FF41]/20 hover:bg-[#00FF41]/40 text-[#00FF41] rounded text-[10px] font-bold"
                          >
                            BUY CE
                          </button>
                        )}
                      </td>

                      {/* STRIKE PRICE */}
                      <td className="p-2 text-center font-black font-mono bg-white/5 text-amber-300 relative">
                        ₹{row.strike}
                        {row.isAtm && <span className="ml-1 text-[9px] bg-amber-500 text-black px-1 rounded">ATM</span>}
                      </td>

                      {/* PE Data */}
                      <td className="p-2 text-center">
                        {row.peLtp > 0 && (
                          <button 
                            onClick={() => handleOrderClick(row, 'PE', 'BUY')}
                            className="px-2 py-0.5 bg-[#00FF41]/20 hover:bg-[#00FF41]/40 text-[#00FF41] rounded text-[10px] font-bold"
                          >
                            BUY PE
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-left font-black text-purple-300 font-mono">{formatLtp(row.peLtp)}</td>
                      <td className="p-2 text-left text-gray-400 font-mono">{formatOI(row.peVolume)}</td>
                      <td className={`p-2 text-left font-mono ${row.peOiChange > 0 ? 'text-[#00FF41]' : row.peOiChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {row.peOiChange !== 0 ? `${row.peOiChange > 0 ? '+' : ''}${formatOI(row.peOiChange)}` : '—'}
                      </td>
                      <td className="p-2 text-left text-gray-300 font-mono">{formatOI(row.peOI)}</td>
                    </>
                  ) : (
                    <>
                      {/* CE GREEKS */}
                      <td className="p-2 text-right text-cyan-300 font-mono">{formatNum(row.ceDelta)}</td>
                      <td className="p-2 text-right text-gray-300 font-mono">{formatNum(row.ceGamma)}</td>
                      <td className="p-2 text-right text-red-400 font-mono">{formatNum(row.ceTheta)}</td>
                      <td className="p-2 text-right text-purple-300 font-mono">{formatNum(row.ceVega)}</td>
                      <td className="p-2 text-right text-amber-300 font-mono">{row.ceIv > 0 ? `${row.ceIv}%` : '—'}</td>

                      {/* STRIKE */}
                      <td className="p-2 text-center font-black font-mono bg-white/5 text-amber-300">
                        ₹{row.strike}
                        {row.isAtm && <span className="ml-1 text-[9px] bg-amber-500 text-black px-1 rounded">ATM</span>}
                      </td>

                      {/* PE GREEKS */}
                      <td className="p-2 text-left text-amber-300 font-mono">{row.peIv > 0 ? `${row.peIv}%` : '—'}</td>
                      <td className="p-2 text-left text-purple-300 font-mono">{formatNum(row.peDelta)}</td>
                      <td className="p-2 text-left text-gray-300 font-mono">{formatNum(row.peGamma)}</td>
                      <td className="p-2 text-left text-red-400 font-mono">{formatNum(row.peTheta)}</td>
                      <td className="p-2 text-left text-cyan-300 font-mono">{formatNum(row.peVega)}</td>
                    </>
                  )}

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── ORDER EXECUTION MODAL ─────────────────────────────────────── */}
      {activeOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] p-5 rounded-2xl border border-white/20 max-w-sm w-full space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#00D4FF]" />
                Execute Option Trade ({activeOrder.side})
              </h3>
              <button onClick={() => setActiveOrder(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between p-2 bg-[#0B0E14] rounded">
                <span className="text-gray-400">Contract:</span>
                <span className="font-bold text-white">{activeOrder.display}</span>
              </div>
              <div className="flex justify-between p-2 bg-[#0B0E14] rounded">
                <span className="text-gray-400">LTP Premium:</span>
                <span className="font-bold text-[#00FF41]">₹{activeOrder.price}</span>
              </div>
              <div className="flex justify-between p-2 bg-[#0B0E14] rounded items-center">
                <span className="text-gray-400">Lots ({activeOrder.lotSize} Qty/Lot):</span>
                <input 
                  type="number" 
                  min="1" 
                  max="100" 
                  value={lots} 
                  onChange={(e) => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-[#161B22] border border-white/20 rounded text-center py-1 text-white text-xs font-bold"
                />
              </div>
              <div className="flex justify-between p-2 bg-[#0B0E14] rounded">
                <span className="text-gray-400">Total Quantity:</span>
                <span className="font-bold text-cyan-300">{lots * activeOrder.lotSize} Qty</span>
              </div>
              <div className="flex justify-between p-2 bg-purple-500/10 border border-purple-500/30 rounded">
                <span className="text-gray-300 font-bold">Total Premium Margin:</span>
                <span className="font-black text-purple-300">₹{(lots * activeOrder.lotSize * activeOrder.price).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setActiveOrder(null)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmOrder}
                className="flex-1 py-2 bg-[#00FF41] hover:bg-[#00cc34] text-black font-black text-xs rounded-lg transition-colors"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
