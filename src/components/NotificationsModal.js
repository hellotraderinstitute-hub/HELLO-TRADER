'use client';

import React from 'react';
import { Bell, ShieldCheck, CheckCircle2, CreditCard, Award, ArrowUpRight, Zap, X } from 'lucide-react';

export default function NotificationsModal({ isOpen, onClose, notifications = [], onClearAll }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-end p-4 pt-16 bg-black/60 backdrop-blur-xs font-mono">
      <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-sm p-4 text-white shadow-2xl space-y-3 relative animate-in fade-in slide-in-from-top-4 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
              <Bell className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-xs text-white uppercase tracking-wider">NOTIFICATIONS CENTER</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs space-y-1">
              <Bell className="w-8 h-8 mx-auto text-gray-600 opacity-50 mb-2" />
              <p className="font-bold">No new notifications</p>
              <p className="text-[10px] text-gray-600">All account credits, recharges, and trading alerts will appear here.</p>
            </div>
          ) : (
            notifications.map((item, idx) => (
              <div 
                key={item.id || idx}
                className="p-2.5 bg-[#0b0e14] hover:bg-[#161B22] rounded-xl border border-white/5 text-xs space-y-1 transition-all"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-white text-[11px] flex items-center gap-1.5">
                    {item.type === 'SUCCESS' && <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF41] shrink-0" />}
                    {item.type === 'CREDIT' && <CreditCard className="w-3.5 h-3.5 text-[#00D4FF] shrink-0" />}
                    {item.type === 'ALERT' && <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    {item.title}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono shrink-0">{item.time}</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">{item.message}</p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="pt-2 border-t border-white/5">
            <button
              onClick={onClearAll}
              className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded text-[10px] font-bold transition-all"
            >
              CLEAR ALL NOTIFICATIONS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
