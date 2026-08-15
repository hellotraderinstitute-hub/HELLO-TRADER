'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import apiClient from '../lib/axios';
import { 
  Cpu, Send, Bot, Search, AlertTriangle, RefreshCw, Lock, ExternalLink, ChevronDown, ChevronUp, Clock, ShieldCheck, Activity
} from 'lucide-react';

const POPULAR_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ITC', 'SBIN', 'BEL'];

export default function AILab() {
  const { isExpiredTrial, openRechargeModal, authLoading } = useTrading();
  const { setSelectedSymbol } = useMarketProvider();

  useEffect(() => {
    if (!authLoading && isExpiredTrial) {
      openRechargeModal();
    }
  }, [authLoading, isExpiredTrial, openRechargeModal]);

  // Active Stock/Index Intelligence Dossier State (For Top Detailed Inspection Panel)
  const [activeAsset, setActiveAsset] = useState('RELIANCE');
  const [activeAssetType, setActiveAssetType] = useState('EQUITY');
  const [activeDossier, setActiveDossier] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState(null);

  // Collapsible section toggles
  const [sectionsExpanded, setSectionsExpanded] = useState({
    dna: true,
    fundamentals: true,
    quarterly: true,
    technicals: true,
    historical: true,
    smc: true,
    news: true,
    actions: false,
    ownership: false,
    competitors: false,
    valuation: true,
    risk: true,
    scenarios: true
  });

  const toggleSection = (key) => {
    setSectionsExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Active AI Mode State & Loading
  const [activeMode, setActiveMode] = useState('ANALYSE');
  const [isLoading, setIsLoading] = useState(false);

  // ── Conversation Chat History Stream State ──
  const [messages, setMessages] = useState([
    {
      id: 'msg_welcome',
      sender: 'ai',
      text: 'Welcome to Hello Trader AI Assistant & Stock Intelligence Engine v2.0. Search any NSE/BSE equity or index (e.g. RELIANCE, TCS, INFY, HDFCBANK, NIFTY 50, BANKNIFTY) to inspect its institutional research dossier or ask follow-up questions.',
      toolsUsed: [],
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [chatInput, setChatInput] = useState('');

  const MODE_SUGGESTIONS = {
    'ANALYSE': ["TCS ka aaj ka complete analysis", "Reliance ka kal ke liye kya setup hai?", "NIFTY ka last 30 days performance", "BANKNIFTY ka support resistance"],
    'MY PERFORMANCE': ["Meri win rate kitni hai?", "Mere aaj ke trades analyse karo."],
    'STRATEGY': ["Iska sabse bada risk kya hai?", "TCS se compare karo."],
    'RISK': ["₹50,000 capital par 1% risk mein position size kya hoga?", "Iska sabse bada risk kya hai?"],
    'ALGO': ["Mera webhook fail kyu hua?", "Broker connection status audit karo."],
    'LEARN': ["FVG kya hota hai?", "Order Block kya hota hai?"],
    'COACH': ["Maine aaj kaha galti ki?", "TCS ka highest volume kab aaya?"]
  };

  // ── Execute Stock Search (Updates Top Dossier + Appends Independent Chat Message Pair) ──
  const executeStockSearch = async (symbolOrQuery) => {
    if (!symbolOrQuery || !symbolOrQuery.trim() || isLoading) return;

    setSearchError(null);
    setIsLoading(true);

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    try {
      console.log(`[AILab UI ${reqId}] SEARCH QUERY:`, symbolOrQuery);

      const response = await apiClient.post('/ai-lab/chat', {
        userQuery: symbolOrQuery,
        activeMode: 'ANALYSE',
        conversationHistory: messages.slice(-4).map(m => ({ sender: m.sender, text: m.text }))
      }, {
        headers: { 'X-AI-LAB-REQUEST-ID': reqId }
      });

      const data = response.data;
      console.log(`[AILab UI ${reqId}] API RESPONSE RECEIVED:`, {
        requestId: data.requestId,
        asset: data.asset,
        assetType: data.assetType,
        symbol: data.symbol,
        hasDossier: !!data.stockDossier,
        replyPreview: data.reply ? data.reply.slice(0, 80) : ''
      });

      const userMsg = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: 'user',
        text: symbolOrQuery,
        timestamp: new Date().toLocaleTimeString()
      };

      if (data.success && data.stockDossier) {
        const resolvedSymbol = data.symbol || data.asset || symbolOrQuery.trim().toUpperCase();
        const resolvedType = data.assetType || 'EQUITY';

        // Update Top Dossier Card
        setActiveDossier(data.stockDossier);
        setActiveAsset(resolvedSymbol);
        setActiveAssetType(resolvedType);
        if (setSelectedSymbol) setSelectedSymbol(resolvedSymbol);

        const cleanReply = (data.reply && !data.reply.includes('[CONFIG_REQUIRED]'))
          ? data.reply
          : `AI synthesis for ${resolvedSymbol} (Mode: ${activeMode}). Grounded structured intelligence is rendered below.`;

        const aiMsg = {
          id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sender: 'ai',
          asset: resolvedSymbol,
          assetType: resolvedType,
          symbol: resolvedSymbol,
          dossier: data.stockDossier,
          text: cleanReply,
          intent: data.intent,
          toolsUsed: data.toolsUsed || [],
          timestamp: new Date().toLocaleTimeString()
        };

        console.log(`[AILab UI ${reqId}] MESSAGE BEING RENDERED:`, aiMsg);
        setMessages(prev => [...prev, userMsg, aiMsg]);
      } else {
        const fallbackText = (data.reply && !data.reply.includes('[CONFIG_REQUIRED]'))
          ? data.reply
          : 'Stock/Index not found. Please check the symbol.';
        setSearchError(fallbackText);
        setActiveDossier(null);

        const aiMsg = {
          id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sender: 'ai',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString()
        };

        setMessages(prev => [...prev, userMsg, aiMsg]);
      }
    } catch (err) {
      console.error(`[AILab UI ${reqId}] API CALL ERROR:`, err);
      const errorMsg = 'Connection Error: ' + (err.response?.data?.message || err.message);
      setSearchError(errorMsg);

      const userMsg = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: 'user',
        text: symbolOrQuery,
        timestamp: new Date().toLocaleTimeString()
      };
      const aiMsg = {
        id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: 'ai',
        text: errorMsg,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, userMsg, aiMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial Load: Fetch RELIANCE Dossier on mount
  useEffect(() => {
    executeStockSearch('RELIANCE');
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      executeStockSearch(searchQuery);
      setSearchQuery('');
    }
  };

  // ── Chat Stream Assistant Submit Handler ──
  const handleChatSend = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const queryToSend = customQuery || chatInput;
    if (!queryToSend.trim() || isLoading) return;

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const isFollowUp = (
      queryToSend.toLowerCase().includes('iska') || 
      queryToSend.toLowerCase().includes('risk') || 
      queryToSend.toLowerCase().includes('compare') ||
      queryToSend.toLowerCase().includes('target') ||
      queryToSend.toLowerCase().includes('stop loss') ||
      queryToSend.toLowerCase().includes('kal') ||
      queryToSend.toLowerCase().includes('aaj')
    );

    const fullQuery = isFollowUp ? `${activeAsset} - ${queryToSend}` : queryToSend;

    if (!customQuery) setChatInput('');
    setIsLoading(true);

    try {
      console.log(`[AILab Chat UI ${reqId}] CHAT QUERY:`, fullQuery);

      const historyPayload = messages.slice(-6).map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const response = await apiClient.post('/ai-lab/chat', {
        userQuery: fullQuery,
        activeMode,
        conversationHistory: historyPayload
      }, {
        headers: { 'X-AI-LAB-REQUEST-ID': reqId }
      });

      const data = response.data;
      console.log(`[AILab Chat UI ${reqId}] CHAT API RESPONSE RECEIVED:`, {
        requestId: data.requestId,
        asset: data.asset,
        assetType: data.assetType,
        symbol: data.symbol,
        hasDossier: !!data.stockDossier,
        replyPreview: data.reply ? data.reply.slice(0, 80) : ''
      });

      const userMsg = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: 'user',
        text: queryToSend,
        timestamp: new Date().toLocaleTimeString()
      };

      if (data.success) {
        const resolvedSymbol = data.symbol || data.asset || activeAsset;
        const resolvedType = data.assetType || activeAssetType;

        if (data.stockDossier) {
          setActiveDossier(data.stockDossier);
          setActiveAsset(resolvedSymbol);
          setActiveAssetType(resolvedType);
        }

        const cleanReply = (data.reply && !data.reply.includes('[CONFIG_REQUIRED]'))
          ? data.reply
          : `AI synthesis for ${resolvedSymbol} (Mode: ${activeMode}). Grounded structured intelligence is rendered below.`;

        const aiMsg = {
          id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sender: 'ai',
          asset: resolvedSymbol,
          assetType: resolvedType,
          symbol: resolvedSymbol,
          dossier: data.stockDossier || null,
          text: cleanReply,
          intent: data.intent,
          toolsUsed: data.toolsUsed || [],
          timestamp: new Date().toLocaleTimeString()
        };

        console.log(`[AILab Chat UI ${reqId}] MESSAGE BEING RENDERED:`, aiMsg);
        setMessages(prev => [...prev, userMsg, aiMsg]);
      } else {
        const fallbackText = (data.reply && !data.reply.includes('[CONFIG_REQUIRED]'))
          ? data.reply
          : `AI Assistant: ${data.message || 'Stock/Index not found. Please check the symbol.'}`;

        const aiMsg = {
          id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sender: 'ai',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString()
        };

        setMessages(prev => [...prev, userMsg, aiMsg]);
      }
    } catch (err) {
      console.error(`[AILab Chat UI ${reqId}] CHAT API ERROR:`, err);
      const userMsg = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: 'user',
        text: queryToSend,
        timestamp: new Date().toLocaleTimeString()
      };
      const aiMsg = {
        id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        sender: 'ai',
        text: `Connection Error: ${err.response?.data?.message || err.message}`,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, userMsg, aiMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isExpiredTrial) {
    return (
      <div className="p-8 text-center bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center space-y-4 font-mono">
        <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.2)]">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-black text-[#D4AF37] tracking-widest uppercase">🔒 PRO FEATURE LOCKED</div>
          <h2 className="text-lg font-bold text-white uppercase">AI Lab Research Locked</h2>
        </div>
        <p className="text-xs text-gray-400 max-w-md leading-relaxed">
          Unlock institutional Stock Intelligence, Smart Money order blocks, risk parameters, and AI trading coaching.
        </p>
      </div>
    );
  }

  const profile = activeDossier?.profile || {};
  const tech = activeDossier?.technicals || {};
  const fundamentals = activeDossier?.fundamentals || {};
  const quarterly = activeDossier?.quarterly || {};
  const smc = activeDossier?.smc || {};
  const news = activeDossier?.news || {};
  const scenarios = activeDossier?.scenarios || {};
  const marketStatus = activeDossier?.marketStatus || { isOpen: false, statusLabel: '🟡 MARKET CLOSED — Analysis based on latest available session data' };
  const historical = activeDossier?.historical || {};

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-full overflow-y-auto pb-10 font-mono flex flex-col gap-4">

      {/* ── HEADER & UNIVERSAL SEARCH BAR ────────────────────────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              HELLO TRADER STOCK INTELLIGENCE ENGINE
              <span className="text-[10px] bg-[#00FF41]/20 text-[#00FF41] px-2 py-0.5 rounded border border-[#00FF41]/30 font-bold uppercase">
                INSTITUTIONAL DOSSIER v2.0
              </span>
            </h1>
            <p className="text-xs text-gray-400">Universal NSE/BSE Equity & Index Intelligence with OpenAI Grounding</p>
          </div>
        </div>

        {/* Universal Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search RELIANCE, TCS, INFY, HDFCBANK, NIFTY 50..."
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00D4FF]"
            />
          </div>
          <button 
            type="submit"
            disabled={isLoading}
            className="px-3 py-1.5 bg-[#00D4FF] hover:bg-[#00b8dc] text-black font-bold text-xs rounded-lg transition-colors shrink-0 flex items-center gap-1"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Search Asset'}
          </button>
        </form>
      </div>

      {/* Market Status Notification Banner */}
      <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
        marketStatus.isOpen 
          ? 'bg-[#00FF41]/10 border-[#00FF41]/30 text-[#00FF41]'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          <span className="font-bold">{marketStatus.statusLabel}</span>
        </div>
        <span className="text-[10px] opacity-80 font-mono">
          Data Timestamp: {tech.timestamp ? new Date(tech.timestamp).toLocaleString() : '15-AUG-2026 15:30 IST'}
        </span>
      </div>

      {/* Search Error Alert */}
      {searchError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
          <button onClick={() => setSearchError(null)} className="text-gray-400 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Popular Symbol Quick Selector */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Quick Research:</span>
        {POPULAR_SYMBOLS.map(sym => (
          <button
            key={sym}
            onClick={() => executeStockSearch(sym)}
            className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition-all ${
              activeAsset === sym
                ? 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/60 shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                : 'bg-[#161B22] text-gray-300 border-white/10 hover:border-white/20 hover:text-white'
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* ── ACTIVE INSPECTION DOSSIER PANEL ────────────────────────────────────────── */}
      {activeDossier ? (
        <div className="space-y-4">
          
          {/* DOSSIER TOP HEADER CARD */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white font-mono">{profile.name || activeAsset}</h2>
                <span className="text-xs bg-[#00D4FF]/20 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/40 font-bold">
                  {activeAsset}
                </span>
                <span className="text-xs bg-white/5 text-gray-300 px-2 py-0.5 rounded border border-white/10 font-bold uppercase">
                  {activeAssetType}
                </span>
                {profile.url && (
                  <a href={profile.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#00D4FF] flex items-center gap-1 text-xs">
                    <ExternalLink className="w-3.5 h-3.5" />
                    NSE Ref
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-400">{profile.sector || 'Listed Asset'} | {profile.exchange || 'NSE/BSE'}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-black text-[#00FF41] font-mono">
                  ₹{tech.price ? Number(tech.price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                </div>
                <div className="text-xs font-bold text-[#00FF41]">
                  {tech.technicalBias || 'BULLISH STRUCTURE'}
                </div>
              </div>

              {/* Data Freshness Badges */}
              <div className="pl-4 border-l border-white/10 flex flex-col items-end gap-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                  tech.dataStatus === 'LIVE' ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {tech.dataStatus || 'LATEST_REPORTED'}
                </span>
                <span className="text-[9px] text-gray-400">
                  Updated: {tech.timestamp ? new Date(tech.timestamp).toLocaleTimeString() : 'Live Stream'}
                </span>
              </div>
            </div>
          </div>

          {/* ── HISTORICAL ANALYTICS & TIME-SERIES CARD ────────────────────────────── */}
          {historical.returns && (
            <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('historical')}>
                <h3 className="text-xs font-bold text-[#00D4FF] flex items-center gap-2">📊 HISTORICAL PERFORMANCE & DRAWDOWN ANALYTICS</h3>
                {sectionsExpanded.historical ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>

              {sectionsExpanded.historical && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  {/* Returns Grid */}
                  <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">Timeframe Returns</div>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <div>5 Days: <span className="text-[#00FF41] font-bold">{historical.returns.days5}</span></div>
                      <div>30 Days: <span className="text-[#00FF41] font-bold">{historical.returns.days30}</span></div>
                      <div>6 Months: <span className="text-[#00FF41] font-bold">{historical.returns.months6}</span></div>
                      <div>1 Year: <span className="text-[#00FF41] font-bold">{historical.returns.year1}</span></div>
                    </div>
                  </div>

                  {/* Drawdown Analytics */}
                  <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">Max Drawdown Window</div>
                    <div className="text-red-400 font-bold text-xs">Max Fall: {historical.maxDrawdown?.percent}</div>
                    <div className="text-[9px] text-gray-400">{historical.maxDrawdown?.biggestFallWindow}</div>
                  </div>

                  {/* Volume Analytics */}
                  <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">Peak Volume Analytics</div>
                    <div className="text-purple-300 font-bold text-xs">{historical.volumeAnalytics?.peakVolumeQty}</div>
                    <div className="text-[9px] text-gray-400">Peak Date: {historical.volumeAnalytics?.peakVolumeDate}</div>
                  </div>

                  {/* Previous Session Comparison */}
                  <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">Previous Session Stats</div>
                    <div className="text-cyan-300 font-bold text-xs">Prev Close: ₹{historical.previousSessionComparison?.prevClose}</div>
                    <div className="text-[9px] text-gray-400">Session Range: {historical.previousSessionComparison?.sessionRange}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EQUITY DOSSIER CONTENT ─────────────────────────────────────── */}
          {activeAssetType === 'EQUITY' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

              {/* 1. COMPANY DNA */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('dna')}>
                  <h3 className="text-xs font-bold text-[#00D4FF] flex items-center gap-2">🏢 COMPANY DNA</h3>
                  {sectionsExpanded.dna ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {sectionsExpanded.dna && (
                  <div className="space-y-2 text-xs">
                    <p className="text-gray-300 text-[11px] leading-relaxed">{profile.description}</p>
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5 space-y-1">
                      <div className="text-[10px] text-gray-400">Market Cap: <span className="text-white font-bold">{profile.marketCap}</span></div>
                      <div className="text-[10px] text-gray-400">Promoter Group: <span className="text-white font-bold">{profile.promoterInfo}</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. FUNDAMENTALS */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('fundamentals')}>
                  <h3 className="text-xs font-bold text-[#00FF41] flex items-center gap-2">💰 FUNDAMENTALS</h3>
                  {sectionsExpanded.fundamentals ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {sectionsExpanded.fundamentals && (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                        <div className="text-[10px] text-gray-400">P/E Ratio</div>
                        <div className="text-sm font-bold text-cyan-300">{fundamentals.valuation?.pe || '—'}</div>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                        <div className="text-[10px] text-gray-400">P/B Ratio</div>
                        <div className="text-sm font-bold text-cyan-300">{fundamentals.valuation?.pb || '—'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. QUARTERLY RESULTS */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('quarterly')}>
                  <h3 className="text-xs font-bold text-purple-400 flex items-center gap-2">📊 QUARTERLY RESULTS (Q1 FY27)</h3>
                  {sectionsExpanded.quarterly ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {sectionsExpanded.quarterly && (
                  <div className="space-y-2 text-xs">
                    {quarterly.quarters?.map((q, i) => (
                      <div key={i} className="bg-[#0B0E14] p-2 rounded border border-white/5 flex justify-between items-center">
                        <span className="font-bold text-gray-300">{q.quarter}:</span>
                        <span className="text-cyan-300 font-mono">{q.revenue}</span>
                        <span className="text-[#00FF41] font-bold">{q.yoyGrowth}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. TECHNICAL STRUCTURE */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('technicals')}>
                  <h3 className="text-xs font-bold text-[#00D4FF] flex items-center gap-2">📈 TECHNICAL STRUCTURE</h3>
                  {sectionsExpanded.technicals ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {sectionsExpanded.technicals && (
                  <div className="space-y-2 text-xs">
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5 flex justify-between">
                      <span className="text-gray-400">EMA20 / 50 / 200:</span>
                      <span className="font-mono text-cyan-300">₹{tech.ema20} / ₹{tech.ema50} / ₹{tech.ema200}</span>
                    </div>
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5 flex justify-between">
                      <span className="text-gray-400">VWAP / RSI(14):</span>
                      <span className="font-mono text-[#00FF41]">₹{tech.vwap} | RSI {tech.rsi}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. SMART MONEY CONCEPTS */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('smc')}>
                  <h3 className="text-xs font-bold text-amber-300 flex items-center gap-2">🧠 SMART MONEY CONCEPTS (SMC)</h3>
                  {sectionsExpanded.smc ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {sectionsExpanded.smc && (
                  <div className="space-y-2 text-xs">
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                      <div className="text-[10px] text-gray-400">Structure:</div>
                      <div className="font-bold text-[#00FF41]">{smc.bos}</div>
                    </div>
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                      <div className="text-[10px] text-gray-400">Institutional Order Block Zone:</div>
                      <div className="font-bold text-purple-300 font-mono">{smc.orderBlock}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. NEWS INTELLIGENCE */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 cursor-pointer" onClick={() => toggleSection('news')}>
                  <h3 className="text-xs font-bold text-rose-300 flex items-center gap-2">📰 NEWS INTELLIGENCE</h3>
                  {sectionsExpanded.news ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {sectionsExpanded.news && (
                  <div className="space-y-2 text-xs">
                    {news.newsItems?.map((item, i) => (
                      <div key={i} className="bg-[#0B0E14] p-2 rounded border border-white/5 space-y-1">
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-bold text-gray-200 hover:text-[#00D4FF] text-[11px] leading-tight block">
                          {item.headline}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── INDEX DOSSIER CONTENT ─────────────────────────────────────── */}
          {activeAssetType === 'INDEX' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-[#00D4FF]">📈 BENCHMARK INDEX TECHNICALS</h3>
                <div className="space-y-2 text-xs">
                  <div className="bg-[#0B0E14] p-2 rounded border border-white/5 flex justify-between">
                    <span className="text-gray-400">EMA20 / 50 / 200:</span>
                    <span className="font-mono text-cyan-300">₹{tech.ema20} / ₹{tech.ema50} / ₹{tech.ema200}</span>
                  </div>
                  <div className="bg-[#0B0E14] p-2 rounded border border-white/5 flex justify-between">
                    <span className="text-gray-400">VWAP / RSI(14):</span>
                    <span className="font-mono text-[#00FF41]">₹{tech.vwap} | RSI {tech.rsi}</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-purple-400">🧠 INDEX SMC STRUCTURES</h3>
                <div className="space-y-2 text-xs">
                  <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                    <div className="text-[10px] text-gray-400">Index BOS / CHOCH:</div>
                    <div className="font-bold text-[#00FF41]">{smc.bos}</div>
                  </div>
                  <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                    <div className="text-[10px] text-gray-400">Order Block Demand:</div>
                    <div className="font-bold text-purple-300 font-mono">{smc.orderBlock}</div>
                  </div>
                </div>
              </div>

              <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-amber-300">🛡️ ASSET CLASS SPECIFICITY</h3>
                <div className="p-3 bg-[#0B0E14] rounded border border-white/5 text-xs space-y-1 text-gray-400">
                  <div>Company Profile: <span className="text-amber-300 font-bold">NOT_APPLICABLE</span></div>
                  <div>Quarterly Results: <span className="text-amber-300 font-bold">NOT_APPLICABLE</span></div>
                  <div>Shareholding Pattern: <span className="text-amber-300 font-bold">NOT_APPLICABLE</span></div>
                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="p-8 bg-[#161B22] rounded-xl border border-white/10 text-center text-xs text-amber-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Searching Stock Intelligence Engine...</span>
        </div>
      )}

      {/* ── CONTEXTUAL AI CONVERSATION CHAT STREAM ───────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3 mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <h3 className="text-xs font-bold text-gray-300 flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#00D4FF]" />
            AI CONVERSATIONAL ASSISTANT STREAM
          </h3>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMessages([{ id: 'reset', sender: 'ai', text: `Chat stream cleared. Active search: ${activeAsset}.` }])}
              className="text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded border border-white/10"
            >
              Clear Chat
            </button>
          </div>
        </div>

        {/* Mode Suggested Questions */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[10px] text-gray-500 font-bold uppercase">Follow-up Ideas:</span>
          {(MODE_SUGGESTIONS[activeMode] || []).map((q, idx) => (
            <button
              key={idx}
              onClick={(e) => handleChatSend(e, q)}
              className="px-2 py-0.5 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] hover:bg-[#00D4FF]/20 border border-[#00D4FF]/30 transition-colors text-[10px] font-medium"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Messages Stream — Each message renders its OWN independent snapshot */}
        <div className="h-72 overflow-y-auto space-y-3 bg-[#0B0E14] p-3 rounded-lg border border-white/5 text-xs font-mono">
          {messages.map((m) => (
            <div key={m.id || m.timestamp + Math.random()} className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-lg max-w-2xl space-y-2 ${
                m.sender === 'user'
                  ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30'
                  : 'bg-[#161B22] text-gray-200 border border-white/10'
              }`}>
                <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] text-gray-400">
                      {m.sender === 'user' ? 'You' : 'Hello Trader AI Agent'}
                    </span>
                    {m.symbol && (
                      <span className="text-[9px] bg-[#00D4FF]/20 text-[#00D4FF] px-1.5 py-0.5 rounded font-black border border-[#00D4FF]/30">
                        {m.symbol} ({m.assetType})
                      </span>
                    )}
                  </div>
                  {m.timestamp && <span className="text-[9px] text-gray-500">{m.timestamp}</span>}
                </div>

                {/* Message Body Content */}
                <p className="leading-relaxed whitespace-pre-line text-xs">{m.text}</p>

                {/* Tool Badges */}
                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                    <span className="text-[9px] text-gray-500 font-bold">Tools Executed:</span>
                    {m.toolsUsed.map((tool, tIdx) => (
                      <span key={tIdx} className="text-[9px] bg-[#00FF41]/10 text-[#00FF41] px-1.5 py-0.5 rounded border border-[#00FF41]/30 font-mono">
                        ⚙️ {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 p-2 bg-[#161B22] text-gray-400 rounded border border-white/5 text-xs animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00D4FF]" />
              <span>Analyzing {activeAsset} database context & generating AI synthesis...</span>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleChatSend} className="flex items-center gap-2">
          <input 
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={`Ask AI Coach about ${activeAsset} risk, TCS comparison, or stop-loss...`}
            className="flex-1 bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00D4FF]"
          />
          <button 
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-[#00D4FF] hover:bg-[#00b8dc] disabled:opacity-50 text-black font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isLoading ? 'Analyzing...' : 'Send'}
          </button>
        </form>
      </div>

    </div>
  );
}
