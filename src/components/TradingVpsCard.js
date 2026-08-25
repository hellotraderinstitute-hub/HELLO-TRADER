'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Server, Shield, RefreshCw, Copy, Check, Power, AlertTriangle,
  CheckCircle2, CreditCard, Clock, Calendar, ArrowRight, Zap
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function TradingVpsCard({ onWhitelistedIpChange }) {
  const [vpsData, setVpsData] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('STARTER_1VCPU_2GB');
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchVpsDetails = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/algo/vps/details');
      if (res.data?.success) {
        setVpsData(res.data.vps);
        setWalletBalance(res.data.walletTokenBalance || 0);
        if (res.data.vps?.publicIp && onWhitelistedIpChange) {
          onWhitelistedIpChange(res.data.vps.publicIp);
        }
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [onWhitelistedIpChange]);

  useEffect(() => {
    fetchVpsDetails();
  }, [fetchVpsDetails]);

  const handleCopyIp = () => {
    if (!vpsData?.publicIp) return;
    navigator.clipboard.writeText(vpsData.publicIp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePurchase = async () => {
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await apiClient.post('/algo/vps/purchase', {
        planTier: selectedPlan,
        autoRenew: true,
      });
      if (res.data?.success) {
        setMsg({ type: 'success', text: `Trading VPS provisioned with Dedicated Static IP: ${res.data.vps.publicIp}` });
        await fetchVpsDetails();
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!vpsData) return;
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await apiClient.post('/algo/vps/toggle-autorenew', {
        enabled: !vpsData.autoRenewEnabled,
      });
      if (res.data?.success) {
        setMsg({ type: 'success', text: `Auto-renew ${res.data.autoRenewEnabled ? 'ENABLED' : 'DISABLED'}.` });
        await fetchVpsDetails();
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualRenew = async () => {
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await apiClient.post('/algo/vps/renew-manual');
      if (res.data?.success) {
        setMsg({ type: 'success', text: `Subscription renewed! Static IP ${res.data.publicIp} preserved.` });
        await fetchVpsDetails();
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryGrace = async () => {
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await apiClient.post('/algo/vps/retry-grace');
      if (res.data?.success) {
        setMsg({ type: 'success', text: `Grace recovery successful! Static IP ${res.data.publicIp} restored.` });
        await fetchVpsDetails();
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel auto-renewal? Access will remain active until the end of your billing cycle.')) return;
    setActionLoading(true);
    setMsg(null);
    try {
      const res = await apiClient.post('/algo/vps/cancel');
      if (res.data?.success) {
        setMsg({ type: 'success', text: res.data.message });
        await fetchVpsDetails();
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 flex items-center justify-center gap-3 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        <span>Loading Dedicated Trading VPS status...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-emerald-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-wide">Dedicated Trading VPS & Static IP</h3>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-950/80 border border-blue-800 text-blue-300">
                Managed by Hello Trader
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              1-Click provisioning with permanent dedicated Static IPv4 for Dhan & Angel One whitelisting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-gray-400 font-medium">Wallet Balance</div>
            <div className="text-sm font-bold text-emerald-400">₹{walletBalance.toFixed(2)}</div>
          </div>
          <button
            onClick={fetchVpsDetails}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Refresh VPS Status"
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 border ${
          msg.type === 'success'
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
            : 'bg-rose-950/40 border-rose-800 text-rose-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Case 1: Active VPS Provisioned */}
      {vpsData && vpsData.status !== 'TERMINATED' ? (
        <div className="space-y-5">
          {/* Main Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status & IP */}
            <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-2">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dedicated Static IP</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-base font-bold text-emerald-400">{vpsData.publicIp}</span>
                <button
                  onClick={handleCopyIp}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span className={`w-2 h-2 rounded-full ${
                  vpsData.status === 'ACTIVE_SIMULATION' ? 'bg-emerald-400 animate-pulse' :
                  vpsData.status === 'GRACE_PERIOD' ? 'bg-amber-400' : 'bg-gray-500'
                }`} />
                <span>Status: <strong className="text-gray-200">{vpsData.status}</strong></span>
              </div>
            </div>

            {/* Hardware & Region */}
            <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-1.5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Server Specifications</div>
              <div className="text-sm font-bold text-white">{vpsData.planTier.replace(/_/g, ' ')}</div>
              <div className="text-xs text-gray-400">Region: <strong className="text-gray-200">Bangalore ({vpsData.region})</strong></div>
              <div className="text-[11px] text-emerald-400/90 font-medium">Low-Latency NSE Routing</div>
            </div>

            {/* Subscription & Auto-Renew */}
            <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Subscription</span>
                <span className="text-xs font-bold text-white">₹{vpsData.monthlyAmount}/mo</span>
              </div>
              <div className="text-xs text-gray-300">
                Renews: <strong>{new Date(vpsData.currentPeriodEnd).toLocaleDateString('en-IN')}</strong>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-400">Auto-Renew</span>
                <button
                  onClick={handleToggleAutoRenew}
                  disabled={actionLoading}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    vpsData.autoRenewEnabled
                      ? 'bg-emerald-950 border border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                      : 'bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {vpsData.autoRenewEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>
          </div>

          {/* Grace Period Warning */}
          {vpsData.status === 'GRACE_PERIOD' && (
            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="text-xs">
                  <strong className="text-sm block text-amber-300">Grace Period Active</strong>
                  Trading execution paused. Static IP <strong>{vpsData.publicIp}</strong> is retained until{' '}
                  {vpsData.gracePeriodEndsAt ? new Date(vpsData.gracePeriodEndsAt).toLocaleDateString('en-IN') : '7 days'}.
                </div>
              </div>
              <button
                onClick={handleRetryGrace}
                disabled={actionLoading || walletBalance < vpsData.monthlyAmount}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
              >
                Top-up & Resume Now (₹{vpsData.monthlyAmount})
              </button>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-gray-400">
              Zero VPS website management required. Static IP remains identical across all renewals.
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleManualRenew}
                disabled={actionLoading || walletBalance < vpsData.monthlyAmount}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Renew 30 Days (₹{vpsData.monthlyAmount})</span>
              </button>

              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="px-3 py-2 bg-gray-800 hover:bg-rose-950/60 hover:border-rose-800 border border-gray-700 text-gray-400 hover:text-rose-300 text-xs rounded-xl transition-all"
              >
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Case 2: No VPS Provisioned — Purchase Wizard */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Starter Plan */}
            <div
              onClick={() => setSelectedPlan('STARTER_1VCPU_2GB')}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                selectedPlan === 'STARTER_1VCPU_2GB'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/30'
                  : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">Trading VPS Starter</span>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700">
                  Recommended
                </span>
              </div>
              <div className="text-2xl font-extrabold text-white mb-3">₹799 <span className="text-xs text-gray-400 font-normal">/ month</span></div>
              <ul className="text-xs text-gray-300 space-y-2">
                <li className="flex items-center gap-2">✓ <strong>Dedicated Static IPv4</strong> (Permanent)</li>
                <li className="flex items-center gap-2">✓ 1 vCPU / 2GB RAM / 25GB NVMe SSD</li>
                <li className="flex items-center gap-2">✓ Pre-installed Hello Trader Agent Daemon</li>
                <li className="flex items-center gap-2">✓ Bangalore Datacenter (Low NSE Latency)</li>
              </ul>
            </div>

            {/* Pro Plan */}
            <div
              onClick={() => setSelectedPlan('PRO_2VCPU_4GB')}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                selectedPlan === 'PRO_2VCPU_4GB'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/30'
                  : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">Trading VPS Pro</span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-800 text-gray-300">
                  High Frequency
                </span>
              </div>
              <div className="text-2xl font-extrabold text-white mb-3">₹1,299 <span className="text-xs text-gray-400 font-normal">/ month</span></div>
              <ul className="text-xs text-gray-300 space-y-2">
                <li className="flex items-center gap-2">✓ <strong>Dedicated Static IPv4</strong> (Permanent)</li>
                <li className="flex items-center gap-2">✓ 2 vCPU / 4GB RAM / 50GB NVMe SSD</li>
                <li className="flex items-center gap-2">✓ Multi-strategy option scalping</li>
                <li className="flex items-center gap-2">✓ Priority Tunnel Bandwidth</li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-gray-300">
                Payment debited directly from your Hello Trader Token Wallet.
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Current Wallet Balance: <strong className="text-emerald-400">₹{walletBalance.toFixed(2)}</strong>
                {walletBalance < (selectedPlan === 'STARTER_1VCPU_2GB' ? 799 : 1299) && (
                  <span className="text-amber-400 ml-2">(Top-up required)</span>
                )}
              </div>
            </div>

            <button
              onClick={handlePurchase}
              disabled={actionLoading || walletBalance < (selectedPlan === 'STARTER_1VCPU_2GB' ? 799 : 1299)}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all"
            >
              <Zap className="w-4 h-4" />
              <span>{actionLoading ? 'Provisioning VPS...' : 'Purchase & Launch Trading VPS'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
