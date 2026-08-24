'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Shield, AlertTriangle, ArrowLeft, CheckCircle,
  Copy, RefreshCw, Power, Trash2, Key, Link2, Clock,
  Activity, Settings, Lock, Eye, EyeOff, Terminal, Check,
  Sliders, Edit3, Plus, X, ArrowUpRight, ArrowDownRight, Layers, Server
} from 'lucide-react';
import apiClient from '../lib/axios';
import { useTrading } from '../context/TradingContext';
import ExecutionAgentDashboard from './ExecutionAgentDashboard';

const BROKERS = [
  { id: 'DHAN', name: 'Dhan', icon: '⚡', fields: ['clientId', 'accessToken'] },
  { id: 'ANGELONE', name: 'Angel One', icon: '👼', fields: ['apiKey', 'clientId', 'password', 'totpSecret'] },
  { id: 'UPSTOX', name: 'Upstox', icon: '📈', fields: ['apiKey', 'apiSecret', 'accessToken'] },
  { id: 'SHOONYA', name: 'Shoonya', icon: '🎯', fields: ['clientId', 'password', 'totpSecret', 'vendorCode', 'apiSecret'] },
  { id: 'FYERS', name: 'Fyers', icon: '🔥', fields: ['apiKey', 'clientId', 'accessToken'] },
  { id: 'GOPOCKET', name: 'GoPocket', icon: '💼', fields: ['clientId', 'apiKey', 'apiSecret', 'accessToken'] },
];

const CONSENT_TEXT = `I authorize Hello Trader to send orders to my connected broker account based on my selected automation settings. I understand that trading involves market risk, past performance does not guarantee future results, no returns are guaranteed, and I remain fully responsible for my own trading decisions and outcomes. I understand I can disconnect my broker at any time.`;

function getBrokerFieldLabel(broker, field) {
  if (broker === 'ANGELONE' && (field === 'password' || field === 'pin')) return 'PIN / MPIN';
  return field.replace(/([A-Z])/g, ' $1');
}

function getBrokerFieldPlaceholder(broker, field) {
  if (broker === 'DHAN') {
    if (field === 'clientId') return 'e.g. 1100346083 (Dhan Numeric Client ID)';
    if (field === 'accessToken') return 'Enter Dhan 24-Hour Access Token';
  }
  if (broker === 'ANGELONE') {
    if (field === 'clientId') return 'e.g. A123456 (Angel One Client ID)';
    if (field === 'apiKey') return 'Enter Angel One SmartAPI Key';
    if (field === 'password' || field === 'pin') return 'Enter Angel One PIN / MPIN';
    if (field === 'totpSecret') return 'Enter 32-digit Authenticator TOTP Secret';
  }
  if (broker === 'UPSTOX') {
    if (field === 'apiKey') return 'Enter Upstox API Key';
    if (field === 'apiSecret') return 'Enter Upstox API Secret';
    if (field === 'accessToken') return 'Enter Upstox Access Token';
  }
  if (broker === 'FYERS') {
    if (field === 'clientId') return 'e.g. FY12345 (Fyers Client ID)';
    if (field === 'apiKey') return 'Enter Fyers App ID';
    if (field === 'accessToken') return 'Enter Fyers Access Token';
  }
  return `Enter your ${getBrokerFieldLabel(broker, field)}`;
}

export default function AlgoTrading({ user, onBack }) {
  const { isExpiredTrial, openRechargeModal, authLoading } = useTrading();

  useEffect(() => {
    if (!authLoading && isExpiredTrial) {
      openRechargeModal();
    }
  }, [authLoading, isExpiredTrial, openRechargeModal]);

  const [connections, setConnections] = useState([]);
  const [logs, setLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedBroker, setSelectedBroker] = useState('DHAN');
  const [formData, setFormData] = useState({});
  const [displayName, setDisplayName] = useState('');
  const [maxDailyLoss, setMaxDailyLoss] = useState('5000');
  const [maxOpenTrades, setMaxOpenTrades] = useState('5');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('CONNECTIONS');
  const [copiedToken, setCopiedToken] = useState(null);

  // ── Edit Credentials State ──
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedConnForUpdate, setSelectedConnForUpdate] = useState(null);
  const [updateFields, setUpdateFields] = useState({});
  const [updateDisplayName, setUpdateDisplayName] = useState('');
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState(null);

  // ── Trigger Config (Custom Bridge) State ──
  const [selectedConnForTriggers, setSelectedConnForTriggers] = useState(null);
  const [triggerConfigs, setTriggerConfigs] = useState({ upside: null, downside: null });
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [modalDirection, setModalDirection] = useState('UPSIDE'); // UPSIDE | DOWNSIDE
  const [triggerFormData, setTriggerFormData] = useState({
    exchange: 'NFO',
    symbol: 'NIFTY',
    productType: 'MIS',
    scriptType: 'OPTION',
    lots: 1,
    expiryType: 'WEEKLY',
    expiryGap: 0,
    strikeOffset: 0,
    strikeStep: 50,
    optionType: 'CE',
    orderSide: 'BUY',
    exitOnOpposite: true,
    enabled: true,
  });
  const [savingTrigger, setSavingTrigger] = useState(false);

  // ── Trial Lock ──
  if (authLoading || isExpiredTrial) {
    return (
      <div className="p-8 text-center bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] flex flex-col items-center justify-center space-y-4 font-mono">
        <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.2)]">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-black text-[#D4AF37] tracking-widest uppercase">🔒 PRO FEATURE LOCKED</div>
          <h2 className="text-lg font-bold text-white uppercase">Algo Trading Locked</h2>
        </div>
        <p className="text-xs text-gray-400 max-w-md leading-relaxed">
          Your free trial has ended. Recharge your wallet tokens to unlock webhook algo trading execution.
        </p>
        <div className="flex gap-3 pt-2">
          {onBack && (
            <button onClick={onBack} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl">
              ← Back
            </button>
          )}
          <button
            onClick={openRechargeModal}
            className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] via-[#F59E0B] to-[#D97706] text-black font-extrabold text-xs rounded-xl shadow-lg uppercase cursor-pointer"
          >
            RECHARGE / ACTIVATE
          </button>
        </div>
      </div>
    );
  }

  const fetchConnections = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/connections');
      if (res.data?.success) {
        const conns = res.data.connections || [];
        setConnections(conns);
        if (conns.length > 0 && !selectedConnForTriggers) {
          setSelectedConnForTriggers(conns[0].id);
        }
      }
    } catch (_) {}
  }, [selectedConnForTriggers]);

  const fetchTriggers = useCallback(async (connId) => {
    if (!connId) return;
    try {
      const res = await apiClient.get(`/algo/connections/${connId}/triggers`);
      if (res.data?.success) {
        setTriggerConfigs({
          upside: res.data.upside,
          downside: res.data.downside,
        });
      }
    } catch (_) {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const [logRes, auditRes] = await Promise.all([
        apiClient.get('/algo/logs?limit=30'),
        apiClient.get('/algo/audit?limit=30'),
      ]);
      if (logRes.data?.success) setLogs(logRes.data.logs || []);
      if (auditRes.data?.success) setAuditLogs(auditRes.data.logs || []);
    } catch (_) {}
  }, []);

  const [algoPositions, setAlgoPositions] = useState([]);
  const [supportedBrokers, setSupportedBrokers] = useState(BROKERS);
  const [isKilling, setIsKilling] = useState(false);

  const fetchAlgoPositions = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/positions');
      if (res.data?.success) {
        setAlgoPositions(res.data.positions || []);
      }
    } catch (_) {}
  }, []);

  const fetchBrokers = useCallback(async () => {
    try {
      const res = await apiClient.get('/algo/brokers');
      if (res.data?.success && Array.isArray(res.data.brokers)) {
        setSupportedBrokers(res.data.brokers);
      }
    } catch (_) {}
  }, []);

  const handleKillAllAlgo = async () => {
    if (!confirm("⚠️ EMERGENCY KILL ALL ALGO: Are you sure you want to immediately stop all algo strategies and emergency close all open algo positions?")) {
      return;
    }
    setIsKilling(true);
    try {
      const res = await apiClient.post('/algo/kill-all');
      if (res.data?.success) {
        alert("Emergency Kill Switch executed successfully! All active algo strategies stopped.");
        fetchConnections();
        fetchAlgoPositions();
      }
    } catch (err) {
      alert(err.response?.data?.error || "Failed to execute emergency kill switch");
    } finally {
      setIsKilling(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchLogs();
    fetchBrokers();
    fetchAlgoPositions();
    const timer = setInterval(() => { fetchLogs(); fetchAlgoPositions(); }, 5000);
    return () => clearInterval(timer);
  }, [fetchConnections, fetchLogs, fetchBrokers, fetchAlgoPositions]);

  useEffect(() => {
    if (selectedConnForTriggers) {
      fetchTriggers(selectedConnForTriggers);
    }
  }, [selectedConnForTriggers, fetchTriggers]);

  // ── Open Trigger Edit Modal ──
  const handleOpenTriggerModal = (direction) => {
    setModalDirection(direction);
    const existing = direction === 'UPSIDE' ? triggerConfigs.upside : triggerConfigs.downside;
    if (existing) {
      setTriggerFormData({
        exchange: existing.exchange || 'NFO',
        symbol: existing.symbol || 'NIFTY',
        productType: existing.productType || 'MIS',
        scriptType: existing.scriptType || 'OPTION',
        lots: existing.lots || 1,
        expiryType: existing.expiryType || 'WEEKLY',
        expiryGap: existing.expiryGap ?? 0,
        strikeOffset: existing.strikeOffset ?? 0,
        strikeStep: existing.strikeStep || 50,
        optionType: existing.optionType || (direction === 'UPSIDE' ? 'CE' : 'PE'),
        orderSide: existing.orderSide || 'BUY',
        exitOnOpposite: existing.exitOnOpposite ?? true,
        enabled: existing.enabled ?? true,
      });
    } else {
      setTriggerFormData({
        exchange: 'NFO',
        symbol: 'NIFTY',
        productType: 'MIS',
        scriptType: 'OPTION',
        lots: 1,
        expiryType: 'WEEKLY',
        expiryGap: 0,
        strikeOffset: 0,
        strikeStep: 50,
        optionType: direction === 'UPSIDE' ? 'CE' : 'PE',
        orderSide: 'BUY',
        exitOnOpposite: true,
        enabled: true,
      });
    }
    setShowTriggerModal(true);
  };

  // ── Save Trigger Config ──
  const handleSaveTrigger = async (e) => {
    e.preventDefault();
    if (!selectedConnForTriggers) return alert('Select a connected broker account first.');
    setSavingTrigger(true);
    try {
      const res = await apiClient.post(`/algo/connections/${selectedConnForTriggers}/triggers`, {
        direction: modalDirection,
        ...triggerFormData,
      });
      if (res.data?.success) {
        alert(`✅ ${modalDirection} execution config saved successfully!`);
        setShowTriggerModal(false);
        fetchTriggers(selectedConnForTriggers);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save trigger config.');
    }
    setSavingTrigger(false);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!consentAccepted) return alert('You must explicitly accept authorization terms.');

    // Client ID Validation: Prevent website/admin login email from being submitted
    if (formData.clientId && formData.clientId.trim().includes('@')) {
      return alert('❌ Invalid Client ID: Please enter your broker numeric Client ID (e.g. 1100346083), NOT your website login email.');
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/algo/connect', {
        broker: selectedBroker,
        displayName: displayName || `${selectedBroker} Account`,
        ...formData,
        maxDailyLoss: Number(maxDailyLoss),
        maxOpenTrades: Number(maxOpenTrades),
        consentAccepted: true,
      });
      if (res.data?.success) {
        alert(`✅ ${selectedBroker} broker connected successfully!`);
        setFormData({});
        setDisplayName('');
        setConsentAccepted(false);
        fetchConnections();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Connection failed.');
    }
    setIsSubmitting(false);
  };

  const handleTestConnection = async (id) => {
    const res = await apiClient.post(`/algo/connections/${id}/test`).catch(() => null);
    alert(res?.data?.message || 'Test complete.');
    fetchConnections();
  };

  const handleToggleKillSwitch = async (id, currentKillState) => {
    const res = await apiClient.post(`/algo/connections/${id}/kill`, { active: !currentKillState }).catch(() => null);
    if (res?.data?.message) alert(res.data.message);
    fetchConnections();
  };

  const handleDeleteConnection = async (id) => {
    if (!confirm('Are you sure you want to disconnect this broker?')) return;
    await apiClient.delete(`/algo/connections/${id}`).catch(() => {});
    fetchConnections();
  };

  const handleOpenUpdateModal = (conn) => {
    setSelectedConnForUpdate(conn);
    setUpdateDisplayName(conn.displayName || '');
    // Pre-populate only visible fields. Keep passwords/secrets blank.
    const initialFields = {};
    const brokerMeta = BROKERS.find(b => b.id === conn.broker);
    if (brokerMeta) {
      brokerMeta.fields.forEach(field => {
        const isSecret = field.toLowerCase().includes('secret') ||
                        field.toLowerCase().includes('token') ||
                        field.toLowerCase().includes('password');
        if (!isSecret) {
          initialFields[field] = conn[field] || '';
        } else {
          initialFields[field] = ''; // Start blank for secrets
        }
      });
    }
    setUpdateFields(initialFields);
    setUpdateError(null);
    setShowUpdateModal(true);
  };

  const handleUpdateCredentials = async (e) => {
    e.preventDefault();
    if (!selectedConnForUpdate) return;

    if (updateFields.clientId && updateFields.clientId.trim().includes('@')) {
      setUpdateError('Invalid Client ID: Please enter your broker numeric Client ID, not an email address.');
      return;
    }

    setUpdateSubmitting(true);
    setUpdateError(null);

    try {
      const payload = {
        displayName: updateDisplayName,
        ...updateFields
      };

      const res = await apiClient.put(`/algo/connections/${selectedConnForUpdate.id}/credentials`, payload);

      if (res.data?.success) {
        alert('✅ Connection credentials updated and verified successfully!');
        setShowUpdateModal(false);
        fetchConnections();
      } else {
        setUpdateError(res.data?.message || 'Verification failed. Please check credentials.');
      }
    } catch (err) {
      setUpdateError(err.response?.data?.message || err.message || 'Failed to update credentials.');
    } finally {
      setUpdateSubmitting(false);
    }
  };

  const copyToClipboard = (text, token) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const selectedBrokerMeta = BROKERS.find(b => b.id === selectedBroker);

  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto' }} className="p-5 bg-[#0B0E14] text-white font-mono space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-black flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#00D4FF]" />
              ALGO TRADING ENGINE
              <span className="text-[10px] bg-[#00D4FF]/10 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/30">CUSTOM BRIDGE</span>
            </h1>
            <p className="text-xs text-gray-400">Save your UP SIDE & DOWN SIDE option triggers — TradingView signals resolve ATM/ITM/OTM strikes automatically.</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-[#0B0E14] p-1 rounded-xl border border-white/10 text-xs font-bold flex-wrap gap-1 items-center">
          <button
            onClick={() => setActiveTab('TRIGGERS')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'TRIGGERS' ? 'bg-[#00D4FF] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            🎛️ CUSTOM BRIDGE CONFIG
          </button>
          <button
            onClick={() => setActiveTab('AGENT')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'AGENT' ? 'bg-[#00D4FF] text-black font-black' : 'text-gray-400 hover:text-white'}`}
          >
            <Server className="w-3.5 h-3.5" />
            EXECUTION AGENT
          </button>
          <button
            onClick={() => setActiveTab('CONNECTIONS')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'CONNECTIONS' ? 'bg-[#00D4FF] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            TERMINALS ({connections.length})
          </button>
          <button
            onClick={() => setActiveTab('POSITIONS')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'POSITIONS' ? 'bg-[#00D4FF] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            POSITIONS ({algoPositions.length})
          </button>
          <button
            onClick={() => setActiveTab('CONNECT_NEW')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'CONNECT_NEW' ? 'bg-[#00D4FF] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            + CONNECT TERMINAL
          </button>
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'LOGS' ? 'bg-[#00D4FF] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            LOGS ({logs.length})
          </button>
          <button
            onClick={handleKillAllAlgo}
            disabled={isKilling}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center gap-1 cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            {isKilling ? 'KILLING...' : 'EMERGENCY KILL ALL'}
          </button>
        </div>
      </div>

      {/* ── CUSTOM BRIDGE TRIGGER CONFIG TAB ── */}
      {activeTab === 'TRIGGERS' && (
        <div className="space-y-4 font-mono">
          <div className="flex justify-between items-center flex-wrap gap-3 bg-[#161B22] p-4 rounded-xl border border-white/10">
            <div>
              <span className="text-[10px] text-gray-400 font-bold block uppercase">Select Connected Demat Account</span>
              <select
                value={selectedConnForTriggers || ''}
                onChange={e => setSelectedConnForTriggers(e.target.value)}
                className="bg-[#0B0E14] border border-white/10 text-white font-bold text-xs p-2 rounded-lg outline-none mt-1 focus:border-[#00D4FF]"
              >
                {connections.length === 0 && <option value="">No broker accounts connected</option>}
                {connections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.displayName || c.broker} ({c.broker})
                  </option>
                ))}
              </select>
            </div>

            {selectedConnForTriggers && (
              <div className="bg-[#0B0E14] p-2.5 rounded-lg border border-white/5 text-xs font-mono">
                <span className="text-[9px] text-gray-500 block uppercase">Signal Webhook URL (send {"{\"action\":\"BUY\"}"})</span>
                <span className="text-[#00D4FF] font-bold">
                  {connections.find(c => c.id === selectedConnForTriggers)?.webhookUrl}
                </span>
              </div>
            )}
          </div>

          {connections.length === 0 ? (
            <div className="bg-[#161B22] border border-white/10 rounded-2xl p-8 text-center text-gray-400 text-xs">
              Please connect your broker account first in the <strong>TERMINALS</strong> tab to configure Custom Bridge triggers.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ── UP SIDE EXECUTION CARD ── */}
              <div className="bg-[#161B22] border border-green-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <h3 className="font-black text-sm text-green-400 flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-green-400" />
                    UP SIDE EXECUTION (BUY Signals)
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${triggerConfigs.upside?.enabled ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {triggerConfigs.upside?.enabled ? '● ACTIVE' : '○ DISABLED'}
                    </span>
                    <button
                      onClick={() => handleOpenTriggerModal('UPSIDE')}
                      className="px-3 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/40 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Trigger
                    </button>
                  </div>
                </div>

                {triggerConfigs.upside ? (
                  <div className="space-y-3 text-xs">
                    <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5 space-y-2">
                      <div className="font-bold text-white text-sm flex items-center justify-between">
                        <span>{triggerConfigs.upside.symbol}-OPTION ({triggerConfigs.upside.optionType})</span>
                        <span className="text-xs text-gray-400">{triggerConfigs.upside.exchange}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-gray-400 pt-1">
                        <div><span className="text-gray-500 block font-bold">QUANTITY</span><strong className="text-white">{triggerConfigs.upside.lots} Lot(s)</strong></div>
                        <div><span className="text-gray-500 block font-bold">EXPIRY</span><strong className="text-white">{triggerConfigs.upside.expiryType} ({triggerConfigs.upside.expiryGap})</strong></div>
                        <div><span className="text-gray-500 block font-bold">TYPE</span><strong className="text-green-400">{triggerConfigs.upside.orderSide}</strong></div>
                        <div><span className="text-gray-500 block font-bold">STRIKE</span><strong className="text-purple-300">{triggerConfigs.upside.strikeOffset === 0 ? 'ATM' : triggerConfigs.upside.strikeOffset < 0 ? `ITM ${Math.abs(triggerConfigs.upside.strikeOffset)}` : `OTM ${triggerConfigs.upside.strikeOffset}`}</strong></div>
                      </div>
                      <div className="text-[10px] text-gray-400 border-t border-white/5 pt-2 flex justify-between">
                        <span>Product: <strong className="text-white">{triggerConfigs.upside.productType}</strong></span>
                        <span>Exit on Opposite: <strong className={triggerConfigs.upside.exitOnOpposite ? 'text-green-400' : 'text-gray-400'}>{triggerConfigs.upside.exitOnOpposite ? 'Yes' : 'No'}</strong></span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#0B0E14] p-6 rounded-xl text-center text-gray-500 text-xs space-y-2">
                    <p>No UP SIDE trigger configured yet.</p>
                    <button onClick={() => handleOpenTriggerModal('UPSIDE')} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded-xl cursor-pointer">
                      + Configure UP SIDE Trigger
                    </button>
                  </div>
                )}
              </div>

              {/* ── DOWN SIDE EXECUTION CARD ── */}
              <div className="bg-[#161B22] border border-red-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <h3 className="font-black text-sm text-red-400 flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-red-400" />
                    DOWN SIDE EXECUTION (SELL Signals)
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${triggerConfigs.downside?.enabled ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {triggerConfigs.downside?.enabled ? '● ACTIVE' : '○ DISABLED'}
                    </span>
                    <button
                      onClick={() => handleOpenTriggerModal('DOWNSIDE')}
                      className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Trigger
                    </button>
                  </div>
                </div>

                {triggerConfigs.downside ? (
                  <div className="space-y-3 text-xs">
                    <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5 space-y-2">
                      <div className="font-bold text-white text-sm flex items-center justify-between">
                        <span>{triggerConfigs.downside.symbol}-OPTION ({triggerConfigs.downside.optionType})</span>
                        <span className="text-xs text-gray-400">{triggerConfigs.downside.exchange}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-gray-400 pt-1">
                        <div><span className="text-gray-500 block font-bold">QUANTITY</span><strong className="text-white">{triggerConfigs.downside.lots} Lot(s)</strong></div>
                        <div><span className="text-gray-500 block font-bold">EXPIRY</span><strong className="text-white">{triggerConfigs.downside.expiryType} ({triggerConfigs.downside.expiryGap})</strong></div>
                        <div><span className="text-gray-500 block font-bold">TYPE</span><strong className="text-red-400">{triggerConfigs.downside.orderSide}</strong></div>
                        <div><span className="text-gray-500 block font-bold">STRIKE</span><strong className="text-purple-300">{triggerConfigs.downside.strikeOffset === 0 ? 'ATM' : triggerConfigs.downside.strikeOffset < 0 ? `ITM ${Math.abs(triggerConfigs.downside.strikeOffset)}` : `OTM ${triggerConfigs.downside.strikeOffset}`}</strong></div>
                      </div>
                      <div className="text-[10px] text-gray-400 border-t border-white/5 pt-2 flex justify-between">
                        <span>Product: <strong className="text-white">{triggerConfigs.downside.productType}</strong></span>
                        <span>Exit on Opposite: <strong className={triggerConfigs.downside.exitOnOpposite ? 'text-green-400' : 'text-gray-400'}>{triggerConfigs.downside.exitOnOpposite ? 'Yes' : 'No'}</strong></span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#0B0E14] p-6 rounded-xl text-center text-gray-500 text-xs space-y-2">
                    <p>No DOWN SIDE trigger configured yet.</p>
                    <button onClick={() => handleOpenTriggerModal('DOWNSIDE')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl cursor-pointer">
                      + Configure DOWN SIDE Trigger
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EXECUTION AGENT TAB (PHASE 4) ── */}
      {activeTab === 'AGENT' && (
        <ExecutionAgentDashboard connections={connections} />
      )}

      {/* ── POSITIONS TAB ── */}
      {activeTab === 'POSITIONS' && (
        <div className="space-y-4">
          <div className="bg-[#161B22] border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> Live Algo Positions ({algoPositions.length})
            </h3>
            {algoPositions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">
                No active algo positions currently open.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-[10px] uppercase font-mono">
                      <th className="p-2">Symbol</th>
                      <th className="p-2">Side</th>
                      <th className="p-2">Lots</th>
                      <th className="p-2">Entry Price</th>
                      <th className="p-2">LTP</th>
                      <th className="p-2">P&L</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {algoPositions.map((pos, idx) => (
                      <tr key={pos.id || idx} className="hover:bg-white/5">
                        <td className="p-2 font-bold text-white">{pos.symbol}</td>
                        <td className={`p-2 font-bold ${(pos.orderSide || pos.side) === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{pos.orderSide || pos.side}</td>
                        <td className="p-2">{pos.lots || 1} <span className="text-gray-400 text-[10px]">({pos.quantity || pos.netqty || 65})</span></td>
                        <td className="p-2 font-mono">₹{typeof pos.entryPrice === 'number' && pos.entryPrice > 0 ? pos.entryPrice.toFixed(2) : (pos.buyavgprice ? Number(pos.buyavgprice).toFixed(2) : '0.00')}</td>
                        <td className="p-2 font-mono">₹{typeof pos.ltp === 'number' && pos.ltp > 0 ? pos.ltp.toFixed(2) : '0.00'}</td>
                        <td className={`p-2 font-bold font-mono ${(pos.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(pos.pnl || 0) >= 0 ? '+' : ''}₹{(pos.pnl || 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-cyan-400 font-bold">{pos.status || 'OPEN'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TERMINALS TAB ── */}
      {activeTab === 'CONNECTIONS' && (
        <div className="space-y-4">
          {connections.length === 0 ? (
            <div className="bg-[#161B22] border border-white/10 rounded-2xl p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30 flex items-center justify-center mx-auto">
                <Key className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-black text-white">No Broker Connected Yet</h3>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Connect your trading account to generate your unique signal webhook URL.
              </p>
              <button
                onClick={() => setActiveTab('CONNECT_NEW')}
                className="px-6 py-2.5 bg-[#00D4FF] text-black font-black text-xs rounded-xl shadow-lg hover:bg-[#00D4FF]/90 transition-all cursor-pointer"
              >
                CONNECT YOUR FIRST BROKER
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map(c => (
                <div key={c.id} className="bg-[#161B22] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-sm text-white flex items-center gap-2">
                        {c.displayName || c.broker}
                        <span className="text-[9px] bg-[#00D4FF]/10 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/30 font-bold">
                          {c.broker}
                        </span>
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">Connected: {new Date(c.connectedAt).toLocaleDateString()}</p>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${c.killSwitchActive ? 'bg-red-500/20 text-red-400 border-red-500/30' : (c.isActive && c.testStatus === 'SUCCESS' && c.clientId) ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                      {c.killSwitchActive ? '🛑 KILLED' : (c.isActive && c.testStatus === 'SUCCESS' && c.clientId) ? 'ONLINE' : 'OFFLINE / UNAUTHENTICATED'}
                    </span>
                  </div>

                  {/* Webhook URL Box */}
                  <div className="bg-[#0B0E14] p-3 rounded-xl border border-white/5 space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-bold block uppercase">Signal Webhook URL</span>
                    <div className="flex items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-[#00D4FF] truncate font-bold">{c.webhookUrl}</span>
                      <button
                        onClick={() => copyToClipboard(c.webhookUrl, c.id)}
                        className="px-2.5 py-1 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 rounded text-[10px] font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedToken === c.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        {copiedToken === c.id ? 'COPIED!' : 'COPY'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-white/5 flex-wrap">
                    <button
                      onClick={() => { setSelectedConnForTriggers(c.id); fetchTriggerConfigs(c.id); setActiveTab('TRIGGERS'); }}
                      className="flex-1 py-1.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 rounded-lg text-[10px] font-black cursor-pointer flex items-center justify-center gap-1 transition-all"
                    >
                      <Sliders className="w-3 h-3" /> CONFIGURE TRIGGERS
                    </button>
                    <button onClick={() => handleTestConnection(c.id)} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1">
                      <RefreshCw className="w-3 h-3" /> TEST API
                    </button>
                    <button
                      onClick={() => handleOpenUpdateModal(c)}
                      className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1"
                      title="Edit / Update Credentials"
                    >
                      <Edit3 className="w-3 h-3" /> EDIT CREDENTIALS
                    </button>
                    <button onClick={() => handleToggleKillSwitch(c.id, c.killSwitchActive)} className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1 ${c.killSwitchActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                      <Power className="w-3 h-3" /> {c.killSwitchActive ? 'RESTART' : 'KILL'}
                    </button>
                    <button onClick={() => handleDeleteConnection(c.id)} className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CONNECT NEW BROKER TAB ── */}
      {activeTab === 'CONNECT_NEW' && (
        <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 space-y-5 max-w-2xl mx-auto shadow-2xl">
          <h2 className="text-sm font-black text-white flex items-center gap-2 border-b border-white/10 pb-3">
            <Key className="w-4 h-4 text-[#00D4FF]" /> CONNECT REAL BROKER DEMAT ACCOUNT
          </h2>
          <form
            onSubmit={handleConnect}
            className="space-y-4 text-xs"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
          >
            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1.5 uppercase">Select Broker</label>
              <div className="grid grid-cols-3 gap-2">
                {BROKERS.map(b => (
                  <button
                    key={b.id} type="button" onClick={() => { setSelectedBroker(b.id); setFormData({}); }}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 font-bold cursor-pointer ${selectedBroker === b.id ? 'bg-[#00D4FF]/10 border-[#00D4FF] text-[#00D4FF]' : 'bg-[#0B0E14] border-white/10 text-gray-400 hover:text-white'}`}
                  >
                    <span className="text-base">{b.icon}</span>
                    <span className="text-xs truncate">{b.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold block mb-1 uppercase">Account Label</label>
              <input
                type="text"
                name="broker_conn_label_no_autofill"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                placeholder="e.g. My Primary Trading Account"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-[#0B0E14] border border-white/10 p-2.5 rounded-lg text-white font-bold outline-none focus:border-[#00D4FF]"
              />
            </div>

            {selectedBrokerMeta?.fields.map(field => {
              const isSecret = field.toLowerCase().includes('secret') ||
                              field.toLowerCase().includes('token') ||
                              field.toLowerCase().includes('password');
              return (
                <div key={field}>
                  <label className="text-[10px] text-gray-400 font-bold block mb-1 uppercase">
                    {getBrokerFieldLabel(selectedBroker, field)}
                  </label>
                  <input
                    type={isSecret ? 'password' : 'text'}
                    name={`broker_${selectedBroker.toLowerCase()}_${field}_no_autofill`}
                    autoComplete={isSecret ? "new-password" : "off"}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    placeholder={getBrokerFieldPlaceholder(selectedBroker, field)}
                    value={formData[field] || ''}
                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2.5 rounded-lg text-white font-mono outline-none focus:border-[#00D4FF]"
                    required
                  />
                </div>
              );
            })}

            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-[10px] text-amber-200 leading-relaxed">
                <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)} className="mt-0.5 accent-[#00D4FF]" required />
                <span>{CONSENT_TEXT}</span>
              </label>
            </div>

            <button type="submit" disabled={isSubmitting || !consentAccepted} className="w-full py-3 bg-[#00D4FF] hover:bg-[#00D4FF]/90 disabled:opacity-50 text-black font-black text-xs rounded-xl shadow-xl transition-all cursor-pointer">
              {isSubmitting ? 'CONNECTING...' : 'AUTHORIZE & CONNECT BROKER'}
            </button>
          </form>
        </div>
      )}

      {/* ── WEBHOOK LOGS TAB ── */}
      {activeTab === 'LOGS' && (
        <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#00D4FF]" /> LIVE SIGNAL WEBHOOK LOGS
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No webhook signals received yet.</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="bg-[#0B0E14] p-3 rounded-xl border border-white/5 space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400">{new Date(log.receivedAt).toLocaleString('en-IN')}</span>
                    <span className={`px-2 py-0.5 rounded font-black text-[9px] ${log.executionStatus === 'EXECUTED' ? 'bg-green-500/20 text-green-400' : log.executionStatus === 'RISK_REJECTED' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-400'}`}>
                      {log.executionStatus}
                    </span>
                  </div>
                  <div className="text-white font-bold flex justify-between">
                    <span>{log.parsedAction} {log.parsedQty} <strong className="text-[#00D4FF]">{log.parsedSymbol}</strong> ({log.connection?.broker})</span>
                    {log.signalPrice && <span className="text-gray-400 text-[10px]">Spot @ ₹{log.signalPrice}</span>}
                  </div>
                  {log.resolvedContract && <div className="text-purple-300 text-[10px]">Resolved Contract: {log.resolvedContract}</div>}
                  {log.actualFillPrice ? (
                    <div className="text-green-400 text-[10px]">Execution Fill Price: ₹{log.actualFillPrice}</div>
                  ) : (
                    log.executionStatus !== 'PENDING' && (
                      <div className="text-gray-500 text-[10px]">Execution Price: NOT EXECUTED</div>
                    )
                  )}
                  {log.errorMessage && <div className="text-red-400 text-[10px]">{log.errorMessage}</div>}
                  {log.riskReason && <div className="text-amber-400 text-[10px]">Risk: {log.riskReason}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── UPDATE TRIGGER MODAL (MATCHES FINVESTALGO UI) ── */}
      {showTriggerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#10131a] border border-white/10 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl font-mono text-xs text-white">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00D4FF]" />
                Update Trigger — {modalDirection === 'UPSIDE' ? 'UP SIDE EXECUTION' : 'DOWN SIDE EXECUTION'}
              </h3>
              <button onClick={() => setShowTriggerModal(false)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSaveTrigger} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Exchange</label>
                  <select
                    value={triggerFormData.exchange}
                    onChange={e => setTriggerFormData({ ...triggerFormData, exchange: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  >
                    <option value="NFO">NFO</option>
                    <option value="BFO">BFO</option>
                    <option value="MCX">MCX</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Symbol</label>
                  <select
                    value={triggerFormData.symbol}
                    onChange={e => {
                      const sym = e.target.value;
                      const step = sym === 'BANKNIFTY' ? 100 : sym === 'MIDCPNIFTY' ? 25 : 50;
                      setTriggerFormData({ ...triggerFormData, symbol: sym, strikeStep: step });
                    }}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  >
                    <option value="NIFTY">NIFTY</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
                    <option value="FINNIFTY">FINNIFTY</option>
                    <option value="MIDCPNIFTY">MIDCPNIFTY</option>
                    <option value="SENSEX">SENSEX</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Product</label>
                  <select
                    value={triggerFormData.productType}
                    onChange={e => setTriggerFormData({ ...triggerFormData, productType: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  >
                    <option value="MIS">INTRADAY (MIS)</option>
                    <option value="NRML">CARRYFORWARD (NRML)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Script Type</label>
                  <select
                    value={triggerFormData.scriptType}
                    onChange={e => setTriggerFormData({ ...triggerFormData, scriptType: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  >
                    <option value="OPTION">Option</option>
                    <option value="FUTURE">Future</option>
                    <option value="EQUITY">Equity</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Order Lot</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={triggerFormData.lots}
                    onChange={e => setTriggerFormData({ ...triggerFormData, lots: Number(e.target.value) })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Expiry Type</label>
                  <select
                    value={triggerFormData.expiryType}
                    onChange={e => setTriggerFormData({ ...triggerFormData, expiryType: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Expiry Gap</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={triggerFormData.expiryGap}
                    onChange={e => setTriggerFormData({ ...triggerFormData, expiryGap: Number(e.target.value) })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Strike Offset (0=ATM, -1=ITM, +1=OTM)</label>
                  <input
                    type="number"
                    min="-5"
                    max="5"
                    value={triggerFormData.strikeOffset}
                    onChange={e => setTriggerFormData({ ...triggerFormData, strikeOffset: Number(e.target.value) })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Strike Step Interval</label>
                  <input
                    type="number"
                    value={triggerFormData.strikeStep}
                    onChange={e => setTriggerFormData({ ...triggerFormData, strikeStep: Number(e.target.value) })}
                    className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-xs text-white font-bold outline-none"
                  />
                </div>
              </div>

              {/* CE / PE & BUY / SELL Buttons */}
              <div className="flex flex-wrap gap-4 pt-1 border-t border-white/5">
                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Option Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTriggerFormData({ ...triggerFormData, optionType: 'CE' })}
                      className={`px-4 py-2 rounded-lg font-bold text-xs cursor-pointer ${triggerFormData.optionType === 'CE' ? 'bg-[#00D4FF] text-black font-black' : 'bg-[#0B0E14] border border-white/10 text-gray-400'}`}
                    >
                      Call(CE)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTriggerFormData({ ...triggerFormData, optionType: 'PE' })}
                      className={`px-4 py-2 rounded-lg font-bold text-xs cursor-pointer ${triggerFormData.optionType === 'PE' ? 'bg-purple-600 text-white font-black' : 'bg-[#0B0E14] border border-white/10 text-gray-400'}`}
                    >
                      Put(PE)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-gray-400 font-bold block mb-1 uppercase">Order Action</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTriggerFormData({ ...triggerFormData, orderSide: 'BUY' })}
                      className={`px-4 py-2 rounded-lg font-bold text-xs cursor-pointer ${triggerFormData.orderSide === 'BUY' ? 'bg-green-500 text-black font-black' : 'bg-[#0B0E14] border border-white/10 text-gray-400'}`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => setTriggerFormData({ ...triggerFormData, orderSide: 'SELL' })}
                      className={`px-4 py-2 rounded-lg font-bold text-xs cursor-pointer ${triggerFormData.orderSide === 'SELL' ? 'bg-red-500 text-white font-black' : 'bg-[#0B0E14] border border-white/10 text-gray-400'}`}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 font-bold">
                    <input
                      type="checkbox"
                      checked={triggerFormData.exitOnOpposite}
                      onChange={e => setTriggerFormData({ ...triggerFormData, exitOnOpposite: e.target.checked })}
                      className="accent-[#00D4FF]"
                    />
                    Exit on Opposite Signal
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowTriggerModal(false)}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 font-bold rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingTrigger}
                  className="flex-1 py-2.5 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-black rounded-xl shadow-lg cursor-pointer"
                >
                  {savingTrigger ? 'Saving...' : 'Submit Trigger Config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── UPDATE CREDENTIALS MODAL ── */}
      {showUpdateModal && selectedConnForUpdate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#161B22] border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="bg-[#0B0E14] px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#00D4FF]" />
                <h3 className="text-sm font-black text-white">
                  Update Credentials — {selectedConnForUpdate.displayName || selectedConnForUpdate.broker}
                </h3>
              </div>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={handleUpdateCredentials}
              className="p-5 space-y-4 text-xs"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
            >
              {updateError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{updateError}</span>
                </div>
              )}

              {/* Display Account Label */}
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1 uppercase">Account Label</label>
                <input
                  type="text"
                  name="broker_update_label_no_autofill"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  placeholder="e.g. My Primary Trading Account"
                  value={updateDisplayName}
                  onChange={e => setUpdateDisplayName(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-white/10 p-2.5 rounded-lg text-white font-bold outline-none focus:border-[#00D4FF]"
                />
              </div>

              {/* Dynamically Render Fields based on Broker Meta */}
              {BROKERS.find(b => b.id === selectedConnForUpdate.broker)?.fields.map(field => {
                const isSecret = field.toLowerCase().includes('secret') ||
                                field.toLowerCase().includes('token') ||
                                field.toLowerCase().includes('password');
                return (
                  <div key={field}>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1 uppercase">
                      {getBrokerFieldLabel(selectedConnForUpdate.broker, field)}
                    </label>
                    <input
                      type={isSecret ? 'password' : 'text'}
                      name={`broker_update_${selectedConnForUpdate.broker.toLowerCase()}_${field}_no_autofill`}
                      autoComplete={isSecret ? "new-password" : "off"}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      placeholder={isSecret ? '•••••••• (Enter new to overwrite, leave blank to keep existing)' : getBrokerFieldPlaceholder(selectedConnForUpdate.broker, field)}
                      value={updateFields[field] || ''}
                      onChange={e => setUpdateFields({ ...updateFields, [field]: e.target.value })}
                      className="w-full bg-[#0B0E14] border border-white/10 p-2.5 rounded-lg text-white font-mono outline-none focus:border-[#00D4FF]"
                      required={!isSecret} // Secrets are not mandatory because user can choose to preserve them
                    />
                  </div>
                );
              })}

              <div className="bg-[#0B0E14] p-3.5 rounded-xl border border-white/5 space-y-1">
                <span className="text-[9px] text-[#00D4FF] font-bold block uppercase">Security Compliance Notice</span>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Your updated access tokens and API secrets are securely encrypted with AES-256 before storage and are validated immediately against the broker's endpoints. No connection fees will be charged.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold rounded-xl cursor-pointer transition-all"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={updateSubmitting}
                  className="flex-1 py-3 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-black rounded-xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {updateSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      VALIDATING...
                    </>
                  ) : (
                    'UPDATE & VERIFY'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
