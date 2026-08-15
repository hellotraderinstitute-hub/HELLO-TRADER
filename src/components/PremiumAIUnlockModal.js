'use client';

import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { Crown, Zap, ShieldCheck, CheckCircle2, AlertCircle, Sparkles, X, ArrowRight, Wallet } from 'lucide-react';
import axios from 'axios';

export default function PremiumAIUnlockModal({ isOpen, onClose, featureName = 'Premium AI Feature' }) {
  const { balance, refreshFinancials } = useTrading();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const currentTokens = balance || 0;
  const passCost = 299;
  const isBalanceEnough = currentTokens >= passCost;

  const handleUnlock = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await axios.post('/api/membership/unlock-ai-pass', {}, { withCredentials: true });
      if (res.data.success) {
        setSuccessMsg('🎉 30-Day Premium AI Access Pass Activated Successfully!');
        if (refreshFinancials) refreshFinancials();
        setTimeout(() => {
          if (onClose) onClose();
        }, 1500);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#161B22] p-6 rounded-2xl border border-amber-500/40 max-w-md w-full shadow-[0_0_30px_rgba(245,158,11,0.2)] font-mono space-y-5 relative">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 mb-1">
            <Crown className="w-8 h-8 animate-bounce" />
          </div>
          <h2 className="text-lg font-black text-white flex items-center justify-center gap-2">
            UNLOCK PREMIUM AI PASS
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/40">
              30 DAYS UNLIMITED
            </span>
          </h2>
          <p className="text-xs text-gray-400">
            You tried to access <strong className="text-white">{featureName}</strong>. Upgrade to Premium AI Pass to unlock institutional tools.
          </p>
        </div>

        {/* Price & Balance Banner */}
        <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-400 font-bold uppercase">Pass Price</div>
            <div className="text-lg font-black text-amber-300">299 CASH TOKENS (₹299)</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400 font-bold uppercase">Your Balance</div>
            <div className={`text-base font-black ${isBalanceEnough ? 'text-[#00FF41]' : 'text-red-400'}`}>
              ₹{currentTokens.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Included Premium Features Checklist */}
        <div className="space-y-2 text-xs">
          <div className="text-[11px] font-bold text-gray-300 uppercase tracking-wide">Included in Premium AI Pass:</div>
          <div className="grid grid-cols-1 gap-1.5 bg-[#0B0E14] p-3 rounded-lg border border-white/5 text-gray-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Full Option Chain AI (Black-Scholes Greeks & PCR)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Real-Time Market Scanner AI (Volatility Sweeps)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>AI Lab Unlimited Symbol Technical Research</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>AI Portfolio Risk Auditor & Replay</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-lg text-xs text-[#00FF41] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Action Button */}
        {isBalanceEnough ? (
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-black font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Processing Token Deduction...' : 'UNLOCK NOW WITH 299 CASH TOKENS'}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 text-center font-bold">
              ⚠️ Insufficient Cash Tokens (Short by ₹{(passCost - currentTokens).toFixed(2)})
            </div>
            <button
              onClick={() => {
                if (onClose) onClose();
                window.location.hash = '#wallet';
              }}
              className="w-full py-3 bg-[#00D4FF] hover:bg-[#00b8dc] text-black font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              RECHARGE 299 CASH TOKENS VIA WALLET HUB
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
