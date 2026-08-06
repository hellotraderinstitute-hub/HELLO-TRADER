'use client';

import React from 'react';
import { useMarketProvider } from '../context/MarketProviderContext';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';

export default function TickerTape() {
  const { tickers, selectedSymbol, setSelectedSymbol } = useMarketProvider();

  return (
    <div className="bg-[#0B0E14] border-b border-white/10 overflow-hidden select-none py-1.5 px-4 flex items-center gap-4 text-xs font-mono">
      <div className="flex items-center gap-1.5 text-[#00D4FF] font-bold tracking-wider shrink-0 bg-[#00D4FF]/10 px-2 py-0.5 rounded border border-[#00D4FF]/30">
        <Zap className="w-3.5 h-3.5 animate-pulse text-[#00D4FF]" />
        <span>LIVE FEED</span>
      </div>

      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5">
        {tickers.map((t) => {
          const isSelected = t.symbol === selectedSymbol;
          const isUp = t.change >= 0;

          return (
            <button
              key={t.symbol}
              onClick={() => setSelectedSymbol(t.symbol)}
              className={`flex items-center gap-2 px-2.5 py-1 rounded transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#1E2631] border border-[#00D4FF]/50 text-white shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                  : 'hover:bg-white/5 text-gray-300 hover:text-white'
              }`}
            >
              <span className="font-semibold text-gray-200">{t.symbol}</span>
              <span className={`font-bold transition-colors ${t.lastTickUp ? 'text-[#00FF41]' : 'text-[#FF3131]'}`}>
                ${t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className={`flex items-center gap-0.5 text-[10px] px-1 rounded ${
                isUp ? 'bg-[#00FF41]/10 text-[#00FF41]' : 'bg-[#FF3131]/10 text-[#FF3131]'
              }`}>
                {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {isUp ? '+' : ''}{t.change}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
