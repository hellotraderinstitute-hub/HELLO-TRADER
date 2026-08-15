'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Search, Zap, Activity, ShieldCheck, CheckCircle2, TrendingUp, TrendingDown, Layers, Filter, Radio, Flame, Sparkles, Lock } from 'lucide-react';
import AIDisclaimer from './AIDisclaimer';
import { evaluateSymbolScanner } from '../utils/smdeScannerEngine';

const DEFAULT_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'SBIN', 'BEL', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAMOTORS'];

export default function MarketScanner() {
  const { placeOrder, isExpiredTrial, openRechargeModal, authLoading } = useTrading();
  const { setSelectedSymbol, activeStatus } = useMarketProvider();

  useEffect(() => {
    if (!authLoading && isExpiredTrial) {
      openRechargeModal();
    }
  }, [authLoading, isExpiredTrial, openRechargeModal]);

  const [activeFilter, setActiveFilter] = useState('ALL');
  const [scannedCards, setScannedCards] = useState([]);
  const [loading, setLoading] = useState(true);

  if (authLoading || isExpiredTrial) {
    return (
      <div className="p-8 text-center bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center space-y-4 font-mono">
        <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.2)]">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-black text-[#D4AF37] tracking-widest uppercase">🔒 PRO FEATURE LOCKED</div>
          <h2 className="text-lg font-bold text-white uppercase">Market Scanner Locked</h2>
        </div>
        <p className="text-xs text-gray-400 max-w-md leading-relaxed">
          Your free trial has ended. Recharge your wallet tokens to unlock real-time Smart Money Concept presets and market scanner filters.
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

  const isFeedLive = activeStatus === 'LIVE' || activeStatus === 'STREAMING';

  // Fetch real candles from /api/smde/klines and run scanner evaluation
  useEffect(() => {
    let isMounted = true;

    async function runLiveScanner() {
      try {
        const results = await Promise.all(
          DEFAULT_SYMBOLS.map(async (sym) => {
            try {
              const res = await fetch(`http://127.0.0.1:4000/api/smde/klines?symbol=${encodeURIComponent(sym)}&timeframe=5m&limit=100`);
              const data = await res.json();
              const klines = data.klines || [];
              return evaluateSymbolScanner(sym, klines);
            } catch (e) {
              return evaluateSymbolScanner(sym, []);
            }
          })
        );

        if (isMounted) {
          // Sort descending by highest Scanner Score
          results.sort((a, b) => b.score - a.score);
          setScannedCards(results);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) setLoading(false);
      }
    }

    runLiveScanner();
    const interval = setInterval(runLiveScanner, 10000); // 10s Scanner Refresh
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const filteredCards = useMemo(() => {
    if (activeFilter === 'BULLISH') return scannedCards.filter(c => c.type === 'BULLISH');
    if (activeFilter === 'BEARISH') return scannedCards.filter(c => c.type === 'BEARISH');
    if (activeFilter === 'SMC') return scannedCards.filter(c => c.triggers.some(t => ['BOS', 'CHOCH', 'Bullish OB', 'Bearish OB', 'FVG'].includes(t)));
    return scannedCards;
  }, [scannedCards, activeFilter]);

  const handleExecuteSignal = (sig) => {
    setSelectedSymbol(sig.symbol);
    const side = sig.type === 'BULLISH' ? 'BUY' : 'SELL';
    placeOrder({
      symbol: sig.symbol,
      side: side,
      quantity: 50,
      leverage: 10,
      orderType: 'MARKET',
      productType: 'INTRADAY',
      price: sig.price
    });
  };

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono flex flex-col gap-4">

      {/* ── TOP BANNER & TELEMETRY ───────────────────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Search className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              INSTITUTIONAL MARKET SCANNER AI v2.0
              <span className="text-[10px] bg-[#00D4FF]/20 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/30 font-extrabold">
                14 REAL-TIME SETUPS
              </span>
            </h1>
            <p className="text-xs text-gray-400">Live Donchian Breakouts, SMC Structures, Moving Average & Volume Spikes</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          {['ALL', 'BULLISH', 'BEARISH', 'SMC'].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeFilter === f
                  ? 'bg-[#00D4FF] text-black shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                  : 'bg-[#0B0E14] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── SCANNER RESULTS GRID (SORTED DESCENDING BY SCANNER SCORE) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full h-48 flex flex-col items-center justify-center text-gray-400 border border-white/10 rounded-xl bg-[#161B22] gap-2">
            <Activity className="w-8 h-8 text-[#00D4FF] animate-spin" />
            <span className="text-xs font-bold">Scanning SMDE 5m Candle History across 14 Technical & SMC Drivers...</span>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="col-span-full h-40 flex flex-col items-center justify-center text-gray-500 border border-white/5 rounded-xl bg-white/[0.01]">
            <Activity className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No active setups match filter "{activeFilter}".</p>
          </div>
        ) : (
          filteredCards.map((card) => (
            <div key={card.symbol} className="bg-[#161B22] rounded-xl border border-white/10 p-4 hover:border-[#00D4FF]/40 transition-all flex flex-col justify-between shadow-lg space-y-3">
              
              {/* Header: Symbol & Scanner Score */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base text-white">{card.symbol}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">SMDE 5m</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-[9px] text-gray-400 font-bold">SCORE</div>
                      <div className={`text-base font-black ${card.score >= 70 ? 'text-[#00FF41]' : card.score <= 45 ? 'text-red-400' : 'text-amber-300'}`}>
                        {card.score}/100
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bias & Risk Badges */}
                <div className="flex items-center justify-between bg-[#0B0E14] p-2 rounded-lg border border-white/5 text-xs mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Bias:</span>
                    <span className={`font-black text-[11px] px-2 py-0.5 rounded ${
                      card.type === 'BULLISH' ? 'bg-[#00FF41]/20 text-[#00FF41]' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {card.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400">Risk:</span>
                    <span className={`font-bold text-[10px] ${
                      card.risk === 'LOW' ? 'text-[#00FF41]' : card.risk === 'MODERATE' ? 'text-amber-300' : 'text-red-400'
                    }`}>
                      {card.risk}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400">LTP: </span>
                    <span className="font-bold text-white">₹{card.price}</span>
                  </div>
                </div>

                {/* Triggers / Setups Badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {card.triggers.map((trig, idx) => (
                    <span key={idx} className="text-[10px] font-bold px-2 py-0.5 bg-purple-500/10 text-purple-300 rounded border border-purple-500/30 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-400 shrink-0" />
                      {trig}
                    </span>
                  ))}
                </div>

                {/* Evidence Reasons */}
                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1.5 text-xs mb-3">
                  <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    Detected Setup Evidence
                  </div>
                  <ul className="space-y-1">
                    {card.evidence.map((ev, idx) => (
                      <li key={idx} className="flex items-center gap-1.5 text-[11px] text-gray-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF41] shrink-0" />
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Trade Action Button */}
              <button
                onClick={() => handleExecuteSignal(card)}
                className="w-full py-2.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF] text-[#00D4FF] hover:text-black font-black text-xs rounded-lg border border-[#00D4FF]/30 transition-all flex items-center justify-center gap-1.5"
              >
                <Zap className="w-4 h-4" />
                TRADE {card.symbol} ({card.type}) NOW
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── STANDARD REUSABLE AI DISCLAIMER ──────────────────────────── */}
      <AIDisclaimer className="mt-4" />
    </div>
  );
}
