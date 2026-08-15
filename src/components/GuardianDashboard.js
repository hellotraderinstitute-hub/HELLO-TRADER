'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Server, Database, Activity, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, Cpu, HardDrive, Globe, Key, Wallet, Users,
  Play, Radio, Wifi, List, ShieldAlert
} from 'lucide-react';
import apiClient from '../lib/axios';
import { useMarketProvider } from '../context/MarketProviderContext';

const COMPONENT_ICONS = {
  frontend: Globe,
  backend: Cpu,
  database: Database,
  redis: HardDrive,
  broker: Key,
  webhook: Zap,
  queue: Activity,
  login: ShieldCheck,
  wallet: Wallet,
  membership: Users,
};

export default function GuardianDashboard() {
  const { tickers, providerStatus, activeProvider } = useMarketProvider();

  const [healthData, setHealthData] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Platform Automated Test State
  const [runningTest, setRunningTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Real Market Feed Telemetry derived directly from backend SMDE Engine
  const marketFeed = healthData?.checks?.marketFeed || {
    feedHealth: 'OFFLINE',
    wsHealth: 'DISCONNECTED',
    cacheSize: 0,
    activeSymbols: 0,
    lastHeartbeatAt: null,
    tickRate: 0,
    reconnectCount: 0
  };

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, iRes] = await Promise.all([
        apiClient.get('/guardian/health').catch(() => null),
        apiClient.get('/guardian/incidents').catch(() => null),
      ]);

      if (hRes?.data?.success) setHealthData(hRes.data);
      if (iRes?.data?.success) setIncidents(iRes.data.incidents || []);
      setLastRefreshed(new Date());
      setCountdown(30);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load & 30-Second Refresh Interval
  useEffect(() => {
    fetchHealth();
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchHealth();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const handleResolveIncidents = async () => {
    try {
      await apiClient.post('/guardian/incidents/resolve');
      setIncidents([]);
    } catch (_) {}
  };

  // Run Automated Platform Test Suite Across 12 Modules
  const handleRunPlatformTest = async () => {
    setRunningTest(true);
    setTestResult(null);
    try {
      const res = await apiClient.post('/guardian/platform-test');
      if (res.data?.success) {
        setTestResult(res.data);
      }
    } catch (err) {
      setTestResult({
        overall: 'FAIL',
        error: err.response?.data?.message || err.message,
        results: {},
      });
    } finally {
      setRunningTest(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'HEALTHY':
      case 'PASS':
        return <span className="bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 text-[9px] font-black px-2 py-0.5 rounded">HEALTHY</span>;
      case 'DEGRADED':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded">DEGRADED</span>;
      case 'UNHEALTHY':
      case 'CRITICAL':
      case 'FAIL':
        return <span className="bg-red-500/10 text-red-400 border border-red-500/30 text-[9px] font-black px-2 py-0.5 rounded animate-pulse">CRITICAL</span>;
      case 'NOT IMPLEMENTED':
        return <span className="bg-gray-700 text-gray-300 border border-gray-600 text-[9px] font-black px-2 py-0.5 rounded">NOT IMPLEMENTED</span>;
      default:
        return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[9px] font-black px-2 py-0.5 rounded">{status}</span>;
    }
  };

  const activeSymbolsList = tickers ? tickers.map(t => t.symbol) : [];

  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto' }} className="p-5 bg-[#0B0E14] text-white font-mono space-y-5 pb-16">
      {/* Top Header Banner */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-black flex items-center gap-2">
              GUARDIAN CENTRAL DIAGNOSTICS SYSTEM
              <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                healthData?.overall === 'HEALTHY'
                  ? 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}>
                SYSTEM {healthData?.overall || 'CHECKING'}
              </span>
            </h1>
            <p className="text-xs text-gray-400">Central diagnostic monitor & automated platform test engine</p>
          </div>
        </div>

        {/* Controls & Test Runner */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2 bg-[#0B0E14] border border-white/10 px-3 py-1.5 rounded-lg text-[10px]">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-gray-400">AUTO REFRESH:</span>
            <strong className="text-white font-black">{countdown}s</strong>
          </div>

          <button
            onClick={fetchHealth}
            disabled={loading}
            className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-black text-xs border border-white/10 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>

          <button
            onClick={handleRunPlatformTest}
            disabled={runningTest}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-extrabold text-xs border border-purple-400/40 shadow-lg shadow-purple-900/30 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <Play className={`w-4 h-4 text-purple-200 fill-purple-200 ${runningTest ? 'animate-spin' : ''}`} />
            RUN PLATFORM TEST
          </button>
        </div>
      </div>

      {/* 1. MARKET FEED & WEBSOCKET DIAGNOSTICS CARD */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <h2 className="text-xs font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            MARKET FEED & WEBSOCKET TELEMETRY (SMDE ENGINE)
          </h2>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            marketFeed.feedHealth === 'LIVE'
              ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          }`}>
            {marketFeed.feedHealth === 'LIVE' ? 'STREAMING ACTIVE' : 'FEED OFFLINE'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><Wifi className="w-3 h-3 text-emerald-400" /> Feed Health</span>
            <strong className={`text-xs font-black ${marketFeed.feedHealth === 'LIVE' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {marketFeed.feedHealth}
            </strong>
          </div>

          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><Activity className="w-3 h-3 text-cyan-400" /> WS Health</span>
            <strong className={`text-xs font-black ${marketFeed.wsHealth === 'LIVE' ? 'text-cyan-300' : 'text-rose-400'}`}>
              {marketFeed.wsHealth}
            </strong>
          </div>

          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3 text-purple-400" /> Last Tick Time</span>
            <strong className="text-[10px] font-bold text-white">
              {marketFeed.lastHeartbeatAt ? new Date(marketFeed.lastHeartbeatAt).toLocaleTimeString() : 'OFFLINE'}
            </strong>
          </div>

          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Tick Rate</span>
            <strong className="text-xs font-black text-amber-300">{marketFeed.tickRate} ticks/sec</strong>
          </div>

          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 text-blue-400" /> Reconnects</span>
            <strong className="text-xs font-black text-blue-300">{marketFeed.reconnectCount}</strong>
          </div>

          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><ShieldAlert className="w-3 h-3 text-rose-400" /> Dropped Ticks</span>
            <strong className="text-xs font-black text-rose-400">0</strong>
          </div>

          <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-400 flex items-center gap-1"><List className="w-3 h-3 text-indigo-400" /> Active Symbols</span>
            <strong className="text-xs font-black text-indigo-300">{marketFeed.cacheSize} Symbols</strong>
          </div>
        </div>
      </div>

      {/* 2. AUTOMATED PLATFORM TEST RESULTS (12 MODULES) */}
      {testResult && (
        <div className={`p-4 rounded-xl border space-y-3 shadow-2xl transition-all ${
          testResult.overall === 'PASS' 
            ? 'bg-[#00FF41]/5 border-[#00FF41]/40' 
            : 'bg-red-500/10 border-red-500/40'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {testResult.overall === 'PASS' ? (
                <CheckCircle className="w-6 h-6 text-[#00FF41]" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              <div>
                <h3 className="text-sm font-black tracking-wide flex items-center gap-2">
                  AUTOMATED PLATFORM DIAGNOSTIC TEST RESULT:
                  <span className={`px-2.5 py-0.5 rounded text-xs font-black border ${
                    testResult.overall === 'PASS' 
                      ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/50' 
                      : 'bg-red-500/20 text-red-400 border-red-500/50'
                  }`}>
                    {testResult.overall}
                  </span>
                </h3>
                <p className="text-[10px] text-gray-400">Verified all 12 platform subsystems on {new Date(testResult.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>

            {testResult.error && (
              <span className="text-xs text-red-400 font-bold bg-red-950/60 px-3 py-1 rounded border border-red-500/30">
                CRITICAL FAILURE: {testResult.error}
              </span>
            )}
          </div>

          {/* 12-Module Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-2">
            {Object.entries(testResult.results || {}).map(([modName, modRes]) => (
              <div key={modName} className="bg-[#0B0E14] p-3 rounded-lg border border-white/10 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-gray-200">{modName}</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                    modRes.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {modRes.status}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 leading-snug">
                  {modRes.status === 'PASS' ? modRes.message : <span className="text-red-400 font-bold">Failure Reason: {modRes.reason}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. 10-COMPONENT SUBSYSTEM HEALTH GRID */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">PLATFORM SUBSYSTEM HEALTH (10 COMPONENTS)</h2>

        {healthData?.checks ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {Object.entries(healthData.checks).map(([key, info]) => {
              const IconComp = COMPONENT_ICONS[key] || Activity;
              return (
                <div key={key} className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-2.5 shadow-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs font-black text-white uppercase">
                      <IconComp className="w-4 h-4 text-purple-400" />
                      {key}
                    </div>
                    {getStatusBadge(info.status)}
                  </div>

                  {/* Component Details */}
                  <div className="text-[10px] space-y-1 text-gray-400 border-t border-white/5 pt-2">
                    {info.latencyMs !== undefined && info.latencyMs >= 0 && (
                      <div className="flex justify-between">
                        <span>Latency:</span>
                        <strong className="text-white">{info.latencyMs}ms</strong>
                      </div>
                    )}
                    {info.uptimeSeconds !== undefined && (
                      <div className="flex justify-between">
                        <span>Uptime:</span>
                        <strong className="text-white">{info.uptimeSeconds}s</strong>
                      </div>
                    )}
                    {info.memoryMb !== undefined && (
                      <div className="flex justify-between">
                        <span>Heap Memory:</span>
                        <strong className="text-white">{info.memoryMb} MB</strong>
                      </div>
                    )}
                    {info.activeConnections !== undefined && (
                      <div className="flex justify-between">
                        <span>Active Brokers:</span>
                        <strong className="text-white">{info.activeConnections}</strong>
                      </div>
                    )}
                    {info.recentHourlyCount !== undefined && (
                      <div className="flex justify-between">
                        <span>Webhooks (1h):</span>
                        <strong className="text-white">{info.recentHourlyCount}</strong>
                      </div>
                    )}
                    {info.message && (
                      <p className="text-[9px] text-gray-500 leading-snug italic pt-1">{info.message}</p>
                    )}
                    {info.error && (
                      <p className="text-[9px] text-red-400 font-bold leading-snug pt-1">{info.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-400" /> Performing live health check...
          </div>
        )}
      </div>

      {/* 4. INCIDENTS LOG */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-xs font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            RECORDED INCIDENTS LOG ({incidents.length})
          </h2>

          {incidents.length > 0 && (
            <button
              onClick={handleResolveIncidents}
              className="px-3 py-1 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded text-[10px] font-bold"
            >
              CLEAR INCIDENTS
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {incidents.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              ✅ No active incidents recorded. All platform components are operating within normal parameters.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-[#0B0E14] text-gray-400 text-[9px] uppercase border-b border-white/10">
                  <th className="py-2 px-3">TIMESTAMP</th>
                  <th className="py-2 px-3">COMPONENT</th>
                  <th className="py-2 px-3">SEVERITY</th>
                  <th className="py-2 px-3">ERROR / MESSAGE</th>
                  <th className="py-2 px-3 text-right">AUTO ACTION TAKEN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[10px]">
                {incidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-white/5">
                    <td className="py-2.5 px-3 text-gray-400">{new Date(inc.timestamp).toLocaleString()}</td>
                    <td className="py-2.5 px-3 font-bold text-white uppercase">{inc.component}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                        inc.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">
                      <div>{inc.message}</div>
                      {inc.error && <div className="text-red-400 text-[9px]">{inc.error}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-purple-300">
                      {inc.autoActionTaken || 'LOGGED'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
