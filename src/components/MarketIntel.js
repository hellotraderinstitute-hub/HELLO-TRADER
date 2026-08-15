'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Globe, TrendingUp, Newspaper, Zap, ArrowUpRight, ArrowDownRight, 
  RefreshCw, BarChart3, ShieldCheck, DollarSign, Activity, AlertTriangle, Clock, Radio, CheckCircle2, Lock
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

export default function MarketIntel() {
  const { isExpiredTrial, openRechargeModal, authLoading } = useTrading();

  useEffect(() => {
    if (!authLoading && isExpiredTrial) {
      openRechargeModal();
    }
  }, [authLoading, isExpiredTrial, openRechargeModal]);

  const [newsCategory, setNewsCategory] = useState('ALL');
  const [loadingIntel, setLoadingIntel] = useState(false);

  if (authLoading || isExpiredTrial) {
    return (
      <div className="p-8 text-center bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center space-y-4 font-mono">
        <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.2)]">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-black text-[#D4AF37] tracking-widest uppercase">🔒 PRO FEATURE LOCKED</div>
          <h2 className="text-lg font-bold text-white uppercase">Market Intel (FII / DII) Locked</h2>
        </div>
        <p className="text-xs text-gray-400 max-w-md leading-relaxed">
          Your free trial has ended. Recharge your wallet tokens to unlock real-time FII/DII institutional flow and market intelligence.
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

  // FII/DII State
  const [fiiDiiData, setFiiDiiData] = useState(null);
  const [fiiDiiLoading, setFiiDiiLoading] = useState(true);

  // News State
  const [newsList, setNewsList] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);

  // Auto-refresh ref
  const refreshTimerRef = useRef(null);

  // ── Fetch FII / DII Official Data ──────────────────────────────────
  const fetchFiiDii = () => {
    setFiiDiiLoading(true);
    fetch('/api/smde/fii-dii')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setFiiDiiData(data);
        } else {
          setFiiDiiData(null);
        }
      })
      .catch(() => {
        setFiiDiiData(null);
      })
      .finally(() => {
        setFiiDiiLoading(false);
      });
  };

  // ── Fetch Live News ─────────────────────────────────────────────────
  const fetchNews = () => {
    setNewsLoading(true);
    fetch(`/api/smde/news?category=${encodeURIComponent(newsCategory)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.articles)) {
          setNewsList(data.articles);
        } else {
          setNewsList([]);
        }
      })
      .catch(() => {
        setNewsList([]);
      })
      .finally(() => {
        setNewsLoading(false);
      });
  };

  const refreshAll = () => {
    setLoadingIntel(true);
    fetchFiiDii();
    fetchNews();
    setTimeout(() => setLoadingIntel(false), 800);
  };

  useEffect(() => {
    fetchFiiDii();
    fetchNews();

    // Auto-refresh news and FII/DII data every 60 seconds
    clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchFiiDii();
      fetchNews();
    }, 60000);

    return () => clearInterval(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    fetchNews();
  }, [newsCategory]);

  // Format helpers
  const formatAmount = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const formatted = Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${val >= 0 ? '+' : '-'} ₹${formatted} Cr`;
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    try {
      return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    } catch { return '—'; }
  };

  const isFiiDiiAvailable = useMemo(() => {
    return fiiDiiData && fiiDiiData.success && fiiDiiData.fii && fiiDiiData.dii;
  }, [fiiDiiData]);

  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto' }} className="p-4 bg-[#0B0E14] text-white font-mono space-y-5 pb-16">
      
      {/* ── HEADER BANNER ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Globe className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              INSTITUTIONAL MARKET INTEL & FII / DII FEED
              <span className="flex items-center gap-1 bg-[#00FF41]/10 text-[#00FF41] text-[9px] font-black px-2 py-0.5 rounded border border-[#00FF41]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-ping" />
                VERIFIED REAL MARKET DATA
              </span>
            </h1>
            <p className="text-xs text-gray-400">Official Exchange Reported FII/DII Activity & Live Financial News Stream</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-[10px] text-gray-400">
            Last Synced: <strong className="text-white">{fiiDiiData?.lastUpdated ? formatTime(fiiDiiData.lastUpdated) : '—'}</strong>
          </span>
          <button
            onClick={refreshAll}
            disabled={loadingIntel || fiiDiiLoading}
            className="px-3 py-1.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] rounded-lg font-bold border border-[#00D4FF]/30 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingIntel || fiiDiiLoading ? 'animate-spin' : ''}`} />
            REFRESH INTEL
          </button>
        </div>
      </div>

      {/* ── FII / DII CLASSIFICATION & DATE NOTICE ───────────────────── */}
      <div className="bg-[#161B22] px-4 py-2.5 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#00FF41]" />
          <span className="font-bold text-gray-200 uppercase">
            SOURCE: {isFiiDiiAvailable ? 'NSE OFFICIAL REPORTED TRADING ACTIVITY' : 'EXCHANGE DATA API'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div>
            REPORT DATE: <strong className="text-amber-300 font-mono">{fiiDiiData?.dataDate || '—'}</strong>
          </div>
          <div>
            STATUS: <strong className={isFiiDiiAvailable ? 'text-[#00FF41]' : 'text-amber-400'}>
              {isFiiDiiAvailable ? 'LIVE SYNCHRONIZED' : 'TEMPORARILY UNAVAILABLE'}
            </strong>
          </div>
        </div>
      </div>

      {/* ── TOP FII / DII INSTITUTIONAL SUMMARY CARDS ────────────────── */}
      {!isFiiDiiAvailable ? (
        <div className="bg-[#161B22] rounded-xl border border-amber-500/30 p-8 text-center flex flex-col items-center justify-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-1">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-sm font-bold text-amber-300 tracking-wider">
            INSTITUTIONAL FII / DII DATA TEMPORARILY UNAVAILABLE
          </h3>
          <p className="text-xs text-gray-400 max-w-md">
            Official exchange trading statistics are currently being updated or unreachable. Retry shortly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          
          {/* FII CASH NET */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-lg space-y-1">
            <div className="flex justify-between text-gray-400 text-[10px]">
              <span>FII / FPI CASH NET</span>
              <span className="text-amber-300 font-extrabold">{fiiDiiData.dataDate}</span>
            </div>
            <div className={`text-lg font-black flex items-center gap-1 ${
              fiiDiiData.fii.isNetBuyer ? 'text-[#00FF41]' : 'text-red-400'
            }`}>
              {formatAmount(fiiDiiData.fii.net)}
              {fiiDiiData.fii.isNetBuyer ? <ArrowUpRight className="w-5 h-5 text-[#00FF41]" /> : <ArrowDownRight className="w-5 h-5 text-red-400" />}
            </div>
            <div className="text-[10px] text-gray-400 flex justify-between pt-1 border-t border-white/5">
              <span>BUY: ₹{fiiDiiData.fii.buy.toLocaleString()} Cr</span>
              <span>SELL: ₹{fiiDiiData.fii.sell.toLocaleString()} Cr</span>
            </div>
          </div>

          {/* DII CASH NET */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-lg space-y-1">
            <div className="flex justify-between text-gray-400 text-[10px]">
              <span>DII CASH NET</span>
              <span className="text-amber-300 font-extrabold">{fiiDiiData.dataDate}</span>
            </div>
            <div className={`text-lg font-black flex items-center gap-1 ${
              fiiDiiData.dii.isNetBuyer ? 'text-[#00FF41]' : 'text-red-400'
            }`}>
              {formatAmount(fiiDiiData.dii.net)}
              {fiiDiiData.dii.isNetBuyer ? <ArrowUpRight className="w-5 h-5 text-[#00FF41]" /> : <ArrowDownRight className="w-5 h-5 text-red-400" />}
            </div>
            <div className="text-[10px] text-gray-400 flex justify-between pt-1 border-t border-white/5">
              <span>BUY: ₹{fiiDiiData.dii.buy.toLocaleString()} Cr</span>
              <span>SELL: ₹{fiiDiiData.dii.sell.toLocaleString()} Cr</span>
            </div>
          </div>

          {/* COMBINED INSTITUTIONAL INFLOW */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-lg space-y-1">
            <div className="flex justify-between text-gray-400 text-[10px]">
              <span>COMBINED INSTITUTIONAL NET</span>
              <span className="text-[#00D4FF] font-extrabold">TOTAL</span>
            </div>
            <div className={`text-lg font-black flex items-center gap-1 ${
              fiiDiiData.isCombinedNetBuyer ? 'text-[#00D4FF]' : 'text-amber-400'
            }`}>
              {formatAmount(fiiDiiData.netTotal)}
              <Zap className="w-5 h-5 text-[#00D4FF]" />
            </div>
            <div className="text-[10px] text-[#00D4FF] font-bold">
              {fiiDiiData.isCombinedNetBuyer ? 'NET CAPITAL INFLOW' : 'NET CAPITAL OUTFLOW'}
            </div>
          </div>

          {/* INSTITUTIONAL BIAS */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-lg space-y-1">
            <div className="flex justify-between text-gray-400 text-[10px]">
              <span>INSTITUTIONAL FLOW BIAS</span>
              <span className="text-purple-300 font-extrabold">ANALYSIS</span>
            </div>
            <div className={`text-lg font-black ${
              fiiDiiData.bias === 'BULLISH' || fiiDiiData.bias === 'MILDLY_BULLISH'
                ? 'text-[#00FF41]'
                : fiiDiiData.bias === 'BEARISH' || fiiDiiData.bias === 'MILDLY_BEARISH'
                ? 'text-red-400'
                : 'text-amber-300'
            }`}>
              {fiiDiiData.bias.replace('_', ' ')}
            </div>
            <div className="text-[10px] text-gray-400 font-bold">
              BASED ON REPORTED REPORT DATA
            </div>
          </div>

        </div>
      )}

      {/* ── FII / DII REPORTED BREAKDOWN TABLE ──────────────────────── */}
      {isFiiDiiAvailable && (
        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h2 className="text-xs font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#00D4FF]" />
              OFFICIAL FII & DII REPORTED TRADING BREAKDOWN ({fiiDiiData.dataDate})
            </h2>
            <span className="text-[10px] text-gray-400">Figures in ₹ Crores (Cr)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-[#0B0E14] text-gray-400 border-b border-white/10 text-[10px]">
                  <th className="py-2.5 px-3 text-left">CATEGORY</th>
                  <th className="py-2.5 px-3 text-[#00FF41]">BUY VALUE</th>
                  <th className="py-2.5 px-3 text-red-400">SELL VALUE</th>
                  <th className="py-2.5 px-3 font-bold text-white text-right">NET VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="py-2.5 px-3 text-left font-bold text-amber-300">FII / FPI (Foreign Institutional)</td>
                  <td className="py-2.5 px-3 text-[#00FF41]">₹{fiiDiiData.fii.buy.toLocaleString('en-IN')} Cr</td>
                  <td className="py-2.5 px-3 text-red-400">₹{fiiDiiData.fii.sell.toLocaleString('en-IN')} Cr</td>
                  <td className={`py-2.5 px-3 font-black text-right ${fiiDiiData.fii.isNetBuyer ? 'text-[#00FF41]' : 'text-red-400'}`}>
                    {formatAmount(fiiDiiData.fii.net)}
                  </td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="py-2.5 px-3 text-left font-bold text-cyan-300">DII (Domestic Institutional)</td>
                  <td className="py-2.5 px-3 text-[#00FF41]">₹{fiiDiiData.dii.buy.toLocaleString('en-IN')} Cr</td>
                  <td className="py-2.5 px-3 text-red-400">₹{fiiDiiData.dii.sell.toLocaleString('en-IN')} Cr</td>
                  <td className={`py-2.5 px-3 font-black text-right ${fiiDiiData.dii.isNetBuyer ? 'text-[#00FF41]' : 'text-red-400'}`}>
                    {formatAmount(fiiDiiData.dii.net)}
                  </td>
                </tr>
                <tr className="bg-white/5 font-black">
                  <td className="py-2.5 px-3 text-left text-white">TOTAL COMBINED NET FLOW</td>
                  <td className="py-2.5 px-3 text-gray-500">—</td>
                  <td className="py-2.5 px-3 text-gray-500">—</td>
                  <td className={`py-2.5 px-3 font-black text-right text-sm ${fiiDiiData.isCombinedNetBuyer ? 'text-[#00D4FF]' : 'text-amber-400'}`}>
                    {formatAmount(fiiDiiData.netTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LIVE MARKET NEWS STREAM (INDIAN & GLOBAL) ────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[#00D4FF]" />
            <h2 className="text-xs font-bold text-white">LIVE MARKET NEWS STREAM (INDIAN & GLOBAL)</h2>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex bg-[#0B0E14] p-0.5 rounded-lg border border-white/10 text-[10px] font-bold">
            {['ALL', 'INDIAN', 'GLOBAL', 'INSTITUTIONAL'].map(cat => (
              <button
                key={cat}
                onClick={() => setNewsCategory(cat)}
                className={`px-3 py-1 rounded transition-all ${
                  newsCategory === cat ? 'bg-[#00D4FF] text-black shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                {cat === 'ALL' ? 'ALL NEWS' : cat === 'INDIAN' ? '🇮🇳 INDIAN' : cat === 'GLOBAL' ? '🌐 GLOBAL' : '⚡ SMART MONEY'}
              </button>
            ))}
          </div>
        </div>

        {/* News Items Grid */}
        {newsLoading ? (
          <div className="text-xs text-gray-500 text-center py-8 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#00D4FF]" />
            Fetching live market headlines...
          </div>
        ) : newsList.length === 0 ? (
          <div className="text-xs text-amber-400 text-center py-8">
            Live news feed temporarily unavailable.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {newsList.map((item) => (
              <div key={item.id} className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 hover:border-[#00D4FF]/30 transition-all space-y-2 shadow-md">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-bold bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20">
                      {item.source}
                    </span>
                    <span className="text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 rounded font-black text-[9px] ${
                      item.sentiment === 'BULLISH' ? 'bg-[#00FF41]/20 text-[#00FF41]' 
                      : item.sentiment === 'BEARISH' ? 'bg-red-500/20 text-red-400' 
                      : 'bg-gray-700 text-gray-300'
                    }`}>
                      {item.sentiment}
                    </span>
                    <span className="px-1.5 py-0.5 rounded font-bold text-[9px] bg-amber-500/20 text-amber-300">
                      {item.impact} IMPACT
                    </span>
                  </div>
                </div>

                <a 
                  href={item.link || '#'} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs font-bold text-white leading-snug hover:text-[#00D4FF] transition-colors block"
                >
                  {item.title}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
