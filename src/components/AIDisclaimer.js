'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';

export default function AIDisclaimer({ className = '' }) {
  return (
    <div className={`p-3 bg-[#0B0E14] border border-white/10 rounded-lg text-xs font-mono text-gray-400 space-y-1 ${className}`}>
      <div className="flex items-center gap-1.5 font-bold text-cyan-400">
        <BookOpen className="w-3.5 h-3.5 shrink-0" />
        <span>📘 Educational & Research Purpose Only</span>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">
        This analysis is based on live market data and deterministic models. It is not financial or investment advice. Please do your own research before taking any trade.
      </p>
    </div>
  );
}
