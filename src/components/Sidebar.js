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
  Zap
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, handleLogout, isAdmin }) {
  const mainNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'desk', label: 'Trading Desk', icon: TrendingUp },
    { id: 'option-chain', label: 'Option Chain', icon: Layers },
    { id: 'ai-lab', label: 'AI Lab', icon: Brain },
    { id: 'scanner', label: 'Scanner', icon: Radar },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'referral', label: 'Referral & Earnings', icon: Users }
  ];

  if (isAdmin) {
    mainNav.push({ id: 'admin', label: 'Admin Portal', icon: ShieldCheck });
  }

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
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-semibold ${
                isActive
                  ? 'bg-[#1d2026] text-[#00d4ff] border-r-2 border-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.2)] font-bold'
                  : 'text-[#bbc9cf] hover:bg-[#1d2026]/50 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#00d4ff]' : 'text-[#859398]'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Nav Settings */}
      <div className="p-3 border-t border-[#3c494e]/20 space-y-1 font-mono text-xs">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#bbc9cf] hover:text-white hover:bg-[#1d2026]/50">
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
