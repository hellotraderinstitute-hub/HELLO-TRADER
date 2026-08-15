'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import InstallPwaModal from './InstallPwaModal';
import { TrendingUp, Layers, Radar, Brain, Wallet, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

export default function Dashboard({ setActiveTab }) {
  const { paperBalance, activePnlTotal, positions, tradeHistory, currentStudent, isExpiredTrial, openRechargeModal } = useTrading();
  const { marketMode } = useMarketProvider();
  const currencySymbol = marketMode === 'INDIAN' ? '₹' : '$';

  const handleCardClick = (tabId) => {
    const lockedTabs = ['option-chain', 'scanner', 'ai-lab', 'market-intel'];
    if (isExpiredTrial && lockedTabs.includes(tabId)) {
      openRechargeModal();
    } else {
      setActiveTab(tabId);
    }
  };

  // Compute derived metrics from real data
  const totalEquity = paperBalance + activePnlTotal;
  const closedTrades = tradeHistory || [];
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : '0.0';

  // Live ticking 4-Day Trial Countdown state
  const [trialTimeLeft, setTrialTimeLeft] = useState({ 
    days: 4, hours: 0, minutes: 0, seconds: 0, expired: false, formatted: '04d : 00h : 00m : 00s' 
  });

  useEffect(() => {
    const updateCountdown = () => {
      if (!currentStudent?.trialStartedAt) {
        setTrialTimeLeft({ days: 4, hours: 0, minutes: 0, seconds: 0, expired: false, formatted: '04d : 00h : 00m : 00s' });
        return;
      }

      const trialDuration = 4 * 24 * 60 * 60 * 1000; // 4 days in ms
      const startedAt = new Date(currentStudent.trialStartedAt).getTime();
      const expiresAt = startedAt + trialDuration;
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTrialTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, formatted: '00d : 00h : 00m : 00s' });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (n) => String(n).padStart(2, '0');
      const formatted = `${pad(days)}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;

      setTrialTimeLeft({ days, hours, minutes, seconds, expired: false, formatted });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentStudent?.trialStartedAt]);

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

      {/* App Install Banner */}
      <InstallPwaModal variant="banner" />

      {/* Trial Countdown Banner */}
      {currentStudent && (
        <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 shadow-lg ${
          trialTimeLeft.expired 
            ? 'bg-red-500/10 border-red-500/30 text-red-400' 
            : trialTimeLeft.days < 1
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse'
            : 'bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF]'
        }`}>
          <div className="flex items-center gap-3">
            {trialTimeLeft.expired ? <AlertTriangle className="w-6 h-6 shrink-0 animate-bounce" /> : <Clock className="w-6 h-6 shrink-0 animate-spin" style={{ animationDuration: '4s' }} />}
            <div>
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                {trialTimeLeft.expired ? 'FREE TRIAL EXPIRED' : '4-DAY FREE TRIAL ACTIVE'}
                {!trialTimeLeft.expired && trialTimeLeft.days < 1 && (
                  <span className="bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 rounded">EXPIRING SOON</span>
                )}
              </h3>
              <p className="text-xs opacity-90 mt-0.5">
                {trialTimeLeft.expired 
                  ? 'Your 4-day trial period has ended. Recharge tokens to reactivate trading access.' 
                  : `Real-time countdown remaining. Recharge tokens before expiry to prevent interruption.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xl md:text-2xl font-black tabular-nums tracking-wider bg-[#0b0e14] px-4 py-2 rounded-lg border border-white/10 text-white font-mono shadow-inner">
              {trialTimeLeft.formatted}
            </div>

            <button
              onClick={() => setActiveTab('wallet')}
              className="px-4 py-2 bg-[#00FF41] hover:bg-[#00FF41]/90 text-black font-extrabold rounded-lg text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,255,65,0.3)] transition-all shrink-0 cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              RECHARGE / ACTIVATE
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
          onClick={() => handleCardClick('desk')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <TrendingUp className="w-8 h-8 text-[#00d4ff] mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">Trading Desk</h3>
          <p className="text-xs text-gray-400 mt-1">Access Live Charts, Order Book & Paper Execution</p>
        </button>

        <button
          onClick={() => handleCardClick('option-chain')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <Layers className="w-8 h-8 text-[#00e639] mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">Option Chain AI</h3>
          <p className="text-xs text-gray-400 mt-1">NSE & Crypto Greeks, PCR & Max Pain</p>
        </button>

        <button
          onClick={() => handleCardClick('scanner')}
          className="p-5 bg-[#161B22] hover:bg-[#1d2026] rounded-xl border border-white/10 hover:border-[#00d4ff] transition-all text-left group shadow-lg"
        >
          <Radar className="w-8 h-8 text-amber-400 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="font-bold text-white text-sm">Market Scanner</h3>
          <p className="text-xs text-gray-400 mt-1">Smart Money Concepts & Presets</p>
        </button>

        <button
          onClick={() => handleCardClick('ai-lab')}
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
