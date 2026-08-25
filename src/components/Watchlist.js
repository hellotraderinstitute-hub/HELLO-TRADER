'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Activity, Search, X, Star } from 'lucide-react';

export default function Watchlist() {
  const { 
    tickers, selectedSymbol, setSelectedSymbol, activeBinanceStatus,
    activeProvider, providerStatus, marketMode 
  } = useMarketProvider();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('ALL'); // ALL, FAVS, INDEX, EQUITY, COMMODITY
  const [favorites, setFavorites] = useState(['NIFTY', 'BANKNIFTY', 'RELIANCE']);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user_fav_symbols');
      if (saved) {
        try { setFavorites(JSON.parse(saved)); } catch (_) {}
      }
    }
  }, []);

  const toggleFavorite = (e, sym) => {
    e.stopPropagation();
    let updated;
    if (favorites.includes(sym)) {
      updated = favorites.filter(s => s !== sym);
    } else {
      updated = [...favorites, sym];
    }
    setFavorites(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_fav_symbols', JSON.stringify(updated));
    }
  };

  const filteredTickers = useMemo(() => {
    let list = tickers;

    // Filter by Tab
    if (filterTab === 'FAVS') {
      list = list.filter(t => favorites.includes(t.symbol));
    } else if (filterTab === 'INDEX') {
      list = list.filter(t => t.type === 'index');
    } else if (filterTab === 'EQUITY') {
      list = list.filter(t => t.type === 'equity');
    } else if (filterTab === 'COMMODITY') {
      list = list.filter(t => t.type === 'commodity');
    }

    // Filter by Search Term
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter(t => 
      t.symbol.toLowerCase().includes(q) || 
      t.display.toLowerCase().includes(q) ||
      (t.name && t.name.toLowerCase().includes(q))
    );
  }, [tickers, searchTerm, filterTab, favorites]);

  const statusColors = { 
    LIVE: '#00e639', 
    RECONNECTING: '#FFD700', 
    ERROR: '#ffb4ab', 
    CONNECTING: '#bbc9cf',
    IDLE: '#859398'
  };

  const activeStatus = marketMode === 'INDIAN' 
    ? (providerStatus[activeProvider] || 'LIVE') 
    : activeBinanceStatus;

  return (
    <div className="h-full flex flex-col bg-[#10131a] font-mono text-xs overflow-hidden select-none">
      {/* Header */}
      <div className="px-2.5 py-2 border-b border-[#3c494e]/30 flex items-center justify-between shrink-0">
        <span className="font-extrabold text-[11px] text-[#bbc9cf] flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 text-[#00d4ff]" />
          MARKET WATCH
          <span className="ml-1 text-[8px] bg-[#00d4ff]/10 text-[#00d4ff] px-1.5 py-0.5 rounded border border-[#00d4ff]/30 font-semibold">
            HTME (SMDE v2.0)
          </span>
        </span>
        <span className="flex items-center gap-1 text-[9px]">
          <span 
            className="w-1.5 h-1.5 rounded-full animate-ping" 
            style={{ backgroundColor: statusColors[activeStatus] || '#00e639' }} 
          />
          <span style={{ color: statusColors[activeStatus] || '#00e639' }} className="font-bold">
            {activeStatus}
          </span>
        </span>
      </div>

      {/* Stock Search Bar */}
      <div className="p-1.5 border-b border-[#3c494e]/20 bg-[#0b0e14] shrink-0">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search stock, index, commodity..."
            className="w-full bg-[#161B22] border border-white/10 text-white placeholder-gray-500 pl-7 pr-7 py-1.5 rounded text-[11px] outline-none focus:border-[#00D4FF] transition-all"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-2 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 mt-1.5 overflow-x-auto text-[9px] font-bold scrollbar-none pb-0.5">
          {[
            { id: 'ALL', label: 'ALL' },
            { id: 'FAVS', label: `⭐ (${favorites.length})` },
            { id: 'INDEX', label: 'INDICES' },
            { id: 'EQUITY', label: 'STOCKS' },
            { id: 'COMMODITY', label: 'COMMODITY' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-2 py-0.5 rounded transition-all whitespace-nowrap ${
                filterTab === tab.id 
                  ? 'bg-[#00D4FF] text-black font-extrabold shadow-sm' 
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header row */}
      <div className="flex justify-between px-2.5 py-1 text-[9px] text-[#859398] border-b border-[#3c494e]/20 shrink-0 font-bold">
        <span>SYMBOL ({filteredTickers.length})</span>
        <span>LTP PRICE</span>
      </div>

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
        {filteredTickers.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-[10px] space-y-1">
            <p className="font-bold text-gray-400">No assets found</p>
            <p className="text-[9px]">Try searching for "NIFTY", "BANKNIFTY", "GOLD", "TCS", or "RELIANCE"</p>
          </div>
        ) : (
          filteredTickers.map(t => {
            const isSelected = selectedSymbol === t.symbol;
            const isFav = favorites.includes(t.symbol);
            const isUp = t.change >= 0;

            return (
              <div
                key={t.symbol}
                onClick={() => setSelectedSymbol(t.symbol)}
                className={`w-full px-2.5 py-2 flex items-center justify-between transition-all cursor-pointer group ${
                  isSelected 
                    ? 'bg-[#1d2026] border-l-2 border-l-[#00d4ff]' 
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <button 
                    onClick={(e) => toggleFavorite(e, t.symbol)}
                    className="p-0.5 text-gray-600 hover:text-amber-400 transition-colors"
                  >
                    <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`} />
                  </button>

                  <div className="flex flex-col truncate">
                    <span className={`font-extrabold text-[11px] truncate ${isSelected ? 'text-[#00d4ff]' : 'text-white group-hover:text-[#00d4ff]'}`}>
                      {t.display}
                    </span>
                    <span className="text-[9px] text-[#859398] truncate">
                      {t.name || (t.type === 'index' ? 'Index' : t.type === 'commodity' ? 'MCX Commodity' : 'NSE Equity')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className={`font-extrabold text-[11px] transition-all font-mono ${isUp ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                    ₹{t.price.toLocaleString(undefined, { minimumFractionDigits: t.type === 'crypto' && t.price < 10 ? 4 : 2, maximumFractionDigits: t.type === 'crypto' && t.price < 10 ? 4 : 2 })}
                  </span>
                  <span className={`text-[9px] font-bold ${isUp ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                    {isUp ? '▲' : '▼'} {Math.abs(t.change || 0)}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5 border-t border-[#3c494e]/20 text-[9px] text-[#859398] shrink-0 font-bold">
        <div className="text-center leading-relaxed">
          ⚡ INSTITUTIONAL FEED • 400MS TICK STREAM
        </div>
      </div>
    </div>
  );
}
