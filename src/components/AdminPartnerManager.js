'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, UserCheck, UserX, AlertTriangle, ShieldCheck, Plus, 
  Copy, RefreshCw, CheckCircle, Search, Filter, Calendar, 
  DollarSign, ArrowUpRight, Check, X, Eye, FileText, Lock, Unlock, ExternalLink
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function AdminPartnerManager() {
  const [partners, setPartners] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | INACTIVE | SUSPENDED
  const [searchQuery, setSearchQuery] = useState('');

  // Add Partner Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', password: '', referralCode: '' });
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [createdPartnerInfo, setCreatedPartnerInfo] = useState(null);

  // Business Dossier Modal
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [dossierTab, setDossierTab] = useState('MONTHS'); // MONTHS | CLIENTS | PAYOUTS | AUDIT

  // Payout Modal
  const [payoutRefInput, setPayoutRefInput] = useState('');
  const [markingPayout, setMarkingPayout] = useState(false);

  // Audit Logs Modal / View
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/partners');
      if (res.data?.success) {
        setPartners(res.data.partners || []);
        setTotals(res.data.totals || null);
      }
    } catch (err) {
      console.error('Failed to fetch partners:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const fetchDossier = async (partnerId) => {
    setSelectedPartnerId(partnerId);
    setLoadingDossier(true);
    try {
      const res = await apiClient.get(`/admin/partners/${partnerId}/business`);
      if (res.data?.success) {
        setDossier(res.data);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load partner business dossier.');
    } finally {
      setLoadingDossier(false);
    }
  };

  const handleCreatePartner = async (e) => {
    e.preventDefault();
    setSubmittingAdd(true);
    try {
      const res = await apiClient.post('/admin/partners', addForm);
      if (res.data?.success) {
        setCreatedPartnerInfo({
          partnerId: res.data.partner.partnerId,
          name: res.data.partner.name,
          email: res.data.partner.email,
          referralCode: res.data.partner.referralCode,
          tempPassword: res.data.tempPassword
        });
        setAddForm({ name: '', email: '', phone: '', password: '', referralCode: '' });
        fetchPartners();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create partner.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleUpdateStatus = async (partnerId, newStatus, currentName) => {
    const actionLabel = newStatus === 'ACTIVE' ? 'activate' : (newStatus === 'SUSPENDED' ? 'suspend' : 'deactivate');
    if (!confirm(`Are you sure you want to ${actionLabel} Partner '${currentName}'?`)) return;

    try {
      const res = await apiClient.patch(`/admin/partners/${partnerId}/status`, { status: newStatus });
      if (res.data?.success) {
        alert(`Partner ${actionLabel}d successfully!`);
        fetchPartners();
        if (selectedPartnerId === partnerId) {
          fetchDossier(partnerId);
        }
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update partner status.');
    }
  };

  const handleMarkPayout = async (partnerId) => {
    if (!payoutRefInput.trim()) {
      alert('Please enter a bank transaction reference / UTR number.');
      return;
    }
    setMarkingPayout(true);
    try {
      const res = await apiClient.post('/admin/partners/benefits/mark-paid', {
        partnerId,
        payoutReference: payoutRefInput.trim()
      });
      if (res.data?.success) {
        alert(`Success! ${res.data.updatedCount} benefit records marked as PAID.`);
        setPayoutRefInput('');
        fetchDossier(partnerId);
        fetchPartners();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to process payout update.');
    } finally {
      setMarkingPayout(false);
    }
  };

  const handleInspectPartnerPortal = async (partnerId) => {
    try {
      const res = await apiClient.post(`/admin/partners/${partnerId}/support-session`);
      if (res.data?.success) {
        window.open('/partner', '_blank');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to initiate secure partner verification session.');
    }
  };

  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        p.name.toLowerCase().includes(q) || 
        p.partnerId.toLowerCase().includes(q) || 
        p.email.toLowerCase().includes(q) || 
        p.phone.includes(q) || 
        p.referralCode.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [partners, statusFilter, searchQuery]);

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard: ' + text);
  };

  return (
    <div className="space-y-5 font-mono text-xs text-white">
      {/* Top Header & KPI Summary Cards */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161B22] p-4 rounded-xl border border-white/10 shadow-xl">
        <div>
          <h2 className="text-sm font-black flex items-center gap-2 text-white uppercase tracking-wider">
            <Users className="w-5 h-5 text-cyan-400" />
            PARTNER BUSINESS MANAGEMENT HUB
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
              ₹200 FIXED BENEFIT ENGINE
            </span>
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Admin-controlled partner onboarding, unique PHT ID sequencing, month-wise client mapping & benefit payout ledgers.
          </p>
        </div>

        <button
          onClick={() => { setShowAddModal(true); setCreatedPartnerInfo(null); }}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(0,212,255,0.3)] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> ADD NEW PARTNER
        </button>
      </div>

      {/* Aggregate Statistics Overview */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#161B22] p-3 rounded-xl border border-white/10">
            <span className="text-[9px] text-gray-400 font-bold block uppercase">TOTAL PARTNERS</span>
            <span className="text-lg font-black text-white">{totals.totalPartners}</span>
            <span className="text-[9px] text-green-400 block pt-0.5">{totals.activePartners} Active</span>
          </div>

          <div className="bg-[#161B22] p-3 rounded-xl border border-white/10">
            <span className="text-[9px] text-gray-400 font-bold block uppercase">TOTAL CLIENT SUBSCRIPTIONS</span>
            <span className="text-lg font-black text-purple-400">{totals.totalSubscriptions}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Qualifying Recharges</span>
          </div>

          <div className="bg-[#161B22] p-3 rounded-xl border border-white/10">
            <span className="text-[9px] text-gray-400 font-bold block uppercase">BENEFIT RATE</span>
            <span className="text-lg font-black text-cyan-400">₹200</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Fixed / Subscription</span>
          </div>

          <div className="bg-[#161B22] p-3 rounded-xl border border-white/10">
            <span className="text-[9px] text-gray-400 font-bold block uppercase">TOTAL BENEFIT EARNED</span>
            <span className="text-lg font-black text-amber-400">₹{totals.totalBenefitEarned.toLocaleString()}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Cumulative Earned</span>
          </div>

          <div className="bg-[#161B22] p-3 rounded-xl border border-white/10">
            <span className="text-[9px] text-gray-400 font-bold block uppercase">BENEFIT PAID OUT</span>
            <span className="text-lg font-black text-green-400">₹{totals.totalBenefitPaid.toLocaleString()}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Settled via Admin</span>
          </div>

          <div className="bg-[#161B22] p-3 rounded-xl border border-white/10">
            <span className="text-[9px] text-gray-400 font-bold block uppercase">PENDING PAYOUT</span>
            <span className="text-lg font-black text-orange-400">₹{totals.totalBenefitPending.toLocaleString()}</span>
            <span className="text-[9px] text-gray-500 block pt-0.5">Awaiting Payout</span>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161B22] p-3 rounded-xl border border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-cyan-400" /> STATUS:
          </span>
          {['ALL', 'ACTIVE', 'INACTIVE', 'SUSPENDED'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-[10px] font-extrabold transition-all cursor-pointer ${statusFilter === st ? 'bg-cyan-500 text-black shadow-sm' : 'bg-[#0B0E14] text-gray-400 hover:text-white border border-white/5'}`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Partner ID, Name, Mobile, Code..."
              className="bg-[#0B0E14] border border-white/10 pl-8 pr-3 py-1.5 rounded-lg text-white text-xs w-64 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            onClick={fetchPartners}
            className="p-1.5 bg-[#0B0E14] hover:bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh Partners"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Partners List Table */}
      <div className="bg-[#161B22] rounded-xl border border-white/10 overflow-hidden shadow-xl">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-xs">Loading partner directory...</div>
        ) : filteredPartners.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-xs">
            No partners found matching the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0B0E14] text-gray-400 text-[10px] uppercase font-bold border-b border-white/10">
                  <th className="py-3 px-3">Partner ID</th>
                  <th className="py-3 px-3">Partner Profile</th>
                  <th className="py-3 px-3">Referral Code & Link</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Referrals</th>
                  <th className="py-3 px-3 text-center">Subscriptions</th>
                  <th className="py-3 px-3 text-center">Total Benefit</th>
                  <th className="py-3 px-3 text-center">Pending / Paid</th>
                  <th className="py-3 px-3 text-center">Actions & Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredPartners.map(p => {
                  const refUrl = typeof window !== 'undefined' ? `${window.location.origin}/?ref=${p.referralCode}` : `https://hellotrader.in/?ref=${p.referralCode}`;
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-extrabold text-cyan-400 block">{p.partnerId}</span>
                        <span className="text-[9px] text-gray-500">Joined {new Date(p.createdAt).toLocaleDateString()}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{p.name}</span>
                        <span className="text-[10px] text-gray-400 block">{p.email}</span>
                        <span className="text-[9px] text-gray-500 font-bold">{p.phone}</span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-0.5 bg-[#0B0E14] border border-cyan-500/30 rounded text-cyan-300 font-bold text-[10px]">
                            {p.referralCode}
                          </span>
                          <button
                            onClick={() => copyText(refUrl)}
                            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-cyan-400"
                            title="Copy Full Referral Link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[9px] text-gray-500 truncate max-w-[140px] block pt-0.5">{refUrl}</span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${p.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/30' : (p.status === 'SUSPENDED' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30')}`}>
                          {p.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-white">
                        {p.totalReferrals}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className="font-extrabold text-purple-400">{p.successfulSubscriptions}</span>
                        <span className="text-[9px] text-gray-500 block">({p.pendingReferrals} Pending)</span>
                      </td>

                      <td className="py-3 px-3 text-center font-extrabold text-amber-400">
                        ₹{p.totalBenefit.toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className="text-orange-400 font-bold block text-[11px]">₹{p.pendingBenefit.toLocaleString()} Pending</span>
                        <span className="text-green-400 text-[9px] block">₹{p.paidBenefit.toLocaleString()} Paid</span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => fetchDossier(p.id)}
                            className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black font-bold rounded text-[10px] border border-cyan-500/40 transition-colors"
                          >
                            📊 Dossier
                          </button>

                          <button
                            onClick={() => handleInspectPartnerPortal(p.id)}
                            className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500 text-purple-300 hover:text-white font-bold rounded text-[10px] border border-purple-500/40 transition-colors"
                            title="Open verified partner session without plaintext password"
                          >
                            🔍 Inspect
                          </button>

                          {p.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleUpdateStatus(p.id, 'INACTIVE', p.name)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-bold rounded text-[10px] border border-red-500/30"
                              title="Deactivate Partner"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateStatus(p.id, 'ACTIVE', p.name)}
                              className="px-2 py-1 bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-black font-bold rounded text-[10px] border border-green-500/30"
                              title="Reactivate Partner"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add New Partner Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-cyan-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-[0_0_50px_rgba(0,212,255,0.15)] relative">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-cyan-400 flex items-center gap-2 uppercase">
                <Plus className="w-4 h-4" /> Add New Partner (PHT Sequence)
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdPartnerInfo ? (
              <div className="bg-[#0B0E14] p-4 rounded-xl border border-green-500/40 space-y-3">
                <div className="flex items-center gap-2 text-green-400 font-bold text-xs">
                  <CheckCircle className="w-5 h-5" /> Partner Created Successfully!
                </div>
                <div className="space-y-1.5 text-xs font-mono text-gray-300">
                  <div>Partner ID: <strong className="text-cyan-400">{createdPartnerInfo.partnerId}</strong></div>
                  <div>Name: <strong className="text-white">{createdPartnerInfo.name}</strong></div>
                  <div>Gmail ID: <strong className="text-white">{createdPartnerInfo.email}</strong></div>
                  <div>Referral Code: <strong className="text-purple-400">{createdPartnerInfo.referralCode}</strong></div>
                  <div>Temporary Password: <strong className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">{createdPartnerInfo.tempPassword}</strong></div>
                </div>
                <p className="text-[10px] text-gray-400 pt-2 border-t border-white/5">
                  Share the Partner ID and temporary password with the partner for portal access.
                </p>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-full py-2 bg-green-500 hover:bg-green-600 text-black font-extrabold rounded-lg text-xs"
                >
                  DONE
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreatePartner} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-gray-400 mb-1 font-bold">PARTNER FULL NAME *</label>
                  <input
                    type="text"
                    required
                    value={addForm.name}
                    onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1 font-bold">GMAIL / EMAIL ID *</label>
                  <input
                    type="email"
                    required
                    value={addForm.email}
                    onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="e.g. rahul.sharma@gmail.com"
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1 font-bold">MOBILE NUMBER *</label>
                  <input
                    type="tel"
                    required
                    value={addForm.phone}
                    onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1 font-bold">CUSTOM PASSWORD (OPTIONAL)</label>
                  <input
                    type="text"
                    value={addForm.password}
                    onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder="Leave empty to auto-generate"
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1 font-bold">CUSTOM REFERRAL CODE (OPTIONAL)</label>
                  <input
                    type="text"
                    value={addForm.referralCode}
                    onChange={e => setAddForm({ ...addForm, referralCode: e.target.value })}
                    placeholder="Defaults to Partner ID (e.g. PHT0036)"
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white focus:outline-none focus:border-cyan-400 uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold rounded-lg text-xs transition-colors mt-2"
                >
                  {submittingAdd ? 'CREATING PARTNER...' : 'GENERATE & CREATE PARTNER'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Partner Business Dossier Modal */}
      {selectedPartnerId && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[500] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#161B22] border border-white/15 rounded-2xl p-6 max-w-4xl w-full space-y-4 shadow-2xl relative my-8">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-sm text-cyan-400 flex items-center gap-2 uppercase">
                  📊 Business Dossier: {dossier?.partner?.name || 'Partner'} ({dossier?.partner?.partnerId || 'ID'})
                </h3>
                <p className="text-[10px] text-gray-400">
                  Referral Code: <strong className="text-white">{dossier?.partner?.referralCode}</strong> | Status: <strong className="text-green-400">{dossier?.partner?.status}</strong>
                </p>
              </div>
              <button onClick={() => setSelectedPartnerId(null)} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDossier ? (
              <div className="text-center py-12 text-gray-400">Loading partner business analytics...</div>
            ) : dossier ? (
              <div className="space-y-4">
                {/* Dossier KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase block font-bold">TOTAL REFERRALS</span>
                    <span className="text-base font-black text-white">{dossier.metrics.totalReferrals}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase block font-bold">QUALIFYING SUBSCRIPTIONS</span>
                    <span className="text-base font-black text-purple-400">{dossier.metrics.successfulSubscriptions}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase block font-bold">TOTAL BENEFIT (₹200/SUB)</span>
                    <span className="text-base font-black text-amber-400">₹{dossier.metrics.totalBenefit.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase block font-bold">UNPAID PENDING BENEFIT</span>
                    <span className="text-base font-black text-orange-400">₹{dossier.metrics.pendingBenefit.toLocaleString()}</span>
                  </div>
                </div>

                {/* Sub-Tabs */}
                <div className="flex gap-2 border-b border-white/10 pb-2 text-[11px] font-bold">
                  <button
                    onClick={() => setDossierTab('MONTHS')}
                    className={`px-3 py-1.5 rounded-lg ${dossierTab === 'MONTHS' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    📅 Month-Wise Business Report
                  </button>
                  <button
                    onClick={() => setDossierTab('CLIENTS')}
                    className={`px-3 py-1.5 rounded-lg ${dossierTab === 'CLIENTS' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    👥 Referred Clients (Client ID Only)
                  </button>
                  <button
                    onClick={() => setDossierTab('PAYOUTS')}
                    className={`px-3 py-1.5 rounded-lg ${dossierTab === 'PAYOUTS' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    💳 Payout Settlement
                  </button>
                </div>

                {/* Tab 1: Month-Wise Report */}
                {dossierTab === 'MONTHS' && (
                  <div className="space-y-2">
                    {dossier.monthWiseReport.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-xs">No monthly business recorded yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-[#0B0E14] text-gray-400 text-[10px] uppercase border-b border-white/10 font-bold">
                              <th className="py-2.5 px-3">Month</th>
                              <th className="py-2.5 px-3 text-center">Referrals (Signups)</th>
                              <th className="py-2.5 px-3 text-center">Successful Subscriptions</th>
                              <th className="py-2.5 px-3 text-center">Benefit Rate</th>
                              <th className="py-2.5 px-3 text-right">Benefit Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {dossier.monthWiseReport.map((m, idx) => (
                              <tr key={idx} className="hover:bg-white/5">
                                <td className="py-2.5 px-3 font-bold text-white">{m.month}</td>
                                <td className="py-2.5 px-3 text-center">{m.referrals}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-purple-400">{m.successfulSubscriptions}</td>
                                <td className="py-2.5 px-3 text-center text-gray-400">₹200</td>
                                <td className="py-2.5 px-3 text-right font-bold text-amber-400">₹{m.benefit.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Referred Clients (Client ID Snapshot Only — Strict Privacy) */}
                {dossierTab === 'CLIENTS' && (
                  <div className="space-y-2">
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-[10px] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Client Privacy Guard: Only Client ID (Student ID) is exposed to partners. Private contact & payment info are suppressed.</span>
                    </div>

                    {dossier.referredClients.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-xs">No client attributions yet.</div>
                    ) : (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-[#0B0E14] text-gray-400 text-[10px] uppercase border-b border-white/10 font-bold">
                              <th className="py-2 px-3">Client ID</th>
                              <th className="py-2 px-3">Signup Date</th>
                              <th className="py-2 px-3">Subscription Date</th>
                              <th className="py-2 px-3 text-center">Status</th>
                              <th className="py-2 px-3 text-right">Benefit (₹)</th>
                              <th className="py-2 px-3 text-center">Payout</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {dossier.referredClients.map(c => (
                              <tr key={c.id} className="hover:bg-white/5">
                                <td className="py-2 px-3 font-bold text-cyan-400">{c.clientId}</td>
                                <td className="py-2 px-3 text-gray-400 text-[10px]">{new Date(c.signupDate).toLocaleDateString()}</td>
                                <td className="py-2 px-3 text-gray-400 text-[10px]">{c.subscriptionDate ? new Date(c.subscriptionDate).toLocaleDateString() : '—'}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.subscriptionStatus === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                                    {c.subscriptionStatus}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-amber-400">₹{c.benefitAmount}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.payoutStatus === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
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

                {/* Tab 3: Payout Settlement */}
                {dossierTab === 'PAYOUTS' && (
                  <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-4">
                    <h4 className="font-bold text-xs text-white uppercase flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-green-400" /> Settle Partner Benefits (Mark as Paid)
                    </h4>

                    <div className="flex justify-between items-center text-xs">
                      <span>Total Unsettled Pending Benefit:</span>
                      <span className="text-base font-black text-orange-400">₹{dossier.metrics.pendingBenefit.toLocaleString()}</span>
                    </div>

                    {dossier.metrics.pendingBenefit > 0 ? (
                      <div className="space-y-3 pt-2 border-t border-white/5">
                        <div>
                          <label className="block text-[10px] text-gray-400 font-bold mb-1 uppercase">BANK TRANSACTION UTR / REFERENCE *</label>
                          <input
                            type="text"
                            value={payoutRefInput}
                            onChange={e => setPayoutRefInput(e.target.value)}
                            placeholder="e.g. UTR123456789 / NEFT via HDFC Bank"
                            className="w-full bg-[#161B22] border border-white/10 px-3 py-2 rounded text-white text-xs focus:outline-none focus:border-green-400 font-mono"
                          />
                        </div>

                        <button
                          onClick={() => handleMarkPayout(dossier.partner.id)}
                          disabled={markingPayout}
                          className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-black font-extrabold rounded-lg text-xs transition-colors cursor-pointer"
                        >
                          {markingPayout ? 'SETTLING PAYOUT...' : `SETTLE & MARK ₹${dossier.metrics.pendingBenefit.toLocaleString()} AS PAID`}
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-green-400 font-bold text-xs">
                        ✓ All partner benefits are fully settled and marked as PAID.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
