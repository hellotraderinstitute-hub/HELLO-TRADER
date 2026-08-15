'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Server, Activity, Loader2 } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { useReferralContext } from '../context/ReferralContext';

// Maximum time to wait for initialization before forcing proceed (ms)
const INIT_TIMEOUT_MS = 300;

export default function GlobalLoader({ children }) {
  const trading = useTrading();
  const market = useMarketProvider();
  const referral = useReferralContext();

  const isTradingInit = trading?.initialized === true;
  const isMarketInit = market?.initialized === true;
  const isReferralInit = referral?.initialized === true;

  const isReady = isTradingInit && isMarketInit && isReferralInit;

  const hasError = trading?.error || market?.error || referral?.error;

  // Timeout fallback — if init takes more than INIT_TIMEOUT_MS, force-proceed
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (isReady) return; // already ready, no need for timer
    const timer = setTimeout(() => {
      console.warn('[GlobalLoader] Initialization timeout — proceeding anyway');
      setTimedOut(true);
    }, INIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isReady]);

  if (hasError) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center text-white p-6 font-mono">
        <div className="bg-[#10131a] border border-red-500/30 rounded-2xl w-full max-w-md p-8 text-center space-y-4">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-red-500">INITIALIZATION FAILED</h2>
          <p className="text-[#bbc9cf] text-sm">
            {trading?.error?.message || market?.error?.message || referral?.error?.message || "Failed to establish secure connection to the backend."}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded border border-red-500/30 font-bold"
          >
            RETRY CONNECTION
          </button>
        </div>
      </div>
    );
  }

  // Proceed to children once ready OR timed out
  if (isReady || timedOut) {
    return children;
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center text-white p-6 font-mono relative overflow-hidden">
      {/* Dark background grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10" />
      
      <div className="z-10 flex flex-col items-center space-y-8 w-full max-w-sm">
        
        <div className="relative">
          <div className="absolute inset-0 bg-[#00d4ff]/20 blur-xl rounded-full animate-pulse" />
          <Server className="w-16 h-16 text-[#00d4ff] relative z-10" />
        </div>

        <div className="text-center space-y-2 w-full">
          <h1 className="text-2xl font-bold tracking-widest text-[#bbc9cf] animate-pulse">ESTABLISHING</h1>
          <p className="text-sm text-[#3c494e]">SECURE CONNECTION LAYER</p>
        </div>

        <div className="w-full space-y-3 bg-[#10131a] p-4 rounded border border-[#3c494e]/30">
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#bbc9cf]">MARKET DATA ENGINE</span>
            {isMarketInit ? <span className="text-[#00e639]">ONLINE</span> : <Loader2 className="w-3 h-3 text-[#00d4ff] animate-spin" />}
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#bbc9cf]">TRADING PROTOCOL</span>
            {isTradingInit ? <span className="text-[#00e639]">ONLINE</span> : <Loader2 className="w-3 h-3 text-[#00d4ff] animate-spin" />}
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#bbc9cf]">NETWORK TOPOLOGY</span>
            {isReferralInit ? <span className="text-[#00e639]">ONLINE</span> : <Loader2 className="w-3 h-3 text-[#00d4ff] animate-spin" />}
          </div>

        </div>

      </div>
    </div>
  );
}
