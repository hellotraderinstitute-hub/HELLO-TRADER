'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, Copy, CheckCircle, RefreshCw, LogOut, Lock, 
  TrendingUp, Calendar, DollarSign, ShieldCheck, Sparkles, AlertCircle, ArrowUpRight
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function PartnerDashboard() {
  const [partner, setPartner] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [monthWiseReport, setMonthWiseReport] = useState([]);
  const [referredClients, setReferredClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginMobile, setLoginMobile] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Active view tab
  const [activeTab, setActiveTab] = useState('MONTHS'); // MONTHS | CLIENTS | SETTINGS

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/partner/dashboard');
      if (res.data?.success) {
        setPartner(res.data.partner);
        setMetrics(res.data.metrics);
        setMonthWiseReport(res.data.monthWiseReport || []);
        setReferredClients(res.data.referredClients || []);
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setPartner(null);
      } else {
        setError(err.response?.data?.error || 'Failed to load partner dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginIdentifier || !loginPassword) return;

    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await apiClient.post('/auth/login', {
        emailOrPhone: loginIdentifier.trim(),
        phone: loginMobile.trim(),
        password: loginPassword
      });

      if (res.data?.success) {
        fetchDashboardData();
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Invalid credentials or partner account inactive.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New password and confirm password do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }

    setPwdLoading(true);
    setPwdError('');
    setPwdSuccess('');

    try {
      const res = await apiClient.post('/partner/change-password', {
        currentPassword,
        newPassword,
        confirmPassword
      });

      if (res.data?.success) {
        setPwdSuccess('Password changed successfully! Please keep your credentials secure.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setPwdError(err.response?.data?.error || 'Failed to change password. Please check your current password.');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/partner/logout');
    } catch (_) {}
    setPartner(null);
    setMetrics(null);
    setLoginIdentifier('');
    setLoginMobile('');
    setLoginPassword('');
  };

  const referralLink = useMemo(() => {
    if (!partner?.referralCode) return '';
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/?ref=${partner.referralCode}`;
    }
    return `https://hellotrader.in/?ref=${partner.referralCode}`;
  }, [partner]);

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    alert('Referral link copied to clipboard: ' + referralLink);
  };

  // ── Render Login Screen If Not Authenticated ────────────────────────────────
  if (!loading && !partner) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center p-4 font-mono select-none">
        <div className="bg-[#10131A] border border-cyan-500/30 rounded-2xl p-8 max-w-md w-full shadow-[0_0_60px_rgba(0,212,255,0.15)] space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center mx-auto text-cyan-400 shadow-[0_0_20px_rgba(0,212,255,0.2)]">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-base font-extrabold tracking-wider text-white uppercase">HELLO TRADER PARTNER PORTAL</h1>
            <p className="text-[11px] text-gray-400">Institutional Partner Business Dashboard & Earnings Ledger</p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-400 font-bold mb-1">PARTNER ID (PHT...)</label>
              <input
                type="text"
                value={loginIdentifier}
                onChange={e => setLoginIdentifier(e.target.value)}
                placeholder="e.g. PHT0036"
                className="w-full bg-[#07090E] border border-white/10 px-3 py-2.5 rounded-lg text-white focus:outline-none focus:border-cyan-400 uppercase font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-cyan-400 font-bold mb-1">REGISTERED MOBILE NUMBER *</label>
              <input
                type="tel"
                value={loginMobile}
                onChange={e => setLoginMobile(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full bg-[#07090E] border border-cyan-500/40 px-3 py-2.5 rounded-lg text-white focus:outline-none focus:border-cyan-400 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1">PASSWORD</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#07090E] border border-white/10 px-3 py-2.5 rounded-lg text-white focus:outline-none focus:border-cyan-400 font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(0,212,255,0.3)]"
            >
              {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {loginLoading ? 'AUTHENTICATING...' : 'AUTHENTICATE PARTNER'}
            </button>
          </form>

          <div className="pt-4 border-t border-white/5 text-center text-[10px] text-gray-500">
            Protected by Hello Trader Enterprise Access Controls &bull; ₹200 Fixed Benefit Rule Enforced
          </div>
        </div>
      </div>
    );
  }

  // ── Render Loading State ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center font-mono text-xs">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400">Loading live partner business figures...</p>
        </div>
      </div>
    );
  }

  // ── Render Authenticated Partner Dashboard ─────────────────────────────────
  return (
    <div className="min-h-screen bg-[#07090E] text-white font-mono text-xs p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Bar */}
      <div className="bg-[#10131A] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-white tracking-wider uppercase">{partner.name}</h1>
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-black">
              ID: {partner.partnerId}
            </span>
            <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30 text-[10px] font-black">
              {partner.status}
            </span>
          </div>
          <p className="text-[11px] text-gray-400">
            Partner Referral Code: <strong className="text-purple-400">{partner.referralCode}</strong> &bull; Registered {new Date(partner.createdAt).toLocaleDateString('en-IN')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="p-2 bg-[#07090E] hover:bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh Figures"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-bold transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> LOGOUT
          </button>
        </div>
      </div>

      {/* Referral Link Showcase Box */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-[#10131A] to-purple-950/30 border border-cyan-500/30 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-cyan-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" /> YOUR UNIQUE PARTNER REFERRAL LINK
          </span>
          <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/30 font-bold">
            ₹200 Fixed Benefit / Qualifying Client Subscription
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 bg-[#07090E] border border-white/15 px-3.5 py-2.5 rounded-xl text-white text-xs font-mono select-all focus:outline-none"
          />
          <button
            onClick={copyReferralLink}
            className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,212,255,0.3)] cursor-pointer shrink-0"
          >
            <Copy className="w-4 h-4" /> COPY LINK
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Total Referrals */}
          <div className="bg-[#10131A] p-4 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">TOTAL REFERRALS (SIGNUPS)</span>
            <span className="text-2xl font-black text-white">{metrics.totalReferrals}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Attributed Client Registrations</span>
          </div>

          {/* Card 2: Successful Subscriptions */}
          <div className="bg-[#10131A] p-4 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">QUALIFYING SUBSCRIPTIONS</span>
            <span className="text-2xl font-black text-purple-400">{metrics.successfulSubscriptions}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">{metrics.pendingReferrals} Pending Subscription</span>
          </div>

          {/* Card 3: Total Benefit Earned */}
          <div className="bg-[#10131A] p-4 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">TOTAL BENEFIT EARNED</span>
            <span className="text-2xl font-black text-amber-400">₹{metrics.totalBenefit.toLocaleString()}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Calculated at ₹200 / Subscription</span>
          </div>

          {/* Card 4: Unpaid Pending Benefit */}
          <div className="bg-[#10131A] p-4 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">UNPAID PENDING BENEFIT</span>
            <span className="text-2xl font-black text-orange-400">₹{metrics.pendingBenefit.toLocaleString()}</span>
            <span className="text-[9px] text-green-400 block pt-0.5">₹{metrics.paidBenefit.toLocaleString()} Settled & Paid</span>
          </div>

          {/* Card 5: This Month */}
          <div className="bg-[#10131A] p-4 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">THIS MONTH BENEFIT</span>
            <span className="text-xl font-black text-cyan-400">₹{metrics.thisMonthBenefit.toLocaleString()}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">{metrics.thisMonthSubscriptions} Subscriptions</span>
          </div>

          {/* Card 6: Last Month */}
          <div className="bg-[#10131A] p-4 rounded-2xl border border-white/10 space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">LAST MONTH BENEFIT</span>
            <span className="text-xl font-black text-gray-300">₹{metrics.lastMonthBenefit.toLocaleString()}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">{metrics.lastMonthSubscriptions} Subscriptions</span>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="bg-[#10131A] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex gap-2 border-b border-white/10 pb-3 font-bold text-xs">
          <button
            onClick={() => setActiveTab('MONTHS')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${activeTab === 'MONTHS' ? 'bg-cyan-500 text-black shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            📅 Month-Wise Business Report
          </button>

          <button
            onClick={() => setActiveTab('CLIENTS')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${activeTab === 'CLIENTS' ? 'bg-cyan-500 text-black shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            👥 Referred Client Associations ({referredClients.length})
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${activeTab === 'SETTINGS' ? 'bg-cyan-500 text-black shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            ⚙️ Security & Password Settings
          </button>
        </div>

        {/* Tab 1: Month-Wise Report */}
        {activeTab === 'MONTHS' && (
          <div className="space-y-3">
            {monthWiseReport.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs">No month-wise business recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#07090E] text-gray-400 text-[10px] uppercase font-bold border-b border-white/10">
                      <th className="py-3 px-4">Month</th>
                      <th className="py-3 px-4 text-center">Referrals (Signups)</th>
                      <th className="py-3 px-4 text-center">Successful Subscriptions</th>
                      <th className="py-3 px-4 text-center">Benefit Rate</th>
                      <th className="py-3 px-4 text-right">Total Benefit Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {monthWiseReport.map((m, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-bold text-white">{m.month}</td>
                        <td className="py-3 px-4 text-center">{m.referrals}</td>
                        <td className="py-3 px-4 text-center font-bold text-purple-400">{m.successfulSubscriptions}</td>
                        <td className="py-3 px-4 text-center text-gray-400">₹200</td>
                        <td className="py-3 px-4 text-right font-bold text-amber-400">₹{m.benefit.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Referred Clients (Strict Privacy Filtered: Client ID / Student ID Only) */}
        {activeTab === 'CLIENTS' && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-[11px] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                <strong>Privacy Policy Compliance:</strong> Client ID (Student ID) is provided for verification. Client private contact details and payment credentials are intentionally suppressed.
              </span>
            </div>

            {referredClients.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs">No client registrations attributed to your link yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#07090E] text-gray-400 text-[10px] uppercase font-bold border-b border-white/10">
                      <th className="py-3 px-4">Client ID</th>
                      <th className="py-3 px-4">Signup Date</th>
                      <th className="py-3 px-4">Subscription Date</th>
                      <th className="py-3 px-4 text-center">Subscription Status</th>
                      <th className="py-3 px-4 text-right">Fixed Benefit</th>
                      <th className="py-3 px-4 text-center">Benefit Status</th>
                      <th className="py-3 px-4 text-center">Payout Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {referredClients.map(c => (
                      <tr key={c.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-bold text-cyan-400">{c.clientId}</td>
                        <td className="py-3 px-4 text-gray-400 text-[11px]">{new Date(c.signupDate).toLocaleDateString('en-IN')}</td>
                        <td className="py-3 px-4 text-gray-400 text-[11px]">{c.subscriptionDate ? new Date(c.subscriptionDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${c.subscriptionStatus === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400'}`}>
                            {c.subscriptionStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-400">
                          {c.benefitAmount > 0 ? `₹${c.benefitAmount}` : '₹0'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${c.benefitStatus === 'PAID' ? 'bg-green-500/10 text-green-400' : (c.benefitStatus === 'EARNED' ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-800 text-gray-400')}`}>
                            {c.benefitStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${c.payoutStatus === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                            {c.payoutStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Security & Password Settings */}
        {activeTab === 'SETTINGS' && (
          <div className="max-w-lg mx-auto bg-[#07090E] p-6 rounded-2xl border border-white/10 space-y-5">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Lock className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="font-bold text-sm text-white">Change Partner Account Password</h3>
                <p className="text-[10px] text-gray-400">Passwords are cryptographically secured with bcrypt encryption.</p>
              </div>
            </div>

            {pwdSuccess && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{pwdSuccess}</span>
              </div>
            )}

            {pwdError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pwdError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-gray-400 font-bold mb-1">CURRENT PASSWORD</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#10131A] border border-white/10 px-3 py-2.5 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">NEW PASSWORD (MIN 6 CHARACTERS)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#10131A] border border-white/10 px-3 py-2.5 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">CONFIRM NEW PASSWORD</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#10131A] border border-white/10 px-3 py-2.5 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={pwdLoading}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,212,255,0.3)]"
              >
                {pwdLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {pwdLoading ? 'UPDATING PASSWORD...' : 'UPDATE PASSWORD'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
