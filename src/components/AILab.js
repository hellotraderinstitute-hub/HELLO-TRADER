'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Cpu, Send, Bot, User, Sparkles, TrendingUp, ShieldCheck, HelpCircle } from 'lucide-react';

export default function AILab() {
  const { positions, balance } = useTrading();
  const { tickers, scannerSignals, marketMode } = useMarketProvider();

  const niftyPrice = useMemo(() => {
    const t = tickers.find(tc => tc.symbol === 'NIFTY');
    return t ? t.price : 24580.40;
  }, [tickers]);

  const niftyChange = useMemo(() => {
    const t = tickers.find(tc => tc.symbol === 'NIFTY');
    return t ? t.change : +0.12;
  }, [tickers]);

  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Hello Trader! I am your AI Market Assistant. I analyze live feeds, positions, and open options contracts to deliver educational stop-loss recommendations and pattern recognition alerts.'
    }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input;
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');

    setTimeout(() => {
      let reply = "";
      const textLower = userMsg.toLowerCase();

      if (textLower.includes('position') || textLower.includes('portfolio') || textLower.includes('trade')) {
        if (positions.length === 0) {
          reply = "AI Portfolio Audit: You currently have no open paper trading positions. Open the Trading Desk or Option Chain to execute your first mock order, and I will track risk allocation.";
        } else {
          const posList = positions.map(p => `${p.display} (${p.side} ${p.quantity} Qty @ ₹${p.entryPrice})`).join(', ');
          const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
          reply = `AI Portfolio Audit: Active Trades detected: [${posList}]. Consolidated Real-Time PnL is ${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(2)}. Suggest setting a trailing stop-loss on existing options.`;
        }
      } else if (textLower.includes('nifty') || textLower.includes('option') || textLower.includes('expiry') || textLower.includes('call')) {
        const spot = niftyPrice;
        const centerStrike = Math.round(spot / 50) * 50;
        reply = `AI Options Intelligence: NIFTY 50 is trading at ₹${spot.toLocaleString()}. Put-Call Ratio (PCR) is currently 1.18. Heavy OI support resides at ${centerStrike - 100} PUT, with Call writing resistance at ${centerStrike + 100} CE. Recommend a Bull Call Spread to hedge exposure.`;
      } else if (textLower.includes('scanner') || textLower.includes('signal') || textLower.includes('alert')) {
        if (scannerSignals.length === 0) {
          reply = "AI Scanner Report: Indian Market indices are displaying consolidated horizontal ranges. No high-momentum breakouts are triggered at this time.";
        } else {
          const topSig = scannerSignals[0];
          reply = `AI Scanner Report: Recent momentum trigger on ${topSig.symbol} detected: ${topSig.signal} at price ₹${topSig.price} (${topSig.change}% change). Strength: ${topSig.strength.toFixed(0)}/100.`;
        }
      } else {
        reply = `Neural Market Insight: The underliers are testing support at critical Fibonacci retracement pivots. For education, focus on SMC order blocks. Ensure proper risk-to-reward parameters (minimum 1:2) when executing trades.`;
      }

      setMessages(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 800);
  };

  const biasPercentage = useMemo(() => {
    // Dynamically calculate bias from Nifty changes
    const base = 75;
    const shift = Math.min(20, Math.max(-20, niftyChange * 15));
    return Math.floor(base + shift);
  }, [niftyChange]);

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono flex flex-col gap-4">
      {/* Top Banner */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              AI LAB & PREMIUM INTELLIGENCE
              <span className="text-[10px] bg-[#00FF41]/20 text-[#00FF41] px-2 py-0.5 rounded border border-[#00FF41]/30">NEURAL ENGINE ACTIVE</span>
            </h1>
            <p className="text-xs text-gray-400">Real-Time Risk Analysis & Education Advisor based on Indian Market Data</p>
          </div>
        </div>
      </div>

      {/* Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left 5 Cols: Sentiment & Patterns */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Sentiment Card */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10">
            <h3 className="text-xs font-bold text-gray-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#00D4FF]" />
              AI MARKET BIAS GAUGE
            </h3>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-2xl font-extrabold ${biasPercentage >= 50 ? 'text-[#00FF41]' : 'text-red-400'}`}>
                {biasPercentage}% {biasPercentage >= 50 ? 'BULLISH' : 'BEARISH'}
              </span>
              <span className="text-xs text-gray-400">Live Institutional Flow</span>
            </div>
            <div className="w-full bg-[#0B0E14] h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${biasPercentage >= 50 ? 'bg-gradient-to-r from-[#00D4FF] to-[#00FF41]' : 'bg-red-500'}`} 
                style={{ width: `${biasPercentage}%` }}
              />
            </div>
          </div>

          {/* Dynamic Patterns Card */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 mb-2">DETECTED INSTITUTIONAL PATTERNS</h3>
            
            {marketMode === 'INDIAN' ? (
              <>
                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 text-xs">
                  <div className="flex justify-between font-bold text-purple-400 mb-1">
                    <span>NIFTY 50 (Spot: ₹{niftyPrice.toLocaleString()})</span>
                    <span>91.2% Match</span>
                  </div>
                  <p className="text-gray-300">Fair Value Gap (FVG) refill at 24,540 with liquidity grab confirmation. Bullish shift structure (BMS).</p>
                </div>
                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 text-xs">
                  <div className="flex justify-between font-bold text-purple-400 mb-1">
                    <span>BANKNIFTY (15m Timeframe)</span>
                    <span>88.5% Match</span>
                  </div>
                  <p className="text-gray-300">Descending channel breakdown sweep completed. High-volume demand block detected at 52,200.</p>
                </div>
              </>
            ) : (
              <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 text-xs">
                <div className="flex justify-between font-bold text-[#00D4FF] mb-1">
                  <span>BTC/USD (15m Timeframe)</span>
                  <span>94.8% Match</span>
                </div>
                <p className="text-gray-300">Bullish Flag Pattern completion at $94,200. Projected upside target: $96,500.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Chat */}
        <div className="lg:col-span-7 bg-[#161B22] rounded-xl border border-white/10 p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 pb-3 border-b border-white/10 text-xs font-bold text-gray-200">
            <Bot className="w-4 h-4 text-[#00D4FF]" />
            HELLO TRADER AI COPILOT
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto my-4 space-y-3 max-h-[360px] pr-2">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3 text-xs ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-[#00D4FF]/20 border border-[#00D4FF]/40 flex items-center justify-center text-[#00D4FF] shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`p-3 rounded-xl max-w-[80%] leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-[#00D4FF] text-black font-semibold shadow-md'
                      : 'bg-[#0B0E14] text-gray-200 border border-white/10'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Copilot e.g., 'Analyze my positions', 'NIFTY option chain outlook', or 'Scanner breakouts'..."
              className="flex-1 bg-[#0B0E14] border border-white/10 px-4 py-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-[#00D4FF]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-bold rounded-lg flex items-center gap-1 text-xs"
            >
              <Send className="w-4 h-4" />
              ASK
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
