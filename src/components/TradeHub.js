'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Copy, ChevronDown, ArrowRight, Shield, AlertTriangle,
  Activity, Link2, Trash2, RefreshCw, Power, Eye, EyeOff,
  CheckCircle, XCircle, Clock, FileText, Settings, Bell,
  TrendingUp, Lock, Wifi, WifiOff, BarChart3, BookOpen,
} from 'lucide-react';
import AlgoTrading from './AlgoTrading';
import CopyTradingHub from './CopyTradingHub';

const MODULES = [
  {
    id: 'ALGO',
    icon: <Zap className="w-8 h-8" />,
    title: 'Algo Trading',
    subtitle: 'Signal → Webhook → Broker',
    description: 'Connect your broker and paste your webhook URL in your alert system. Your indicator signals will automatically execute real trades on your demat account.',
    features: ['Webhook Integration', 'Multi-Account Integration (Live Trading Accounts)', 'Risk Engine (Max Loss, Max Trades, SL/Target)', 'Kill Switch — Stop all automation instantly', 'Immutable Audit Logs'],
    color: '#00D4FF',
    badge: 'LIVE',
  },
  {
    id: 'COPY',
    icon: <Copy className="w-8 h-8" />,
    title: 'Copy Trading',
    subtitle: 'Follow Master Traders',
    description: 'Copy trades from verified master traders to your own demat account automatically with configurable risk controls and allocation settings.',
    features: ['Follow verified master traders', 'Fixed Qty / Multiplier / Percentage allocation', 'Per-follower risk controls', 'Emergency stop + Kill switch', 'Full trade audit trail'],
    color: '#B45FFF',
    badge: 'LIVE',
  },
];

// ── Risk Disclosure Banner ────────────────────────────────────
function RiskDisclosure() {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-amber-200 space-y-1 leading-relaxed">
        <p className="font-black text-amber-300 uppercase tracking-wide">⚠ Risk Disclosure — Please Read Carefully</p>
        <p>Trading in financial instruments involves <strong>significant market risk</strong>. Past performance does not guarantee future results. <strong>No returns are guaranteed</strong>.</p>
        <p>Hello Trader is an automated technology platform that routes your signals to your own broker. <strong>You remain fully responsible for all trading decisions and their outcomes.</strong> Hello Trader does not provide investment advice.</p>
        <p>Automated trading can result in losses that exceed your initial capital. Use risk controls (Max Daily Loss, Max Open Trades) responsibly.</p>
      </div>
    </div>
  );
}

// ── Module Selector Card ──────────────────────────────────────
function ModuleCard({ mod, onClick }) {
  return (
    <div
      onClick={mod.badge === 'LIVE' ? onClick : undefined}
      className={`relative bg-[#161B22] border rounded-2xl p-6 transition-all duration-300 space-y-4
        ${mod.badge === 'LIVE'
          ? 'border-white/10 hover:border-[#00D4FF]/50 cursor-pointer hover:shadow-[0_0_30px_rgba(0,212,255,0.1)] hover:scale-[1.01]'
          : 'border-white/5 opacity-60 cursor-not-allowed'}`}
    >
      {/* Badge */}
      <div className="absolute top-4 right-4">
        <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
          mod.badge === 'LIVE'
            ? 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30'
            : 'bg-gray-700 text-gray-400 border-gray-600'
        }`}>
          {mod.badge === 'LIVE' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-ping mr-1" />}
          {mod.badge}
        </span>
      </div>

      {/* Icon */}
      <div style={{ color: mod.color }} className="w-14 h-14 rounded-xl flex items-center justify-center"
        style={{ background: `${mod.color}15`, border: `1px solid ${mod.color}30`, color: mod.color }}>
        {mod.icon}
      </div>

      {/* Title */}
      <div>
        <h3 className="text-base font-black text-white">{mod.title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{mod.subtitle}</p>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-300 leading-relaxed">{mod.description}</p>

      {/* Features */}
      <ul className="space-y-1.5">
        {mod.features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px] text-gray-400">
            <CheckCircle className="w-3 h-3 flex-shrink-0" style={{ color: mod.color }} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {mod.badge === 'LIVE' && (
        <button className="w-full mt-2 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all"
          style={{ background: `${mod.color}20`, border: `1px solid ${mod.color}40`, color: mod.color }}>
          Open {mod.title} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

import { useTrading } from '../context/TradingContext';

// ── Main TradeHub ─────────────────────────────────────────────
export default function TradeHub({ user }) {
  const { isExpiredTrial, openRechargeModal } = useTrading();
  const [activeModule, setActiveModule] = useState(null);

  if (activeModule === 'ALGO') {
    return <AlgoTrading user={user} onBack={() => setActiveModule(null)} />;
  }
  if (activeModule === 'COPY') {
    return <CopyTradingHub user={user} onBack={() => setActiveModule(null)} />;
  }

  const handleModuleClick = (modId) => {
    if (isExpiredTrial) {
      openRechargeModal();
    } else {
      setActiveModule(modId);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto' }}
      className="p-5 bg-[#0B0E14] text-white font-mono space-y-5 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#00D4FF]" />
            TRADE ENGINE
            <span className="text-[10px] font-bold bg-[#00D4FF]/10 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/30">
              HELLO TRADER PRO
            </span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Signal → Hello Trader → Risk Engine → Your Broker → Exchange
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-550">
          <Lock className="w-3 h-3" /> AES-256 Encrypted · Audit Logged · Non-Custodial
        </div>
      </div>

      {/* Risk Disclosure */}
      <RiskDisclosure />

      {/* Module Cards */}
      <div>
        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-3">Select Module</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULES.map(mod => (
            <ModuleCard key={mod.id} mod={mod} onClick={() => handleModuleClick(mod.id)} />
          ))}
        </div>
      </div>

      {/* Compliance footer */}
      <div className="text-[10px] text-gray-600 border-t border-white/5 pt-4 space-y-1">
        <p>• Hello Trader is a technology platform. It does not provide investment advice or portfolio management services.</p>
        <p>• API credentials are encrypted with AES-256 and never stored in plain text. Broker passwords are never stored.</p>
        <p>• All trade actions are logged in an immutable audit trail. Logs are retained for compliance review.</p>
        <p>• Users can disconnect their broker and stop all automation at any time using the Kill Switch.</p>
        <p>• SEBI/IRDA regulations apply. Ensure your automated trading complies with your broker's terms of service.</p>
      </div>
    </div>
  );
}
