'use client';

import React from 'react';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Activity } from 'lucide-react';

export default function Watchlist() {
  const { 
    tickers, selectedSymbol, setSelectedSymbol, activeBinanceStatus,
    activeProvider, providerStatus, marketMode 
  } = useMarketProvider();

  const statusColors = { 
    LIVE: '#00e639', 
    RECONNECTING: '#FFD700', 
    ERROR: '#ffb4ab', 
    CONNECTING: '#bbc9cf',
    IDLE: '#859398'
  };

  const activeStatus = marketMode === 'INDIAN' 
    ? (providerStatus[activeProvider] || 'IDLE') 
    : activeBinanceStatus;

  return (
    <div className="h-full flex flex-col bg-[#10131a] font-mono text-xs overflow-hidden">
      {/* Header */}
      <div className="px-2 py-2 border-b border-[#3c494e]/30 flex items-center justify-between shrink-0">
        <span className="font-extrabold text-[11px] text-[#bbc9cf] flex items-center gap-1">
          <Activity className="w-3 h-3 text-[#00d4ff]" />
          MARKET WATCH
        </span>
        <span className="flex items-center gap-1 text-[9px]">
          <span 
            className="w-1.5 h-1.5 rounded-full animate-pulse" 
            style={{ backgroundColor: statusColors[activeStatus] || '#bbc9cf' }} 
          />
          <span style={{ color: statusColors[activeStatus] || '#bbc9cf' }}>
            {activeStatus}
          </span>
        </span>
      </div>

      {/* Header row */}
      <div className="flex justify-between px-2 py-1 text-[9px] text-[#859398] border-b border-[#3c494e]/20 shrink-0">
        <span>SYMBOL</span>
        <span>PRICE</span>
      </div>

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto">
        {tickers.map(t => {
          const isSelected = selectedSymbol === t.symbol;
          const isUp = t.change >= 0;
          return (
            <button
              key={t.symbol}
              onClick={() => setSelectedSymbol(t.symbol)}
              className={`w-full px-2 py-2 flex flex-col gap-0.5 border-b border-[#3c494e]/10 transition-all text-left group cursor-pointer ${
                isSelected ? 'bg-[#1d2026] border-l-2 border-l-[#00d4ff]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex justify-between items-center w-full">
                <span className={`font-extrabold text-[11px] ${isSelected ? 'text-[#00d4ff]' : 'text-white group-hover:text-[#00d4ff]'}`}>
                  {t.display}
                </span>
                <span className={`font-extrabold text-[11px] transition-colors ${isUp ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                  ₹{t.price.toLocaleString(undefined, { maximumFractionDigits: t.type === 'crypto' && t.price < 10 ? 4 : 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center w-full">
                <span className="text-[9px] text-[#859398]">
                  {marketMode === 'INDIAN' ? '🇮🇳 NSE / BSE' : '🌐 GLOBAL'}
                </span>
                <span className={`text-[10px] font-bold ${isUp ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                  {isUp ? '▲' : '▼'} {Math.abs(t.change)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5 border-t border-[#3c494e]/20 text-[9px] text-[#859398] shrink-0">
        <div className="text-center leading-relaxed">
          {marketMode === 'INDIAN' ? (
            <>
              🇮🇳 Active Feed: INSTITUTIONAL<br />
              🇮🇳 Indian Stock Indices
            </>
          ) : (
            <>
              🌐 Global Market Feed<br />
              📊 Crypto/Forex Stream
            </>
          )}
        </div>
      </div>
    </div>
  );
}
