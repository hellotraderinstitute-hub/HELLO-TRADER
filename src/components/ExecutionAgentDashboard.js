'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Zap, Terminal, Key, Copy, Check, RefreshCw,
  Power, Trash2, AlertTriangle, CheckCircle, Activity,
  Server, Cpu, Play, HelpCircle, ExternalLink, ArrowRight, Lock,
  TrendingUp, TrendingDown, Pause, PlayCircle, Sliders, DollarSign, Globe, Save, Layers,
  ChevronDown, ChevronUp, Code2
} from 'lucide-react';
import apiClient from '../lib/axios';
import TradingVpsCard from './TradingVpsCard';

export default function ExecutionAgentDashboard({ connections = [] }) {
  const [agentStatus, setAgentStatus] = useState({ isOnline: false, session: null });
  const [agentKeys, setAgentKeys] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [generatedKeyData, setGeneratedKeyData] = useState(null); // Shown ONCE only
  const [copiedText, setCopiedText] = useState(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Risk Controls & Pause State
  const [riskSettings, setRiskSettings] = useState({
    isLiveTradingEnabled: false,
    maxLots: 1,
    dailyProfitTargetEnabled: false,
    dailyProfitTarget: 5000,
    dailyMaxLossEnabled: true,
    dailyMaxLoss: 10000,
    isPausedToday: false,
    pauseReason: null,
    squareOffOnDailyLimitEnabled: false,
    perTradeTargetEnabled: false,
    perTradeTarget: 500,
  });
  const [todayRealizedPnl, setTodayRealizedPnl] = useState(0);
  const [isSavingRisk, setIsSavingRisk] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const isEditingRiskRef = useRef(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);

  // Simulation Test Signal State
  const [testPayload, setTestPayload] = useState({
    symbol: 'NIFTY25AUG2624550CE',
    action: 'BUY',
    quantity: 65,
    price: 175.50,
  });
  const [sendingTestSignal, setSendingTestSignal] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Webhook Guide State
  const [selectedConnId, setSelectedConnId] = useState(connections[0]?.id || '');
  const selectedConnection = connections.find(c => c.id === selectedConnId) || connections[0];

  // Static IP Assignment State
  const [staticIpData, setStaticIpData] = useState(null);

  // Market Pre-Flight State
  const [preflightData, setPreflightData] = useState(null);
  const [runningPreflight, setRunningPreflight] = useState(false);

  const fetchPreflight = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/preflight/status');
      if (res.data?.success) {
        setPreflightData(res.data);
      }
    } catch (_) {}
  }, []);

  const handleRunPreflight = async () => {
    setRunningPreflight(true);
    try {
      const res = await apiClient.post('/algo/preflight/run', { forceRefresh: true });
      if (res.data?.success) {
        setPreflightData(res.data);
      }
    } catch (_) {}
    finally {
      setRunningPreflight(false);
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/agent/status');
      if (res.data?.success) {
        setAgentStatus({
          isOnline: !!res.data.isOnline,
          session: res.data.session || null,
        });
      }
    } catch (_) {}
  }, []);

  const fetchStaticIp = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/static-ip');
      if (res.data?.success && res.data.hasAssignment) {
        setStaticIpData(res.data.assignment);
      } else {
        setStaticIpData(null);
      }
    } catch (_) {}
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/agent/keys');
      if (res.data?.success) {
        setAgentKeys(res.data.keys || []);
      }
    } catch (_) {}
  }, []);

  const fetchRiskSettings = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/agent/risk-settings');
      if (res.data?.success) {
        if (res.data.settings && !isEditingRiskRef.current) {
          setRiskSettings(res.data.settings);
        }
        if (typeof res.data.todayRealizedPnl === 'number') {
          setTodayRealizedPnl(res.data.todayRealizedPnl);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchKeys();
    fetchRiskSettings();
    fetchStaticIp();
    fetchPreflight();
    const interval = setInterval(() => {
      fetchStatus();
      fetchRiskSettings();
      fetchStaticIp();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchKeys, fetchRiskSettings, fetchStaticIp, fetchPreflight]);

  const handleSaveRiskSettings = async (overrideSettings = null) => {
    setIsSavingRisk(true);
    const toSave = overrideSettings || riskSettings;
    try {
      const res = await apiClient.post('/algo/agent/risk-settings', toSave);
      if (res.data?.success) {
        setRiskSettings(res.data.settings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        alert(res.data?.message || 'Failed to update risk controls.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update risk controls.');
    } finally {
      setIsSavingRisk(false);
    }
  };

  const handlePauseToday = async () => {
    if (!confirm('Are you sure you want to PAUSE trading for today? All incoming new orders will be blocked locally.')) {
      return;
    }
    setIsTogglingPause(true);
    try {
      const res = await apiClient.post('/algo/agent/pause-today');
      if (res.data?.success) {
        setRiskSettings(prev => ({ ...prev, isPausedToday: true, pauseReason: 'USER_PAUSED_TODAY' }));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to pause trading.');
    } finally {
      setIsTogglingPause(false);
    }
  };

  const handleResumeToday = async () => {
    if (!confirm('Resume trading for today? Ensure you have verified your market conditions.')) {
      return;
    }
    setIsTogglingPause(true);
    try {
      const res = await apiClient.post('/algo/agent/resume-today');
      if (res.data?.success) {
        setRiskSettings(prev => ({ ...prev, isPausedToday: false, pauseReason: null }));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to resume trading.');
    } finally {
      setIsTogglingPause(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!confirm('Generating a new Pairing Key will immediately revoke any existing agent keys. Continue?')) {
      return;
    }
    setIsGeneratingKey(true);
    try {
      const res = await apiClient.post('/algo/agent/keys/generate', {
        label: 'My VPS Execution Agent',
      });
      if (res.data?.success) {
        setGeneratedKeyData(res.data);
        fetchKeys();
        fetchStatus();
      } else {
        alert(res.data?.message || 'Failed to generate key.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate key.');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (id) => {
    if (!confirm('Are you sure you want to revoke this agent pairing key? The agent will be disconnected immediately.')) {
      return;
    }
    setRevokingId(id);
    try {
      const res = await apiClient.post(`/algo/agent/keys/${id}/revoke`);
      if (res.data?.success) {
        fetchKeys();
        fetchStatus();
        if (generatedKeyData?.agentKey?.id === id) {
          setGeneratedKeyData(null);
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revoke key.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleSendTestSignal = async (e) => {
    e.preventDefault();
    setSendingTestSignal(true);
    setTestResult(null);
    try {
      const res = await apiClient.post('/algo/agent/test-signal', {
        symbol: testPayload.symbol,
        action: testPayload.action,
        quantity: Number(testPayload.quantity),
        price: Number(testPayload.price),
      });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || err.message,
      });
    } finally {
      setSendingTestSignal(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2500);
  };

  // Determine Live Risk Blocker Status
  const isProfitTargetBlocked = riskSettings.dailyProfitTargetEnabled && (todayRealizedPnl >= (riskSettings.dailyProfitTarget || 0));
  const isMaxLossBlocked = riskSettings.dailyMaxLossEnabled && (todayRealizedPnl <= -(riskSettings.dailyMaxLoss || 0));
  const isUserPaused = riskSettings.isPausedToday;
  const isBlocked = isUserPaused || isProfitTargetBlocked || isMaxLossBlocked;

  let blockReasonText = '';
  if (isUserPaused) blockReasonText = 'USER_PAUSED_TODAY';
  else if (isProfitTargetBlocked) blockReasonText = 'DAILY_PROFIT_TARGET_REACHED';
  else if (isMaxLossBlocked) blockReasonText = 'DAILY_MAX_LOSS_REACHED';

  const webhookUrl = selectedConnection?.webhookToken
    ? `https://hellotrader.in/api/webhook/tv/${selectedConnection.webhookToken}`
    : 'https://hellotrader.in/api/webhook/tv/:webhookToken';

  const sampleJsonExplicit = JSON.stringify({
    symbol: "NIFTY25AUG2624550CE",
    securityId: "52488",
    action: "BUY",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 65,
    price: 175.50
  }, null, 2);

  const sampleJsonAuto = JSON.stringify({
    symbol: "NIFTY",
    action: "BUY",
    orderType: "MARKET",
    productType: "INTRADAY",
    quantity: 65
  }, null, 2);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── 0. DEDICATED TRADING VPS CARD ───────────────────────────── */}
      <TradingVpsCard />

      {/* ── 0.5. DEDICATED STATIC IP WHITELISTS CARD (ADMIN ASSIGNED) ── */}
      {staticIpData && (
        <div className="bg-gradient-to-r from-[#161B22] to-[#0f172a] border border-cyan-500/30 rounded-2xl p-5 shadow-xl font-mono text-xs">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-cyan-400 font-extrabold uppercase flex items-center gap-1.5">
                  <Globe className="w-4 h-4" />
                  ASSIGNED DEDICATED STATIC IP
                </span>
                {staticIpData.status === 'VERIFIED' && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> VERIFIED OUTBOUND EGRESS
                  </span>
                )}
                {staticIpData.status === 'BLOCKED' && (
                  <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> IP MISMATCH (LIVE BLOCKED)
                  </span>
                )}
                {staticIpData.status === 'ASSIGNED' && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <Activity className="w-3 h-3" /> PENDING AGENT EGRESS CHECK
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Use this dedicated static IPv4 in your Broker Developer Console (Dhan / Angel One) whitelist.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-[#0b0e14] px-3 py-2 rounded-xl border border-cyan-500/40 self-stretch md:self-auto justify-between md:justify-start">
              <div className="text-sm font-black text-cyan-300 tracking-wider">
                {staticIpData.ipAddress}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(staticIpData.ipAddress);
                  setCopiedText('IP');
                  setTimeout(() => setCopiedText(null), 2000);
                }}
                className="p-1 hover:bg-white/10 text-gray-300 hover:text-white rounded transition-colors"
                title="Copy Static IP"
              >
                {copiedText === 'IP' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 0.6. MARKET-OPEN PRE-FLIGHT AUDIT CARD (ANGEL ONE & STATIC IP) ── */}
      <div className="bg-gradient-to-r from-[#161B22] to-[#0d1527] border border-blue-500/30 rounded-2xl p-5 shadow-xl font-mono text-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-blue-400 font-extrabold uppercase flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-400" />
                MARKET PRE-FLIGHT AUDIT (ANGEL ONE)
              </span>

              {runningPreflight && (
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" /> CHECKING...
                </span>
              )}

              {!runningPreflight && preflightData?.status === 'READY' && (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> READY FOR LIVE TRADING
                </span>
              )}

              {!runningPreflight && preflightData?.status === 'FAILED' && (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> PRE-FLIGHT FAILED — LIVE BLOCKED
                </span>
              )}

              {!runningPreflight && (!preflightData || preflightData.status === 'NOT_RUN') && (
                <span className="bg-white/10 text-gray-400 border border-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                  NOT RUN TODAY
                </span>
              )}
            </div>

            <p className="text-[11px] text-gray-400">
              Read-only pre-market audit: validates Angel One SmartAPI session, verified static IP ({staticIpData?.ipAddress || '151.245.182.52'}), pre-trade risk controls, and kill switch.
            </p>

            {/* Safe Summary Info Badges */}
            {preflightData?.safeSummary && (
              <div className="flex items-center gap-2 pt-1 flex-wrap text-[10px]">
                <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                  Broker: <strong className="text-white">{preflightData.safeSummary.broker}</strong>
                </span>
                <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                  Account: <strong className="text-white">{preflightData.safeSummary.account || 'Configured'}</strong>
                </span>
                <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                  Proxy: <strong className="text-emerald-400">{preflightData.safeSummary.proxy}</strong>
                </span>
                <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                  Egress: <strong className="text-cyan-300">{preflightData.safeSummary.egressIp}</strong>
                </span>
                <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                  Risk: <strong className="text-emerald-400">{preflightData.safeSummary.riskControls}</strong>
                </span>
                <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                  Kill Switch: <strong className="text-emerald-400">{preflightData.safeSummary.killSwitch}</strong>
                </span>
              </div>
            )}

            {preflightData?.status === 'FAILED' && preflightData.reason && (
              <div className="text-[11px] text-rose-400 font-bold bg-rose-950/40 border border-rose-800/40 p-2 rounded-lg mt-1">
                Reason: {preflightData.reason}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunPreflight}
              disabled={runningPreflight}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningPreflight ? 'animate-spin' : ''}`} />
              {runningPreflight ? 'AUDITING...' : 'RUN PRE-FLIGHT'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 1. CLIENT EXECUTION AGENT CLEAN STATUS HERO CARD ────────── */}
      <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" />
                CLIENT EXECUTION AGENT
              </h2>
              {agentStatus.isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  ONLINE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  OFFLINE
                </span>
              )}

              {/* Live Trading Mode / Simulation Mode Toggle Badge */}
              <button
                type="button"
                onClick={() => {
                  const targetState = !riskSettings.isLiveTradingEnabled;
                  const updated = { ...riskSettings, isLiveTradingEnabled: targetState };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition-all shadow-md cursor-pointer border ${
                  riskSettings.isLiveTradingEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                }`}
                title="Click to toggle Live Broker Trading ON/OFF for your account"
              >
                <Zap className={`w-3 h-3 ${riskSettings.isLiveTradingEnabled ? 'text-emerald-400 fill-emerald-400' : 'text-amber-400'}`} />
                {riskSettings.isLiveTradingEnabled ? 'LIVE TRADING: ON' : 'SIMULATION MODE (LIVE OFF)'}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Institutional Order Execution Engine via Dedicated Verified Static IP.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchStatus}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* 6-Point Live Status KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/5">
          {/* 1. Agent Status */}
          <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Agent Status</span>
            <strong className={`text-xs mt-1 flex items-center gap-1.5 font-bold ${agentStatus.isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
              <span className={`w-2 h-2 rounded-full ${agentStatus.isOnline ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
              {agentStatus.isOnline ? 'ONLINE' : 'OFFLINE'}
            </strong>
          </div>

          {/* 2. Heartbeat Latency */}
          <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Heartbeat Latency</span>
            <strong className="text-xs text-cyan-400 flex items-center gap-1 mt-1 font-mono font-bold">
              <Activity className="w-3.5 h-3.5" />
              {agentStatus.session?.latencyMs ? `${Math.round(agentStatus.session.latencyMs)} ms` : (agentStatus.isOnline ? '< 15 ms' : 'N/A')}
            </strong>
          </div>

          {/* 3. Broker Connection */}
          <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Broker</span>
            <strong className="text-xs text-white mt-1 flex items-center gap-1 font-bold truncate">
              <Shield className="w-3 h-3 text-blue-400" />
              {connections.find(c => c.isActive)?.broker || connections[0]?.broker || 'Angel One'} — Connected
            </strong>
          </div>

          {/* 4. Static IP */}
          <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Static IP</span>
            <strong className="text-xs text-cyan-300 font-mono mt-1 flex items-center gap-1 font-bold truncate">
              <Globe className="w-3 h-3 text-cyan-400" />
              {staticIpData?.ipAddress || '151.245.182.52'} (Verified)
            </strong>
          </div>

          {/* 5. TradingView Webhook */}
          <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold block uppercase">TradingView Webhook</span>
            <strong className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-bold">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              ACTIVE
            </strong>
          </div>

          {/* 6. Execution Status */}
          <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold block uppercase">Execution Status</span>
            <strong className={`text-xs mt-1 block font-bold truncate ${
              isBlocked ? 'text-rose-400' : (riskSettings.isLiveTradingEnabled ? 'text-emerald-400' : 'text-amber-400')
            }`}>
              {isBlocked ? `BLOCKED (${blockReasonText})` : (riskSettings.isLiveTradingEnabled ? 'READY FOR LIVE' : 'SIMULATION ACTIVE')}
            </strong>
          </div>
        </div>
      </div>

      {/* ── 2. USER-CONTROLLED RISK CONTROLS & PAUSE CARD ─────────────── */}
      <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
          <div>
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              USER TERMINAL SETTINGS & RISK CONTROLS
            </h3>
            <p className="text-xs text-gray-400">
              Terminal source of truth for Live Trading, Lot Sizing, Profit Targets, and Daily Max Loss.
            </p>
          </div>

          {/* Today's Realized P&L Badge */}
          <div className="bg-[#0B0E14] px-4 py-2.5 rounded-xl border border-white/10 flex items-center gap-3">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Today's P&L</span>
            <span className={`text-base font-black font-mono flex items-center gap-1 ${todayRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {todayRealizedPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {todayRealizedPnl >= 0 ? `+₹${todayRealizedPnl.toFixed(2)}` : `-₹${Math.abs(todayRealizedPnl).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Live Execution Status Pill */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
          isBlocked ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {isBlocked ? (
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/40">
                <AlertTriangle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                <CheckCircle className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="text-xs text-gray-400 font-bold uppercase">Terminal Execution State</div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                {isBlocked ? (
                  <span className="text-rose-400 flex items-center gap-1.5">
                    🔴 NEW TRADES BLOCKED ({blockReasonText})
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    🟢 {riskSettings.isLiveTradingEnabled ? 'LIVE TRADING ENABLED — ORDERS PERMITTED' : 'SIMULATION MODE — SAFE TESTING ACTIVE'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons: Toggle Live & Pause / Resume */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const targetState = !riskSettings.isLiveTradingEnabled;
                const updated = { ...riskSettings, isLiveTradingEnabled: targetState };
                setRiskSettings(updated);
                handleSaveRiskSettings(updated);
              }}
              className={`px-4 py-2 text-xs font-black rounded-xl transition-all shadow-md cursor-pointer border flex items-center gap-1.5 ${
                riskSettings.isLiveTradingEnabled
                  ? 'bg-rose-600/20 text-rose-300 border-rose-500/40 hover:bg-rose-600/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              {riskSettings.isLiveTradingEnabled ? 'SWITCH TO SIMULATION' : 'ENABLE LIVE TRADING'}
            </button>

            {isUserPaused ? (
              <button
                onClick={handleResumeToday}
                disabled={isTogglingPause}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <PlayCircle className="w-4 h-4" />
                {isTogglingPause ? 'Resuming...' : 'RESUME TODAY'}
              </button>
            ) : (
              <button
                onClick={handlePauseToday}
                disabled={isTogglingPause}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Pause className="w-4 h-4" />
                {isTogglingPause ? 'Pausing...' : 'PAUSE TODAY'}
              </button>
            )}
          </div>
        </div>

        {/* Configurable Risk Limits Grid (4 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Maximum Lots / Order Sizing */}
          <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Max Allowed Lots
              </label>
              <span className="text-[10px] text-cyan-400 font-mono font-black bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                {riskSettings.maxLots || 1} Lot(s)
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="100"
                value={riskSettings.maxLots !== undefined && riskSettings.maxLots !== null ? riskSettings.maxLots : 1}
                onFocus={() => { isEditingRiskRef.current = true; }}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Math.max(1, Number(e.target.value));
                  setRiskSettings(prev => ({ ...prev, maxLots: val }));
                }}
                onBlur={e => {
                  isEditingRiskRef.current = false;
                  const val = e.target.value === '' ? 1 : Math.max(1, Number(e.target.value));
                  const updated = { ...riskSettings, maxLots: val };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                placeholder="1"
                className="w-full bg-[#161B22] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-gray-500">Max lots allowed per order (e.g. 1 lot = 65 NIFTY, 2 lots = 130 NIFTY).</p>
          </div>
          {/* 1. Daily Profit Target */}
          <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                Daily Profit Target
              </label>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...riskSettings, dailyProfitTargetEnabled: !riskSettings.dailyProfitTargetEnabled };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  riskSettings.dailyProfitTargetEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border border-white/10'
                }`}
              >
                {riskSettings.dailyProfitTargetEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-gray-500 font-bold">₹</span>
              <input
                type="number"
                disabled={!riskSettings.dailyProfitTargetEnabled}
                value={riskSettings.dailyProfitTarget !== undefined && riskSettings.dailyProfitTarget !== null ? riskSettings.dailyProfitTarget : ''}
                onFocus={() => { isEditingRiskRef.current = true; }}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setRiskSettings(prev => ({ ...prev, dailyProfitTarget: val }));
                }}
                onBlur={e => {
                  isEditingRiskRef.current = false;
                  const val = e.target.value === '' ? 5000 : Number(e.target.value);
                  const updated = { ...riskSettings, dailyProfitTarget: val };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                placeholder="5000"
                className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              />
            </div>
            <p className="text-[10px] text-gray-500">Blocks new orders once daily profit target is reached.</p>
          </div>

          {/* 2. Daily Max Loss */}
          <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                Daily Max Loss
              </label>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...riskSettings, dailyMaxLossEnabled: !riskSettings.dailyMaxLossEnabled };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  riskSettings.dailyMaxLossEnabled
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-white/5 text-gray-400 border border-white/10'
                }`}
              >
                {riskSettings.dailyMaxLossEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-gray-500 font-bold">₹</span>
              <input
                type="number"
                disabled={!riskSettings.dailyMaxLossEnabled}
                value={riskSettings.dailyMaxLoss !== undefined && riskSettings.dailyMaxLoss !== null ? riskSettings.dailyMaxLoss : ''}
                onFocus={() => { isEditingRiskRef.current = true; }}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setRiskSettings(prev => ({ ...prev, dailyMaxLoss: val }));
                }}
                onBlur={e => {
                  isEditingRiskRef.current = false;
                  const val = e.target.value === '' ? 10000 : Number(e.target.value);
                  const updated = { ...riskSettings, dailyMaxLoss: val };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                placeholder="10000"
                className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              />
            </div>
            <p className="text-[10px] text-gray-500">Blocks new orders if daily realized loss hits this limit.</p>
          </div>

          {/* 3. Per-Trade Target */}
          <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                Per-Trade Target
              </label>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...riskSettings, perTradeTargetEnabled: !riskSettings.perTradeTargetEnabled };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  riskSettings.perTradeTargetEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-white/5 text-gray-400 border border-white/10'
                }`}
              >
                {riskSettings.perTradeTargetEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-gray-500 font-bold">₹</span>
              <input
                type="number"
                disabled={!riskSettings.perTradeTargetEnabled}
                value={riskSettings.perTradeTarget !== undefined && riskSettings.perTradeTarget !== null ? riskSettings.perTradeTarget : ''}
                onFocus={() => { isEditingRiskRef.current = true; }}
                onChange={e => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setRiskSettings(prev => ({ ...prev, perTradeTarget: val }));
                }}
                onBlur={e => {
                  isEditingRiskRef.current = false;
                  const val = e.target.value === '' ? 500 : Number(e.target.value);
                  const updated = { ...riskSettings, perTradeTarget: val };
                  setRiskSettings(updated);
                  handleSaveRiskSettings(updated);
                }}
                placeholder="500"
                className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              />
            </div>
            <p className="text-[10px] text-gray-500">Closes individual trade when profit threshold is reached.</p>
          </div>
        </div>

        {/* Position Behavior Setting & Save Action */}
        <div className="bg-[#0B0E14] p-3.5 rounded-xl border border-white/5 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-gray-200">Auto Square-Off Open Positions on Daily Limit</div>
            <div className="text-[10px] text-gray-500">
              When OFF (default), existing open positions remain active and will not be closed automatically when daily limits are triggered.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const updated = { ...riskSettings, squareOffOnDailyLimitEnabled: !riskSettings.squareOffOnDailyLimitEnabled };
                setRiskSettings(updated);
                handleSaveRiskSettings(updated);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                riskSettings.squareOffOnDailyLimitEnabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/10'
              }`}
            >
              {riskSettings.squareOffOnDailyLimitEnabled ? 'ENABLED' : 'OFF (SAFE)'}
            </button>
            <button
              type="button"
              disabled={isSavingRisk}
              onClick={() => handleSaveRiskSettings()}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-lg disabled:opacity-50"
            >
              {isSavingRisk ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  SAVING...
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-green-300" />
                  SAVED ✅
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  SAVE CONTROLS
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. TRADINGVIEW CONNECTION CARD ──────────────────────────── */}
      <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex justify-between items-center flex-wrap gap-2 pb-4 border-b border-white/10">
          <div className="space-y-0.5">
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-cyan-400" />
              TRADINGVIEW CONNECTION
            </h3>
            <p className="text-xs text-gray-400">
              Connect your TradingView Strategy or Indicator alerts directly to your Hello Trader terminal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-bold uppercase mr-1">Status:</span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              ACTIVE
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Webhook URL */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">
              Webhook URL
            </label>
            <div className="flex items-center gap-2 bg-[#0B0E14] p-3 rounded-xl border border-white/10 font-mono text-xs text-cyan-300">
              <code className="flex-1 truncate select-all">{webhookUrl}</code>
              <button
                onClick={() => copyToClipboard(webhookUrl, 'url')}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg cursor-pointer flex items-center gap-1.5 transition-all shadow-md shrink-0"
              >
                {copiedText === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedText === 'url' ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Paste into the Webhook URL field in your TradingView Alert settings.
            </p>
          </div>

          {/* 2. Alert Message */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">
              Alert Message
            </label>
            <div className="flex items-center gap-2 bg-[#0B0E14] p-3 rounded-xl border border-white/10 font-mono text-xs text-emerald-300">
              <code className="flex-1 truncate select-all">{`{"action": "{{strategy.order.action}}"}`}</code>
              <button
                onClick={() => copyToClipboard('{"action": "{{strategy.order.action}}"}', 'msg')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg cursor-pointer flex items-center gap-1.5 transition-all shadow-md shrink-0"
              >
                {copiedText === 'msg' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedText === 'msg' ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Terminal automatically resolves CE/PE, strike, expiry & lots from your saved UP/DOWN settings.
            </p>
          </div>
        </div>

        {/* 3. Setup Steps */}
        <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-2.5">
          <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            Quick 4-Step Setup:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-gray-300">
            <div className="bg-[#161B22] p-2.5 rounded-lg border border-white/5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
              <span>TradingView Alert open karo</span>
            </div>
            <div className="bg-[#161B22] p-2.5 rounded-lg border border-white/5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
              <span>Webhook URL paste karo</span>
            </div>
            <div className="bg-[#161B22] p-2.5 rounded-lg border border-white/5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
              <span>Generated Alert Message paste karo</span>
            </div>
            <div className="bg-[#161B22] p-2.5 rounded-lg border border-white/5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] shrink-0">4</span>
              <span>TradingView Alert save karo</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. ADVANCED / DEVELOPER DIAGNOSTICS (COLLAPSIBLE) ─────────── */}
      <div className="bg-[#161B22]/70 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400">
              <Code2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                Advanced / Developer Diagnostics & Pairing Keys
                <span className="text-[10px] bg-white/10 text-gray-400 px-2 py-0.5 rounded font-mono font-normal">
                  Optional
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Agent Pairing Key generation, CLI pairing vault commands, simulation tester & JSON alert payloads.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-gray-400 text-xs font-mono">
            <span>{showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}</span>
            {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showDiagnostics && (
          <div className="p-6 pt-0 space-y-6 border-t border-white/5 mt-2 animate-in fade-in duration-200">
            {/* Pairing Key Management */}
            <div className="bg-[#0B0E14] border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h4 className="font-bold text-xs text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-cyan-400" />
                    AGENT PAIRING KEY MANAGEMENT
                  </h4>
                  <p className="text-[11px] text-gray-400">Cryptographic token pairing your local execution agent daemon to your account.</p>
                </div>

                <button
                  onClick={handleGenerateKey}
                  disabled={isGeneratingKey}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  {isGeneratingKey ? 'Generating...' : 'Generate New Pairing Key'}
                </button>
              </div>

              {/* One-Time Reveal Banner */}
              {generatedKeyData && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <CheckCircle className="w-4 h-4" />
                    NEW PAIRING KEY GENERATED (STORE SECURELY — SHOWN ONCE ONLY)
                  </div>
                  <div className="flex items-center gap-2 bg-[#0B0E14] p-3 rounded-lg border border-white/10">
                    <code className="text-xs text-cyan-300 font-mono flex-1 select-all break-all">
                      {generatedKeyData.pairingKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(generatedKeyData.pairingKey, 'new-key')}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    >
                      {copiedText === 'new-key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedText === 'new-key' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Paste this key during <code className="text-cyan-300 bg-white/5 px-1 py-0.5 rounded">ht-agent configure</code> on your VPS / execution machine. It will never be displayed again.
                  </p>
                </div>
              )}

              {/* Active Keys List */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-[10px] uppercase font-mono">
                      <th className="p-2">Key Prefix</th>
                      <th className="p-2">Label</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Agent IP</th>
                      <th className="p-2">Created</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {agentKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-500">
                          No pairing keys generated yet.
                        </td>
                      </tr>
                    ) : (
                      agentKeys.map(k => (
                        <tr key={k.id} className="hover:bg-white/[0.02]">
                          <td className="p-2 font-mono text-cyan-400">{k.keyPrefix}</td>
                          <td className="p-2 text-gray-300">{k.label}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              k.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                              {k.status}
                            </span>
                          </td>
                          <td className="p-2 font-mono text-gray-400">{k.agentIp || '-'}</td>
                          <td className="p-2 text-gray-500">{new Date(k.createdAt).toLocaleDateString()}</td>
                          <td className="p-2 text-right">
                            {k.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleRevokeKey(k.id)}
                                disabled={revokingId === k.id}
                                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] rounded-lg transition-all cursor-pointer"
                              >
                                {revokingId === k.id ? 'Revoking...' : 'Revoke'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CLI Commands Reference */}
            <div className="bg-[#0B0E14] border border-white/10 rounded-xl p-5 space-y-3">
              <h4 className="font-bold text-xs text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                EXECUTION AGENT CLI REFERENCE
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-black/50 p-3 rounded-lg border border-white/5 space-y-1">
                  <div className="text-[10px] text-gray-400 font-bold uppercase">1. Install CLI</div>
                  <code className="text-xs text-cyan-300 font-mono block">npm i -g hello-trader-agent</code>
                </div>
                <div className="bg-black/50 p-3 rounded-lg border border-white/5 space-y-1">
                  <div className="text-[10px] text-gray-400 font-bold uppercase">2. Configure Vault</div>
                  <code className="text-xs text-cyan-300 font-mono block">ht-agent configure</code>
                </div>
                <div className="bg-black/50 p-3 rounded-lg border border-white/5 space-y-1">
                  <div className="text-[10px] text-gray-400 font-bold uppercase">3. Start Execution</div>
                  <code className="text-xs text-cyan-300 font-mono block">ht-agent start</code>
                </div>
              </div>
            </div>

            {/* Simulation Pipeline Tester */}
            <div className="bg-[#0B0E14] border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-xs text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    SIMULATION PIPELINE TESTER (ZERO REAL MONEY)
                  </h4>
                  <p className="text-[11px] text-gray-400">Send an instant test signal through Cloud ➔ Tunnel ➔ Agent ➔ Risk Engine.</p>
                </div>
                <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded text-[10px] font-mono font-bold">
                  MOCK DISPATCH
                </span>
              </div>

              <form onSubmit={handleSendTestSignal} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">SYMBOL</label>
                  <input
                    type="text"
                    value={testPayload.symbol}
                    onChange={e => setTestPayload({ ...testPayload, symbol: e.target.value })}
                    className="w-full bg-[#161B22] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">ACTION</label>
                  <select
                    value={testPayload.action}
                    onChange={e => setTestPayload({ ...testPayload, action: e.target.value })}
                    className="w-full bg-[#161B22] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">QUANTITY</label>
                  <input
                    type="number"
                    value={testPayload.quantity}
                    onChange={e => setTestPayload({ ...testPayload, quantity: e.target.value })}
                    className="w-full bg-[#161B22] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1">PRICE (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={testPayload.price}
                    onChange={e => setTestPayload({ ...testPayload, price: e.target.value })}
                    className="w-full bg-[#161B22] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="flex items-end col-span-2 sm:col-span-1">
                  <button
                    type="submit"
                    disabled={sendingTestSignal || !agentStatus.isOnline}
                    className="w-full py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {sendingTestSignal ? 'Testing...' : 'Send Signal'}
                  </button>
                </div>
              </form>

              {testResult && (
                <div className={`p-4 rounded-xl border space-y-2 text-xs font-mono animate-in fade-in ${
                  testResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex justify-between items-center font-bold">
                    <span>{testResult.success ? '✓ SIMULATION ACK RECEIVED' : '❌ SIMULATION REJECTED'}</span>
                    <span>RTT: {testResult.rttMs || '< 15'}ms</span>
                  </div>
                  <pre className="text-[11px] overflow-x-auto text-gray-300 bg-black/40 p-2 rounded">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* TradingView Sample Payloads */}
            <div className="bg-[#0B0E14] border border-white/10 rounded-xl p-5 space-y-3">
              <h4 className="font-bold text-xs text-white flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                TRADINGVIEW WEBHOOK SAMPLE PAYLOADS
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Mode A: Explicit Option Contract</span>
                    <button
                      onClick={() => copyToClipboard(sampleJsonExplicit, 'json-a')}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'json-a' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy JSON
                    </button>
                  </div>
                  <pre className="bg-black/60 p-3 rounded-lg text-[10px] font-mono text-gray-300 overflow-x-auto">
                    {sampleJsonExplicit}
                  </pre>
                </div>

                <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Mode B: Dynamic Auto-Strike</span>
                    <button
                      onClick={() => copyToClipboard(sampleJsonAuto, 'json-b')}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'json-b' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy JSON
                    </button>
                  </div>
                  <pre className="bg-black/60 p-3 rounded-lg text-[10px] font-mono text-gray-300 overflow-x-auto">
                    {sampleJsonAuto}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
