'use client';

import React, { useState, useEffect } from 'react';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Settings, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ProviderSettings() {
  const { 
    activeProvider, setActiveProvider, 
    PROVIDERS, providerKeys, updateProviderKeys, providerStatus, providerMetrics
  } = useMarketProvider();

  const [localKeys, setLocalKeys] = useState(providerKeys);

  // Keep localKeys synced if context changes externally
  useEffect(() => {
    setLocalKeys(providerKeys);
  }, [providerKeys]);

  const handleLocalKeyChange = (provider, field, value) => {
    setLocalKeys(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }));
  };

  const handleSave = (provider) => {
    updateProviderKeys(provider, localKeys[provider]);
    // Set it active to test it
    if (activeProvider !== provider) {
      setActiveProvider(provider);
    }
  };

  return (
    <div className="bg-[#10131a] rounded-xl border border-[#3c494e]/40 p-4 font-mono text-xs">
      <div className="flex items-center gap-2 border-b border-[#3c494e]/30 pb-3 mb-4">
        <Settings className="w-5 h-5 text-[#00d4ff]" />
        <h2 className="text-sm font-bold text-white">Market Data Providers</h2>
      </div>

      {/* Provider Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-6">
        {Object.values(PROVIDERS).map(provider => (
          <button
            key={provider.id}
            onClick={() => setActiveProvider(provider.id)}
            className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all ${
              activeProvider === provider.id
                ? 'bg-[#00d4ff]/10 border-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.2)]'
                : 'bg-[#0b0e14] border-[#3c494e]/40 hover:border-[#3c494e] hover:bg-white/[0.02]'
            }`}
          >
            <span className="text-xl">{provider.flag}</span>
            <span className={`font-bold ${activeProvider === provider.id ? 'text-[#00d4ff]' : 'text-[#bbc9cf]'}`}>
              {provider.label}
            </span>
            <div className="flex items-center gap-1 text-[9px]">
              <span className={`w-1.5 h-1.5 rounded-full ${
                providerStatus[provider.id] === 'LIVE' ? 'bg-[#00e639]' : 
                providerStatus[provider.id] === 'CONNECTING' ? 'bg-yellow-400' : 'bg-gray-500'
              }`} />
              <span className="text-gray-500">{providerStatus[provider.id]}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Config Panel based on selected provider */}
      <div className="bg-[#0b0e14] border border-[#3c494e]/30 rounded-lg p-4">
        {activeProvider === 'BINANCE' && (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#00e639] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-white mb-1">Binance WebSocket API (Crypto)</h3>
              <p className="text-[#859398] text-[11px]">Free public endpoint. No API keys required. Provides 100ms real-time crypto ticks and historical klines.</p>
            </div>
          </div>
        )}

        {activeProvider === 'DHAN' && (
          <div className="space-y-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <span className="text-xl">🇮🇳</span> Dhan HQ API v2 (NSE / BSE)
            </h3>
            <p className="text-[#859398] text-[11px] mb-2">Requires Dhan API access token and client ID for live Indian market data.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#bbc9cf] mb-1 text-[10px]">CLIENT ID</label>
                <input 
                  type="text" 
                  value={localKeys.DHAN.clientId} 
                  onChange={(e) => handleLocalKeyChange('DHAN', 'clientId', e.target.value)}
                  placeholder="Enter Dhan Client ID"
                  className="w-full bg-[#10131a] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white"
                />
              </div>
              <div>
                <label className="block text-[#bbc9cf] mb-1 text-[10px]">ACCESS TOKEN</label>
                <input 
                  type="password" 
                  value={localKeys.DHAN.accessToken} 
                  onChange={(e) => handleLocalKeyChange('DHAN', 'accessToken', e.target.value)}
                  placeholder="Enter API Access Token"
                  className="w-full bg-[#10131a] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white"
                />
              </div>
            </div>
            
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => handleSave('DHAN')}
                className="px-4 py-2 bg-[#00d4ff] hover:bg-[#00d4ff]/80 text-black font-extrabold rounded text-xs transition-colors"
              >
                Save
              </button>
              <button 
                onClick={() => handleSave('DHAN')}
                className="px-4 py-2 bg-transparent border border-[#00d4ff]/50 text-[#00d4ff] hover:bg-[#00d4ff]/10 font-bold rounded text-xs transition-colors"
              >
                Test Connection
              </button>
            </div>
            
            {/* Real-time Diagnostics Display */}
            {providerMetrics && providerMetrics.DHAN && (
              <div className="mt-4 p-3 bg-black/40 border border-[#3c494e]/30 rounded-lg">
                <h4 className="text-[11px] font-bold text-gray-400 mb-2 border-b border-[#3c494e]/20 pb-1">DHAN DIAGNOSTICS</h4>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-[#859398]">Auth Status:</span>
                    <span className={`font-bold ${providerMetrics.DHAN.authStatus === 'Success' ? 'text-[#00e639]' : providerMetrics.DHAN.authStatus === 'Failed' ? 'text-[#ffb4ab]' : 'text-yellow-400'}`}>
                      {providerMetrics.DHAN.authStatus || 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#859398]">WS Status:</span>
                    <span className="font-bold text-white">{providerMetrics.DHAN.wsStatus || providerStatus.DHAN}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#859398]">Provider:</span>
                    <span className="font-bold text-[#00d4ff]">Dhan HQ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#859398]">Latency:</span>
                    <span className="font-bold text-white">{providerMetrics.DHAN.latency ? `${providerMetrics.DHAN.latency}ms` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#859398]">Subscribed Symbols:</span>
                    <span className="font-bold text-white">{providerMetrics.DHAN.activeSymbols || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#859398]">Total Ticks Received:</span>
                    <span className="font-bold text-[#00e639]">{providerMetrics.DHAN.liveTicks || 0}</span>
                  </div>
                  <div className="flex justify-between col-span-2 border-t border-[#3c494e]/20 mt-1 pt-1">
                    <span className="text-[#859398]">Last Tick Symbol:</span>
                    <span className="font-bold text-white">{providerMetrics.DHAN.lastSymbol || '—'}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-[#859398]">Last Tick Time:</span>
                    <span className="font-bold text-white">{providerMetrics.DHAN.lastTickTime || '—'}</span>
                  </div>
                  {providerMetrics.DHAN.firstTick && (
                    <div className="col-span-2 mt-2 p-2 bg-[#00d4ff]/10 border border-[#00d4ff]/20 rounded text-[#00d4ff] font-mono text-[9px] break-words whitespace-pre-wrap overflow-x-auto max-h-40">
                      <span className="font-bold block mb-1">FIRST RECEIVED TICK:</span>
                      {providerMetrics.DHAN.firstTick}
                    </div>
                  )}
                  {providerMetrics.DHAN.error && (
                    <div className="col-span-2 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 font-mono text-[9px] break-words whitespace-pre-wrap overflow-x-auto max-h-48">
                      <span className="font-bold block mb-1">CONNECTION / PROTOCOL DIAGNOSTICS:</span>
                      {providerMetrics.DHAN.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeProvider === 'BREEZE' && (
          <div className="space-y-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <span className="text-xl">🏦</span> ICICI Breeze API (NSE / BSE)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[#bbc9cf] mb-1 text-[10px]">API KEY</label>
                <input type="text" value={providerKeys.BREEZE.apiKey} onChange={(e) => updateProviderKeys('BREEZE', { apiKey: e.target.value })} className="w-full bg-[#10131a] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white" />
              </div>
              <div>
                <label className="block text-[#bbc9cf] mb-1 text-[10px]">API SECRET</label>
                <input type="password" value={providerKeys.BREEZE.apiSecret} onChange={(e) => updateProviderKeys('BREEZE', { apiSecret: e.target.value })} className="w-full bg-[#10131a] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white" />
              </div>
              <div>
                <label className="block text-[#bbc9cf] mb-1 text-[10px]">SESSION TOKEN</label>
                <input type="password" value={providerKeys.BREEZE.sessionToken} onChange={(e) => updateProviderKeys('BREEZE', { sessionToken: e.target.value })} className="w-full bg-[#10131a] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white" />
              </div>
            </div>
          </div>
        )}

        {(activeProvider === 'UPSTOX' || activeProvider === 'TRUEDATA') && (
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-white mb-1">{PROVIDERS[activeProvider].label} Integration</h3>
              <p className="text-[#859398] text-[11px]">Provider adapter is loaded but OAuth/Login UI flow requires backend redirect. Set keys programmatically for now.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
