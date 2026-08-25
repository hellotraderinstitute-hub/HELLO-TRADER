'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Layers, 
  Brain, 
  Radar, 
  Wallet, 
  Users, 
  Settings, 
  HelpCircle,
  ShieldCheck,
  Zap,
  Globe,
  Share2
} from 'lucide-react';

import { useTrading } from '../context/TradingContext';
import { Lock } from 'lucide-react';
import InstallPwaModal from './InstallPwaModal';

export default function Sidebar({ activeTab, setActiveTab, handleLogout, isAdmin }) {
  const { isExpiredTrial, openRechargeModal } = useTrading();

  const mainNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'desk', label: 'Trading Desk', icon: TrendingUp },
    { id: 'trade', label: 'Trade', icon: Zap },
    { id: 'option-chain', label: 'Option Chain', icon: Layers, isLocked: true },
    { id: 'market-intel', label: 'Market Intel (FII/DII)', icon: Globe, isLocked: true },
    { id: 'ai-lab', label: 'AI Lab', icon: Brain, isLocked: true },
    { id: 'scanner', label: 'Scanner', icon: Radar, isLocked: true },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'referral', label: 'Referral & Earnings', icon: Users }
  ];

  if (isAdmin) {
    mainNav.push({ id: 'guardian', label: 'Guardian Monitor v1', icon: ShieldCheck });
    mainNav.push({ id: 'admin', label: 'Admin Portal', icon: ShieldCheck });
    mainNav.push({ id: 'static-ip', label: '🌐 Static IP Fleet', icon: Globe });
    mainNav.push({ id: 'social-media', label: 'AI Social Manager', icon: Share2 });
  }

  const handleNavClick = (item) => {
    if (item.id === 'social-media') {
      window.location.href = '/admin/social-media';
      return;
    }
    if (item.id === 'static-ip') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/admin/static-ip';
        return;
      }
      setActiveTab('static-ip');
      return;
    }
    if (item.id === 'admin') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/admin';
        return;
      }
      setActiveTab('admin');
      return;
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
      return;
    }
    if (isExpiredTrial && item.isLocked) {
      openRechargeModal();
    } else {
      setActiveTab(item.id);
    }
  };

  return (
    <aside className="w-[240px] bg-[#0b0e14] border-r border-[#3c494e]/30 flex flex-col h-screen fixed left-0 top-0 z-50 font-sans select-none">
      {/* User Avatar & Brand Header */}
      <div className="p-4 border-b border-[#3c494e]/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[#32353c] border border-[#00d4ff]/40 p-0.5 shadow-[0_0_10px_rgba(0,212,255,0.3)]">
            <img 
              src="/logo.png" 
              alt="Avatar" 
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-extrabold text-sm tracking-wider text-white truncate">Trader Pro</span>
            <span className="text-[10px] font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.2 rounded border border-[#00d4ff]/20 font-semibold w-fit">
              LIVE ACC UNLOCKED
            </span>
          </div>
        </div>

        {/* Brand Logo */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <img 
            src="/logo.png" 
            alt="HELLO TRADER" 
            className="h-8 w-auto object-contain drop-shadow-[0_0_12px_rgba(0,212,255,0.5)]"
          />
        </div>
      </div>

      {/* Main Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto font-mono text-xs">
        {mainNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const showLock = isExpiredTrial && item.isLocked;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-xs font-semibold ${
                isActive
                  ? 'bg-[#1d2026] text-[#00d4ff] border-r-2 border-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.2)] font-bold'
                  : 'text-[#bbc9cf] hover:bg-[#1d2026]/50 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00d4ff]' : 'text-[#859398]'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {showLock && (
                <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Nav Settings */}
      <div className="p-3 border-t border-[#3c494e]/20 space-y-2 font-mono text-xs">
        <div className="px-1 py-1">
          <InstallPwaModal variant="sidebar" />
        </div>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
            activeTab === 'settings'
              ? 'bg-[#1d2026] text-[#00d4ff] border-r-2 border-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.2)] font-bold'
              : 'text-[#bbc9cf] hover:text-white hover:bg-[#1d2026]/50'
          }`}
        >
          <Settings className="w-4 h-4 text-[#859398]" />
          <span>Settings</span>
        </button>
        {handleLogout && (
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all font-bold"
          >
            <HelpCircle className="w-4 h-4 text-red-400" />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
