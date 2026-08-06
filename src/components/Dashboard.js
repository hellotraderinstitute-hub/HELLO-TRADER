'use client';

import React from 'react';
import { useTrading } from '../context/TradingContext';
import ProviderSettings from './ProviderSettings';
import { useMarketProvider } from '../context/MarketProviderContext';
import { TrendingUp, Layers, Radar, Brain, Wallet, ArrowUpRight, Award, Zap, Activity } from 'lucide-react';

export default function Dashboard({ setActiveTab }) {
  const { paperBalance, totalEquity, activePnlTotal, winRate, positions, currentStudentId, students } = useTrading();
  const currentStudent = students.find(s => s.id === currentStudentId);
  const { marketMode } = useMarketProvider();
  const currencySymbol = marketMode === 'INDIAN' ? '₹' : '$';

  return (
    <div className="p-4 bg-[#0b0e14] text-white min-h-[calc(100vh-80px)] font-mono space-y-4">
      {/* Top Banner */}
      <div className="bg-[#161B22] p-5 rounded-xl border border-[#3c494e]/30 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <h1 className="text-xl font-black text-[#00d4ff] tracking-tight uppercase">
            {currentStudent ? `${currentStudent.name}'S DASHBOARD` : 'TRADER DASHBOARD'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">Account: {currentStudent?.id || 'PRO'} // Simulated Paper Capital Active</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('desk')}
            className="px-4 py-2 bg-gradient-to-r from-[#00d4ff] to-[#7000ff] text-black font-extrabold rounded-lg text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,212,255,0.4)]"
          >
            <TrendingUp className="w-4 h-4" />
            OPEN TRADING TERMINAL
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs mt-6">
        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00d4ff]/10 rounded-full blur-xl" />
          <span className="text-gray-400 text-[10px] uppercase font-bold">TOTAL PORTFOLIO EQUITY</span>
          <div className="text-2xl font-black text-white mt-1">
            {currencySymbol}{totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          {(() => {
            const growthRate = ((totalEquity - 5000000) / 5000000) * 100;
            const isPositive = growthRate >= 0;
            return (
              <span className={`text-[10px] font-bold mt-1 block ${isPositive ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                {isPositive ? '+' : ''}{growthRate.toFixed(2)}% Realized Growth
              </span>
            );
          })()}
        </div>

        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 relative overflow-hidden">
          <span className="text-gray-400 text-[10px] uppercase font-bold">AVAILABLE MARGIN</span>
          <div className="text-2xl font-black text-[#00d4ff] mt-1">
            {currencySymbol}{paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">Free Liquidity</span>
        </div>

        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 relative overflow-hidden">
          <span className="text-gray-400 text-[10px] uppercase font-bold">WIN RATE %</span>
          <div className="text-2xl font-black text-[#00e639] mt-1">{winRate}%</div>
          <span className="text-[10px] text-gray-400 mt-1 block">Profit Factor: 2.45</span>
        </div>

        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 relative overflow-hidden">
          <span className="text-gray-400 text-[10px] uppercase font-bold">ACTIVE POSITIONS</span>
          <div className="text-2xl font-black text-purple-400 mt-1">{positions.length}</div>
          <span className="text-[10px] text-gray-400 mt-1 block">Real-time PnL Tracking</span>
        </div>
      </div>

      {/* Quick Action Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab('desk')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <TrendingUp className="w-8 h-8 text-[#00d4ff] mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">Trading Desk</h3>
          <p className="text-xs text-gray-400 mt-1">Access Live Charts, Order Book & Paper Execution</p>
        </button>

        <button
          onClick={() => setActiveTab('option-chain')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <Layers className="w-8 h-8 text-[#00e639] mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">Option Chain AI</h3>
          <p className="text-xs text-gray-400 mt-1">NSE & Crypto Greeks, PCR & Max Pain</p>
        </button>

        <button
          onClick={() => setActiveTab('scanner')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <Radar className="w-8 h-8 text-amber-400 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">Market Scanner</h3>
          <p className="text-xs text-gray-400 mt-1">Smart Money Concepts & Presets</p>
        </button>

        <button
          onClick={() => setActiveTab('ai-lab')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <Brain className="w-8 h-8 text-purple-400 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">AI Lab Assistant</h3>
          <p className="text-xs text-gray-400 mt-1">Pattern Recognition & Trade Copilot</p>
        </button>
      </div>
    </div>
  );
}
