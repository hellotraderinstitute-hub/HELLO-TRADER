'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Copy, Shield, AlertTriangle, ArrowLeft, CheckCircle,
  Users, TrendingUp, Zap, Power, Activity, Lock, RefreshCw,
  Radio, Eye, StopCircle, Play, ChevronRight, BarChart2, Clock
} from 'lucide-react';
import apiClient from '../lib/axios';
import { useTrading } from '../context/TradingContext';

// ─── Consent Text ──────────────────────────────────────────────────────────
const CONSENT_TEXT = `I authorize Hello Trader to mirror trades placed by my selected Master Trader to my connected broker account. I understand that Copy Trading involves market risk and past performance of Master Traders does not guarantee future results. I acknowledge that no profits or returns are guaranteed. I remain fully responsible for my own account equity and copy trading settings. I confirm I can activate Emergency Stop or unfollow at any time to halt automated copy execution.`;

const BROKERS_CONFIG = [
  { id: 'DHAN',     name: 'Dhan',      icon: '⚡', fields: ['clientId', 'accessToken'] },
  { id: 'ANGELONE', name: 'Angel One', icon: '👼', fields: ['apiKey', 'clientId', 'password', 'totpSecret'] },
  { id: 'UPSTOX',   name: 'Upstox',    icon: '📈', fields: ['apiKey', 'apiSecret', 'accessToken'] },
  { id: 'SHOONYA',  name: 'Shoonya',   icon: '🎯', fields: ['clientId', 'password', 'totpSecret', 'vendorCode', 'apiSecret'] },
  { id: 'FYERS',    name: 'Fyers',     icon: '🔥', fields: ['apiKey', 'clientId', 'accessToken'] },
  { id: 'GOPOCKET', name: 'GoPocket',  icon: '💼', fields: ['clientId', 'apiKey', 'apiSecret', 'accessToken'] },
];

// ─── Status Badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    EXECUTED:      { cls: 'bg-green-500/20 text-green-400 border-green-500/30',  label: '✅ EXECUTED' },
    FAILED:        { cls: 'bg-red-500/20 text-red-400 border-red-500/30',        label: '❌ FAILED' },
    RISK_REJECTED: { cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30',  label: '⚠️ RISK BLOCKED' },
    SKIPPED:       { cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30',     label: '— SKIPPED' },
    QUEUED:        { cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     label: '⏳ QUEUED' },
  };
  const d = map[status] || { cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: status };
  return <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${d.cls}`}>{d.label}</span>;
}

function EventBadge({ eventType }) {
  const map = {
    ENTRY:        'bg-purple-500/20 text-purple-300 border-purple-500/30',
    EXIT:         'bg-red-500/20 text-red-400 border-red-500/30',
    PARTIAL_FILL: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${map[eventType] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
      {eventType?.replace('_', ' ')}
    </span>
  );
}

function SourceBadge({ tradeSource, parentSource }) {
  if (tradeSource === 'ALGO') {
    return <span className="bg-green-500/20 text-green-400 border border-green-500/40 px-2 py-0.5 rounded text-[9px] font-black">🟢 ALGO TRADE</span>;
  }
  if (tradeSource === 'MANUAL') {
    return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded text-[9px] font-black">🔵 MANUAL TRADE</span>;
  }
  if (parentSource === 'MASTER_ALGO') {
    return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[9px] font-black">🟣 COPY — MASTER ALGO</span>;
  }
  return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[9px] font-black">🟣 COPY — MASTER MANUAL</span>;
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function CopyTradingHub({ user, onBack, socket }) {
  const { isExpiredTrial, openRechargeModal, authLoading } = useTrading();

  // ── Global state ──
  const [activeTab, setActiveTab]       = useState('EXPLORE');
  const [loading, setLoading]           = useState(true);

  // ── Data ──
  const [masters, setMasters]           = useState([]);
  const [connections, setConnections]   = useState([]);
  const [myFollowing, setMyFollowing]   = useState([]);
  const [logs, setLogs]                 = useState([]);

  // ── Master Dashboard state ──
  const [myMaster, setMyMaster]         = useState(null);   // null = not a master
  const [masterStats, setMasterStats]   = useState(null);
  const [masterFollowers, setMasterFollowers] = useState([]);
  const [masterOrders, setMasterOrders] = useState([]);
  const [togglingPoll, setTogglingPoll] = useState(false);

  // ── Register as Master form ──
  const [showMasterForm, setShowMasterForm]   = useState(false);
  const [masterDisplayName, setMasterDisplayName] = useState('');
  const [masterDescription, setMasterDescription] = useState('');
  const [masterRiskLevel, setMasterRiskLevel]   = useState('MEDIUM');
  const [masterConnectionId, setMasterConnectionId] = useState('');
  const [masterMaxFollowers, setMasterMaxFollowers] = useState(10);
  const [registeringMaster, setRegisteringMaster] = useState(false);

  // ── Follow a master form ──
  const [selectedMaster, setSelectedMaster]       = useState(null);
  const [showConfirmModal, setShowConfirmModal]   = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [allocationType, setAllocationType]       = useState('FIXED_QTY');
  const [allocationValue, setAllocationValue]     = useState(1);
  const [maxDailyLoss, setMaxDailyLoss]           = useState(5000);
  const [maxOpenTrades, setMaxOpenTrades]         = useState(5);
  const [consentAccepted, setConsentAccepted]     = useState(false);
  const [joining, setJoining]                     = useState(false);

  // ── Broker Connect form ──
  const [showConnectForm, setShowConnectForm]     = useState(false);
  const [selectedBroker, setSelectedBroker]       = useState('DHAN');
  const [brokerFormData, setBrokerFormData]       = useState({});
  const [brokerLabel, setBrokerLabel]             = useState('');
  const [connectingBroker, setConnectingBroker]   = useState(false);

  // ── Real-time feed ──
  const [liveEvents, setLiveEvents]               = useState([]);
  const feedRef = useRef(null);

  // ─── Trial Guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && isExpiredTrial) openRechargeModal();
  }, [authLoading, isExpiredTrial, openRechargeModal]);

  if (authLoading || isExpiredTrial) {
    return (
      <div className="p-8 text-center bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center space-y-4 font-mono">
        <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white uppercase">Copy Trading Locked</h2>
        <p className="text-xs text-gray-400 max-w-md">Recharge your wallet tokens to unlock copy trading.</p>
        <button onClick={openRechargeModal} className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#D97706] text-black font-extrabold text-xs rounded-xl uppercase cursor-pointer">
          RECHARGE / ACTIVATE
        </button>
      </div>
    );
  }

  // ─── Fetch Data ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [masterRes, connRes, followRes, logRes] = await Promise.all([
        apiClient.get('/copy/masters').catch(() => ({ data: { masters: [] } })),
        apiClient.get('/algo/connections').catch(() => ({ data: { connections: [] } })),
        apiClient.get('/copy/my-following').catch(() => ({ data: { following: [] } })),
        apiClient.get('/copy/logs').catch(() => ({ data: { logs: [] } })),
      ]);
      setMasters(masterRes.data?.masters || []);
      const conns = connRes.data?.connections || [];
      setConnections(conns);
      if (conns.length > 0) {
        setSelectedConnectionId(conns[0].id);
        setMasterConnectionId(conns[0].id);
      }
      setMyFollowing(followRes.data?.following || []);
      setLogs(logRes.data?.logs || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  const fetchMasterData = useCallback(async () => {
    try {
      const [statsRes, followersRes, ordersRes] = await Promise.all([
        apiClient.get('/copy/master/stats').catch(() => null),
        apiClient.get('/copy/my-followers').catch(() => null),
        apiClient.get('/copy/master/orders').catch(() => null),
      ]);
      if (statsRes?.data?.success) {
        setMasterStats(statsRes.data.stats);
        setMyMaster(statsRes.data.stats);
      } else {
        setMyMaster(null);
        setMasterStats(null);
      }
      setMasterFollowers(followersRes?.data?.followers || []);
      setMasterOrders(ordersRes?.data?.orders || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchData();
    fetchMasterData();
  }, [fetchData, fetchMasterData]);

  // ─── Socket.io — Real-time copy events ────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleCopyUpdate = (data) => {
      setLiveEvents(prev => [{ ...data, _at: new Date().toISOString() }, ...prev].slice(0, 50));
      if (feedRef.current) feedRef.current.scrollTop = 0;
    };

    const handleMasterPoll = (data) => {
      setMasterOrders(prev => {
        const exists = prev.find(o => o.symbol === data.order?.symbol);
        return exists ? prev : [{ ...data.order, detectedAt: data.timestamp }, ...prev].slice(0, 30);
      });
    };

    socket.on('copy_trade_update', handleCopyUpdate);
    socket.on('copy_master_poll', handleMasterPoll);
    return () => {
      socket.off('copy_trade_update', handleCopyUpdate);
      socket.off('copy_master_poll', handleMasterPoll);
    };
  }, [socket]);

  // ─── Register as Master ───────────────────────────────────────────────────
  const handleRegisterMaster = async (e) => {
    e.preventDefault();
    if (!masterConnectionId) return alert('Please connect your broker account first.');
    setRegisteringMaster(true);
    try {
      const res = await apiClient.post('/copy/register-master', {
        connectionId:  masterConnectionId,
        displayName:   masterDisplayName,
        description:   masterDescription,
        riskLevel:     masterRiskLevel,
        isPublic:      true,
        maxFollowers:  Number(masterMaxFollowers),
      });
      if (res.data?.success) {
        alert('✅ Registered as Master Trader!');
        setShowMasterForm(false);
        fetchMasterData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Registration failed.');
    }
    setRegisteringMaster(false);
  };

  // ─── Toggle Polling (Copy Trading ON/OFF) ─────────────────────────────────
  const handleTogglePolling = async () => {
    if (!masterStats) return;
    setTogglingPoll(true);
    try {
      const endpoint = masterStats.pollingEnabled
        ? '/copy/master/polling/stop'
        : '/copy/master/polling/start';
      const res = await apiClient.post(endpoint);
      alert(res.data?.message);
      fetchMasterData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle polling.');
    }
    setTogglingPoll(false);
  };

  // ─── Follow Master ────────────────────────────────────────────────────────
  const handleSelectMaster = (master) => {
    if (connections.length === 0) {
      alert('⚠️ Please connect your trading account first.');
      setActiveTab('BROKER');
      return;
    }
    setSelectedMaster(master);
    setShowConfirmModal(true);
  };

  const handleConfirmJoin = async () => {
    if (!consentAccepted) return alert('You must accept the authorization terms.');
    if (!selectedConnectionId) return alert('Please select a connected broker account.');
    setJoining(true);
    try {
      const res = await apiClient.post('/copy/follow', {
        masterId:       selectedMaster.id,
        connectionId:   selectedConnectionId,
        allocationType,
        allocationValue: Number(allocationValue),
        maxDailyLoss:   Number(maxDailyLoss),
        maxOpenTrades:  Number(maxOpenTrades),
        consentAccepted: true,
      });
      if (res.data?.success) {
        alert(`✅ Now copy trading under Master: "${selectedMaster.displayName}"!`);
        setShowConfirmModal(false);
        setConsentAccepted(false);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to activate copy trading.');
    }
    setJoining(false);
  };

  // ─── Unfollow + Emergency Stop ────────────────────────────────────────────
  const handleUnfollow = async (followerId) => {
    if (!confirm('Stop copying this Master Trader?')) return;
    await apiClient.post(`/copy/unfollow/${followerId}`).catch(() => {});
    fetchData();
  };

  const handleEmergencyStop = async (followerId, isActive) => {
    const res = await apiClient.post(`/copy/follower/${followerId}/kill`, { active: !isActive }).catch(() => null);
    if (res?.data?.message) alert(res.data.message);
    fetchData();
  };

  // ─── Connect Broker ───────────────────────────────────────────────────────
  const handleConnectBroker = async (e) => {
    e.preventDefault();
    setConnectingBroker(true);
    try {
      const res = await apiClient.post('/algo/connect', {
        broker:       selectedBroker,
        displayName:  brokerLabel || `${selectedBroker} Live Account`,
        credentials:  brokerFormData,
        maxDailyLoss: 5000,
        maxOpenTrades: 5,
        consentAccepted: true,
      });
      if (res.data?.success) {
        alert(`✅ ${selectedBroker} connected!`);
        setShowConnectForm(false);
        setBrokerFormData({});
        setBrokerLabel('');
        fetchData();
        fetchMasterData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to connect.');
    }
    setConnectingBroker(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto' }} className="p-4 bg-[#0B0E14] text-white font-mono space-y-4 pb-20">

      {/* ── Top Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-[#161B22] p-4 rounded-xl border border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-black flex items-center gap-2">
              <Copy className="w-4 h-4 text-purple-400" />
              COPY TRADING ENGINE
              <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">LIVE BROKER FILL REPLICATION</span>
            </h1>
            <p className="text-[10px] text-gray-400">Master's actual broker fills → Followers' broker accounts. Completely independent from Algo Trading.</p>
          </div>
        </div>

        {/* Architecture Info */}
        <div className="text-[9px] text-gray-500 bg-[#0B0E14] border border-white/5 rounded-lg p-2.5 font-mono leading-relaxed">
          <span className="text-purple-400 font-bold">ALGO:</span> TradingView/Chartink → Webhook → Your Broker<br />
          <span className="text-green-400 font-bold">COPY:</span> Master Broker Fill → Hello Trader → Follower Brokers
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex bg-[#0B0E14] p-1 rounded-xl border border-white/10 text-[10px] font-bold flex-wrap gap-1">
        {[
          { id: 'EXPLORE',    label: `MASTERS (${masters.length})` },
          { id: 'FOLLOWING',  label: `MY SUBSCRIPTIONS (${myFollowing.length})` },
          { id: 'MASTER_HUB', label: '📡 MASTER DASHBOARD' },
          { id: 'LOGS',       label: `COPY LOGS (${logs.length})` },
          { id: 'BROKER',     label: `BROKER ACCOUNTS (${connections.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === t.id ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ EXPLORE MASTERS TAB ══ */}
      {activeTab === 'EXPLORE' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">VERIFIED PUBLIC MASTER TRADERS</h2>
            <button onClick={() => { fetchData(); fetchMasterData(); }} className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white transition-colors cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-400" /> Loading...
            </div>
          ) : masters.length === 0 ? (
            <div className="bg-[#161B22] border border-white/10 rounded-2xl p-10 text-center space-y-3">
              <Users className="w-12 h-12 text-purple-400/50 mx-auto" />
              <h3 className="text-sm font-black text-white">No Public Master Traders Yet</h3>
              <p className="text-xs text-gray-400">Become the first Master Trader → go to MASTER DASHBOARD tab.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {masters.map(m => (
                <div key={m.id} className="bg-[#161B22] border border-white/10 rounded-2xl p-5 space-y-4 hover:border-purple-500/40 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-sm text-white">{m.displayName}</h3>
                      <p className="text-[10px] text-gray-400 mt-1">{m.description || 'Verified master trader'}</p>
                      <span className="text-[9px] text-gray-500 mt-0.5 block">by {m.traderName}</span>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${m.riskLevel === 'HIGH' ? 'bg-red-500/20 text-red-400 border-red-500/30' : m.riskLevel === 'LOW' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                      {m.riskLevel} RISK
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-[#0B0E14] p-3 rounded-xl border border-white/5 text-center text-xs">
                    <div>
                      <span className="text-gray-500 text-[9px] block">WIN RATE</span>
                      <span className="font-black text-[#00FF41]">{m.winRate}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[9px] block">TRADES</span>
                      <span className="font-black text-white">{m.totalTrades}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[9px] block">FOLLOWERS</span>
                      <span className="font-black text-white">{m.currentFollowers}/{m.maxFollowers}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelectMaster(m)}
                    disabled={m.currentFollowers >= m.maxFollowers}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    {m.currentFollowers >= m.maxFollowers ? 'MASTER IS FULL' : 'COPY THIS MASTER'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MY SUBSCRIPTIONS TAB ══ */}
      {activeTab === 'FOLLOWING' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">MY ACTIVE COPY SUBSCRIPTIONS</h2>

          {/* Real-time live feed */}
          {liveEvents.length > 0 && (
            <div className="bg-[#161B22] border border-purple-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-bold text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                LIVE COPY FEED
              </div>
              <div ref={feedRef} className="space-y-1.5 max-h-40 overflow-y-auto">
                {liveEvents.map((ev, i) => (
                  <div key={i} className="bg-[#0B0E14] p-2 rounded-lg flex justify-between items-center text-[10px]">
                    <span className="text-gray-300">
                      <strong className="text-white">{ev.masterName}</strong> → {ev.side} {ev.qty} <strong className="text-purple-300">{ev.symbol}</strong>
                    </span>
                    <StatusBadge status={ev.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {myFollowing.length === 0 ? (
            <div className="bg-[#161B22] border border-white/10 rounded-2xl p-8 text-center text-gray-400 text-xs">
              You are not copy trading any Master Trader yet. Go to MASTERS tab to subscribe.
            </div>
          ) : (
            <div className="space-y-3">
              {myFollowing.map(f => (
                <div key={f.id} className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-white">{f.master?.displayName}</h3>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${f.emergencyStop || f.killSwitchActive ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                        {f.emergencyStop || f.killSwitchActive ? '⏸ PAUSED' : '● ACTIVE COPYING'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEmergencyStop(f.id, f.emergencyStop || f.killSwitchActive)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black cursor-pointer transition-all ${f.emergencyStop || f.killSwitchActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}
                      >
                        <Power className="w-3 h-3 inline mr-1" />
                        {f.emergencyStop || f.killSwitchActive ? 'RESUME' : 'EMERGENCY STOP'}
                      </button>
                      <button
                        onClick={() => handleUnfollow(f.id)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        UNSUBSCRIBE
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-[#0B0E14] p-2.5 rounded-xl border border-white/5">
                    <div><span className="text-gray-500 block">ALLOCATION</span><strong className="text-white">{f.allocationType} × {f.allocationValue}</strong></div>
                    <div><span className="text-gray-500 block">MAX DAILY LOSS</span><strong className="text-amber-400">₹{f.maxDailyLoss}</strong></div>
                    <div><span className="text-gray-500 block">MAX OPEN TRADES</span><strong className="text-white">{f.maxOpenTrades}</strong></div>
                    <div><span className="text-gray-500 block">JOINED</span><strong className="text-white">{new Date(f.joinedAt).toLocaleDateString('en-IN')}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MASTER DASHBOARD TAB ══ */}
      {activeTab === 'MASTER_HUB' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-purple-400" /> MASTER TRADER DASHBOARD
            </h2>
            <button onClick={fetchMasterData} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white cursor-pointer">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {/* Not a master yet — Register form */}
          {!myMaster && (
            <div className="bg-[#161B22] border border-purple-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Register as Master Trader</h3>
                  <p className="text-[10px] text-gray-400">Your broker account fills will be automatically replicated to followers.</p>
                </div>
              </div>

              {connections.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-[10px]">
                  ⚠️ Connect your broker account first (BROKER ACCOUNTS tab) before registering as Master Trader.
                </div>
              ) : (
                <button
                  onClick={() => setShowMasterForm(!showMasterForm)}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs rounded-xl cursor-pointer transition-all"
                >
                  {showMasterForm ? 'Cancel' : '+ REGISTER AS MASTER TRADER'}
                </button>
              )}

              {showMasterForm && (
                <form onSubmit={handleRegisterMaster} className="space-y-3 pt-2 border-t border-white/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <label className="text-gray-400 block mb-1 font-bold uppercase">Display Name *</label>
                      <input required value={masterDisplayName} onChange={e => setMasterDisplayName(e.target.value)}
                        placeholder="e.g. Nifty Options Pro"
                        className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none focus:border-purple-500" />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1 font-bold uppercase">Broker Account *</label>
                      <select value={masterConnectionId} onChange={e => setMasterConnectionId(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none">
                        {connections.map(c => (
                          <option key={c.id} value={c.id}>{c.displayName || c.broker} ({c.clientId || c.id.slice(0, 8)})</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-gray-400 block mb-1 font-bold uppercase">Description</label>
                      <input value={masterDescription} onChange={e => setMasterDescription(e.target.value)}
                        placeholder="Brief strategy description for followers..."
                        className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none focus:border-purple-500" />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1 font-bold uppercase">Risk Level</label>
                      <select value={masterRiskLevel} onChange={e => setMasterRiskLevel(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none">
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1 font-bold uppercase">Max Followers</label>
                      <input type="number" min="1" max="100" value={masterMaxFollowers} onChange={e => setMasterMaxFollowers(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none" />
                    </div>
                  </div>
                  <button type="submit" disabled={registeringMaster}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer">
                    {registeringMaster ? 'Registering...' : 'REGISTER AS MASTER TRADER'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Already a master — Control Panel */}
          {myMaster && (
            <div className="space-y-4">

              {/* Polling ON/OFF Big Toggle */}
              <div className={`bg-[#161B22] border rounded-2xl p-5 space-y-4 ${masterStats?.pollingEnabled ? 'border-green-500/40' : 'border-white/10'}`}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-white">BROKER POLLING</h3>
                      {masterStats?.pollingEnabled ? (
                        <span className="flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                          ACTIVE — MONITORING YOUR BROKER
                        </span>
                      ) : (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                          PAUSED
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {masterStats?.pollingEnabled
                        ? 'Your broker account is being monitored every 5s during market hours. All fills → followers automatically.'
                        : 'Start polling to enable automatic fill detection and copying to followers.'}
                    </p>
                    {masterStats?.lastPolledAt && (
                      <p className="text-[9px] text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last polled: {new Date(masterStats.lastPolledAt).toLocaleTimeString('en-IN')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleTogglePolling}
                    disabled={togglingPoll}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs transition-all cursor-pointer disabled:opacity-50 ${
                      masterStats?.pollingEnabled
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                        : 'bg-green-500 text-black hover:brightness-110 shadow-[0_0_20px_rgba(0,255,65,0.3)]'
                    }`}
                  >
                    {masterStats?.pollingEnabled ? (
                      <><StopCircle className="w-4 h-4" /> STOP COPYING</>
                    ) : (
                      <><Play className="w-4 h-4" /> START COPY TRADING</>
                    )}
                  </button>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                  <div className="text-center">
                    <span className="text-[9px] text-gray-500 block">WIN RATE</span>
                    <span className="font-black text-sm text-green-400">{masterStats?.winRate || 0}%</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] text-gray-500 block">TOTAL TRADES</span>
                    <span className="font-black text-sm text-white">{masterStats?.totalTrades || 0}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] text-gray-500 block">ACTIVE FOLLOWERS</span>
                    <span className="font-black text-sm text-purple-400">{masterStats?.activeFollowers || 0}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] text-gray-500 block">STATUS</span>
                    <span className={`font-black text-sm ${masterStats?.isActive ? 'text-green-400' : 'text-red-400'}`}>
                      {masterStats?.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Today's Detected Orders */}
              <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" /> TODAY'S DETECTED BROKER FILLS
                  <span className="text-[9px] text-gray-500 font-normal">(auto-detected from your broker account)</span>
                </h4>
                {masterOrders.length === 0 ? (
                  <div className="text-[10px] text-gray-500 py-4 text-center">
                    {masterStats?.pollingEnabled ? 'Waiting for fills in your broker account...' : 'Start polling to see detected orders here.'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {masterOrders.map((o, i) => (
                      <div key={o.id || i} className="bg-[#0B0E14] p-3 rounded-xl flex justify-between items-center text-[10px] border border-white/5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <EventBadge eventType={o.eventType} />
                            <SourceBadge tradeSource={o.tradeSource || 'MANUAL'} />
                            <span className={`font-black ${o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{o.side}</span>
                            <span className="text-white font-bold">{o.symbol}</span>
                          </div>
                          <div className="text-gray-400">
                            Filled: <strong className="text-white">{o.filledQty}/{o.totalQty}</strong> @ ₹<strong className="text-white">{o.avgPrice}</strong>
                            {' '}{o.productType}
                          </div>
                        </div>
                        <div className="text-right space-y-0.5">
                          <div className={`font-black text-[9px] px-2 py-0.5 rounded border ${o.copyDispatched ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                            {o.copyDispatched ? '✅ COPIED' : '⏳ PENDING'}
                          </div>
                          <div className="text-gray-500 text-[9px]">
                            {o.detectedAt ? new Date(o.detectedAt).toLocaleTimeString('en-IN') : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Followers List */}
              <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" /> YOUR FOLLOWERS ({masterFollowers.length})
                </h4>
                {masterFollowers.length === 0 ? (
                  <div className="text-[10px] text-gray-500 py-4 text-center">No followers yet. Your profile is public — students can find and subscribe to you.</div>
                ) : (
                  <div className="space-y-2">
                    {masterFollowers.map(f => (
                      <div key={f.id} className="bg-[#0B0E14] p-3 rounded-xl flex justify-between items-center text-[10px] border border-white/5">
                        <div>
                          <div className="font-bold text-white">{f.user?.name}</div>
                          <div className="text-gray-400">ID: {f.user?.studentId} · Alloc: {f.allocationType} × {f.allocationValue}</div>
                        </div>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${f.isActive && !f.killSwitchActive && !f.emergencyStop ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                          {f.isActive && !f.killSwitchActive && !f.emergencyStop ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ COPY LOGS TAB ══ */}
      {activeTab === 'LOGS' && (
        <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" /> COPY TRADE EXECUTION LOGS
            </h2>
            <button onClick={fetchData} className="text-[10px] text-gray-400 hover:text-white cursor-pointer flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">No copied trades logged yet.</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="bg-[#0B0E14] p-3 rounded-xl border border-white/5 flex justify-between items-center text-[10px]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EventBadge eventType={log.eventType} />
                      <SourceBadge tradeSource={log.tradeSource} parentSource={log.parentSource} />
                      <span className="text-gray-400">From: <strong className="text-white">{log.master?.displayName}</strong></span>
                    </div>
                    <div className="font-bold text-white">
                      <span className={log.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>{log.side}</span>
                      {' '}{log.quantity} {log.symbol} @ ₹{log.price}
                    </div>
                    {log.errorMessage && <div className="text-red-400">Error: {log.errorMessage}</div>}
                    {log.riskReason && <div className="text-amber-400">Risk: {log.riskReason}</div>}
                  </div>
                  <div className="text-right space-y-1">
                    <StatusBadge status={log.status} />
                    <div className="text-gray-500 text-[9px]">{new Date(log.createdAt).toLocaleString('en-IN')}</div>
                    {log.followerOrderId && <div className="text-[9px] text-gray-600 font-mono">Order: {log.followerOrderId}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ══ BROKER ACCOUNTS TAB ══ */}
      {activeTab === 'BROKER' && (
        <div className="bg-[#161B22] border border-purple-500/30 rounded-2xl p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <span className="font-black text-white text-xs uppercase">CONNECTED BROKER ACCOUNTS</span>
            </div>
            <button
              onClick={() => setShowConnectForm(!showConnectForm)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold cursor-pointer"
            >
              {showConnectForm ? 'Cancel' : '+ Connect Account'}
            </button>
          </div>

          {connections.length > 0 && !showConnectForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {connections.map(c => (
                <div key={c.id} className="bg-[#0B0E14] border border-white/10 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>{BROKERS_CONFIG.find(b => b.id === c.broker)?.icon || '💼'}</span>
                      <span>{BROKERS_CONFIG.find(b => b.id === c.broker)?.name || c.broker}</span>
                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">{c.displayName}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">Client: {c.clientId || c.id.slice(0, 8)}</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Disconnect this account?')) return;
                      await apiClient.delete(`/algo/connections/${c.id}`).catch(() => {});
                      fetchData(); fetchMasterData();
                    }}
                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}

          {(showConnectForm || connections.length === 0) && (
            <form onSubmit={handleConnectBroker} className="space-y-3">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {BROKERS_CONFIG.map(b => (
                  <button key={b.id} type="button" onClick={() => { setSelectedBroker(b.id); setBrokerFormData({}); }}
                    className={`p-2 rounded-xl border text-center font-bold text-[10px] cursor-pointer flex flex-col items-center gap-1 ${selectedBroker === b.id ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-[#0B0E14] border-white/10 text-gray-400 hover:text-white'}`}>
                    <span className="text-sm">{b.icon}</span>
                    <span className="truncate w-full">{b.name}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1">ACCOUNT LABEL</label>
                  <input value={brokerLabel} onChange={e => setBrokerLabel(e.target.value)}
                    placeholder="e.g. My Live Account"
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none focus:border-purple-500" />
                </div>
                {BROKERS_CONFIG.find(b => b.id === selectedBroker)?.fields.map(f => (
                  <div key={f}>
                    <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">{f}</label>
                    <input
                      type={f.toLowerCase().includes('secret') || f.toLowerCase().includes('token') || f.toLowerCase().includes('password') ? 'password' : 'text'}
                      placeholder={`Enter ${f}`}
                      value={brokerFormData[f] || ''}
                      onChange={e => setBrokerFormData({ ...brokerFormData, [f]: e.target.value })}
                      className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none focus:border-purple-500 font-mono"
                      required
                    />
                  </div>
                ))}
              </div>
              <button type="submit" disabled={connectingBroker}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs rounded-xl cursor-pointer disabled:opacity-50">
                {connectingBroker ? 'Connecting...' : 'AUTHORIZE & CONNECT ACCOUNT'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ══ FOLLOW CONFIRMATION MODAL ══ */}
      {showConfirmModal && selectedMaster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#10131a] border border-purple-500/30 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl font-mono text-xs text-white max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-purple-300 flex items-center gap-2">
                <Shield className="w-4 h-4" /> COPY TRADING CONFIRMATION
              </h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-400">Master Trader:</span><strong className="text-white">{selectedMaster.displayName}</strong></div>
              <div className="flex justify-between"><span className="text-gray-400">Risk Level:</span><strong className="text-amber-400">{selectedMaster.riskLevel}</strong></div>
              <div className="flex justify-between"><span className="text-gray-400">Win Rate:</span><strong className="text-green-400">{selectedMaster.winRate}%</strong></div>
              <div className="flex justify-between"><span className="text-gray-400">Source of Truth:</span><strong className="text-purple-300">Master's Actual Broker Fills</strong></div>
            </div>

            {connections.length === 0 ? (
              <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-red-400">No connected broker account. Go to BROKER ACCOUNTS tab first.</div>
            ) : (
              <div>
                <label className="text-[9px] text-gray-400 block mb-1 uppercase font-bold">Your Trading Account (for copy orders)</label>
                <select value={selectedConnectionId} onChange={e => setSelectedConnectionId(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-white/10 p-2.5 rounded-lg text-xs font-bold text-white outline-none">
                  {connections.map(c => <option key={c.id} value={c.id}>{c.displayName || c.broker}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Configure Allocation & Risk</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1">ALLOCATION TYPE</label>
                  <select value={allocationType} onChange={e => setAllocationType(e.target.value)}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none">
                    <option value="FIXED_QTY">Fixed Qty/Lots</option>
                    <option value="MULTIPLIER">Multiplier (1x, 2x...)</option>
                    <option value="PERCENTAGE">% of Master Qty</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1">VALUE</label>
                  <input type="number" value={allocationValue} onChange={e => setAllocationValue(Number(e.target.value))}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1">MAX DAILY LOSS (₹)</label>
                  <input type="number" value={maxDailyLoss} onChange={e => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1">MAX OPEN TRADES</label>
                  <input type="number" value={maxOpenTrades} onChange={e => setMaxOpenTrades(Number(e.target.value))}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white outline-none" />
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
              <label className="flex items-start gap-2.5 cursor-pointer text-[10px] text-amber-200 leading-relaxed">
                <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)} className="mt-0.5 accent-purple-500" />
                <span>{CONSENT_TEXT}</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl font-bold cursor-pointer">CANCEL</button>
              <button
                onClick={handleConfirmJoin}
                disabled={joining || !consentAccepted || connections.length === 0}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black rounded-xl cursor-pointer flex items-center justify-center gap-2"
              >
                {joining ? 'Activating...' : <><CheckCircle className="w-4 h-4" /> START COPY TRADING</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
