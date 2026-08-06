'use client';

import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Search, Zap, Activity } from 'lucide-react';

export default function MarketScanner() {
  const { placeOrder } = useTrading();
  const { scannerSignals, setSelectedSymbol } = useMarketProvider();
  const [activeFilter, setActiveFilter] = useState('ALL');

  const handleExecuteSignal = (sig) => {
    setSelectedSymbol(sig.symbol);
    placeOrder({
      symbol: sig.symbol,
      side: sig.type,
      quantity: sig.symbol.includes('BTC') ? 0.1 : 50,
      leverage: 10,
      type: 'MARKET',
      price: sig.price,
    });
  };

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono">
      {/* Top Banner */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              REAL-TIME MARKET SCANNER
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FF41] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00FF41]"></span>
              </span>
            </h1>
            <p className="text-xs text-gray-400">Live momentum and volatility sweeps from active market providers.</p>
          </div>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          {['ALL', 'BULLISH', 'BEARISH'].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
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

      {/* Signal Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {scannerSignals.length === 0 ? (
          <div className="col-span-full h-40 flex flex-col items-center justify-center text-gray-500 border border-white/5 rounded-xl bg-white/[0.01]">
            <Activity className="w-8 h-8 mb-2 opacity-50 animate-pulse" />
            <p>Scanning markets for high-momentum setups...</p>
          </div>
        ) : (
          scannerSignals
            .filter(sig => activeFilter === 'ALL' || (activeFilter === 'BULLISH' && sig.type === 'LONG') || (activeFilter === 'BEARISH' && sig.type === 'SHORT'))
            .map((sig) => (
            <div key={sig.id} className="bg-[#161B22] rounded-xl border border-white/10 p-4 hover:border-[#00D4FF]/40 transition-all flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-white">{sig.symbol}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{sig.provider}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                    sig.type === 'LONG' ? 'bg-[#00FF41]/20 text-[#00FF41]' : 'bg-[#FF3131]/20 text-[#FF3131]'
                  }`}>
                    {sig.type}
                  </span>
                </div>

                <p className={`text-xs font-semibold mb-3 ${sig.type === 'LONG' ? 'text-[#00FF41]' : 'text-[#FF3131]'}`}>
                  {sig.signal}
                </p>

                <div className="grid grid-cols-2 gap-2 bg-[#0B0E14] p-2.5 rounded-lg border border-white/5 text-xs mb-3">
                  <div>
                    <span className="text-gray-500 text-[10px] block">LIVE PRICE</span>
                    <span className="font-bold text-white">{sig.price.toLocaleString(undefined, {maximumFractionDigits: 4})}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px] block">VOLATILITY (1m)</span>
                    <span className={`font-bold ${sig.type === 'LONG' ? 'text-[#00FF41]' : 'text-[#FF3131]'}`}>
                      {sig.change}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  <span>Detected: <strong className="text-white">{sig.time}</strong></span>
                  <span>Strength: <strong className="text-[#00D4FF]">{sig.strength.toFixed(0)}/100</strong></span>
                </div>
              </div>

              <button
                onClick={() => handleExecuteSignal(sig)}
                className="w-full py-2 bg-[#00D4FF]/10 hover:bg-[#00D4FF] text-[#00D4FF] hover:text-black font-extrabold rounded-lg border border-[#00D4FF]/30 transition-all flex items-center justify-center gap-1 text-xs"
              >
                <Zap className="w-3.5 h-3.5" />
                TRADE {sig.type} NOW
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
