'use client';

import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { 
  BarChart2, 
  Layers, 
  Search, 
  Cpu, 
  Wallet, 
  ShieldCheck, 
  Bell, 
  RotateCcw, 
  Activity
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const { balance, activePnlTotal } = useTrading();
  const notifications = []; // Notifications feature not yet implemented
  const resetAccount = () => alert('Demo wallet reset is disabled in production mode.');
  const [showNotifications, setShowNotifications] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const navItems = [
    { id: 'desk', label: 'Trading Desk', icon: BarChart2 },
    { id: 'option-chain', label: 'Option Chain AI', icon: Layers },
    { id: 'scanner', label: 'Scanner', icon: Search },
    { id: 'ai-lab', label: 'AI Lab', icon: Cpu },
    { id: 'wallet', label: 'Wallet & VIP', icon: Wallet },
    { id: 'admin', label: 'Admin Portal', icon: ShieldCheck }
  ];

  return (
    <header className="bg-[#070A12]/90 backdrop-blur-xl border-b border-[#00F0FF]/20 px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
      {/* Left: Brand Logo & Navigation */}
      <div className="flex items-center gap-6">
        <div 
          onClick={() => setActiveTab('desk')}
          className="flex items-center gap-3 cursor-pointer group py-1"
        >
          {!logoError ? (
            <img 
              src="/logo.png" 
              alt="HELLO TRADER" 
              onError={() => setLogoError(true)}
              className="h-10 max-w-[200px] object-contain drop-shadow-[0_0_15px_rgba(0,240,255,0.4)] group-hover:scale-105 transition-transform" 
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#00F0FF] to-[#7000FF] p-0.5 shadow-[0_0_15px_rgba(0,240,255,0.5)]">
                <div className="w-full h-full bg-[#070A12] rounded-[6px] flex items-center justify-center font-black text-[#00F0FF] text-sm">
                  HT
                </div>
              </div>
              <span className="font-extrabold text-lg tracking-wider text-white">
                HELLO <span className="text-[#00F0FF]">TRADER</span>
              </span>
            </div>
          )}
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-[#0F172A]/80 p-1.5 rounded-xl border border-[#00F0FF]/20 backdrop-blur-md">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#00F0FF] to-[#7000FF] text-black shadow-[0_0_15px_rgba(0,240,255,0.4)] font-extrabold'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-[#00F0FF]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Balance, Notifications, Reset */}
      <div className="flex items-center gap-3">
        {/* Wallet Balance Pill */}
        <div className="hidden sm:flex items-center gap-4 bg-[#0F172A]/90 border border-[#00F0FF]/20 px-3.5 py-1.5 rounded-xl text-xs font-mono shadow-inner">
          <div>
            <span className="text-gray-400 text-[9px] block uppercase tracking-wider">DEMO CAPITAL</span>
            <span className="font-extrabold text-white text-sm">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="h-6 w-[1px] bg-[#00F0FF]/20" />
          <div>
            <span className="text-gray-400 text-[9px] block uppercase tracking-wider">REALTIME P&L</span>
            <span className={`font-extrabold text-xs ${activePnlTotal >= 0 ? 'text-[#00FF88]' : 'text-[#FF3366]'}`}>
              {activePnlTotal >= 0 ? '+' : ''}${activePnlTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Live Websocket Status */}
        <div className="hidden xl:flex items-center gap-2 bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/30 px-3 py-1 rounded-full text-xs font-mono font-bold">
          <span className="w-2 h-2 rounded-full bg-[#00FF88] animate-ping" />
          <span>LIVE MARKET FEED</span>
        </div>

        {/* Reset Account Button */}
        <button
          onClick={resetAccount}
          title="Reset Demo Wallet to $100,000"
          className="p-2.5 rounded-xl bg-[#0F172A] hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-[#00F0FF]/20 shadow-md"
        >
          <RotateCcw className="w-4 h-4 text-[#00F0FF]" />
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2.5 rounded-xl bg-[#0F172A] hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-[#00F0FF]/20 relative shadow-md"
          >
            <Bell className="w-4 h-4 text-[#00F0FF]" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-[#00FF88] rounded-full animate-ping" />
            )}
          </button>

          {/* Dropdown Modal */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-[#0F172A]/95 border border-[#00F0FF]/30 rounded-xl shadow-2xl z-50 p-3 text-xs backdrop-blur-xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#00F0FF]/20 font-bold text-white">
                <span className="flex items-center gap-1.5 text-[#00F0FF]">
                  <Activity className="w-4 h-4" />
                  System Notifications
                </span>
                <span className="text-[10px] text-gray-400">{notifications.length} alerts</span>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 font-mono">
                {notifications.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">No recent notifications</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-2 rounded-lg bg-[#070A12] border border-white/5">
                      <div className="flex items-center justify-between font-bold text-gray-200">
                        <span>{n.title}</span>
                        <span className="text-[9px] text-gray-500">{n.time}</span>
                      </div>
                      <p className="text-gray-400 text-[11px] mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
