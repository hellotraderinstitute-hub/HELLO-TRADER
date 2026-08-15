'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, Calendar, Clock, CheckCircle2, XCircle, Filter, Search, 
  Plus, RefreshCw, Send, AlertTriangle, User, Tag, Sparkles, MessageSquare
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function ReminderManager() {
  const [reminders, setReminders] = useState([]);
  const [summary, setSummary] = useState({ todayPendingCount: 0, completedCount: 0, overdueCount: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // ALL | TODAY | OVERDUE | UPCOMING_7_DAYS
  const [searchQuery, setSearchQuery] = useState('');

  // Add Reminder Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    title: '',
    type: 'CALLBACK',
    scheduledAt: '',
    description: ''
  });

  useEffect(() => {
    fetchReminders();
  }, [statusFilter, typeFilter, timeFilter]);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/crm/reminders', {
        params: {
          status: statusFilter,
          type: typeFilter,
          filter: timeFilter,
          search: searchQuery
        }
      });

      if (res.data?.success) {
        setReminders(res.data.reminders);
        setSummary(res.data.summary);
      }
    } catch (error) {
      console.error('Error fetching CRM reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReminder = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/crm/reminders', addForm);
      if (res.data?.success) {
        setShowAddModal(false);
        setAddForm({ title: '', type: 'CALLBACK', scheduledAt: '', description: '' });
        fetchReminders();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create reminder');
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await apiClient.patch(`/crm/reminders/${id}`, { status: newStatus });
      if (res.data?.success) {
        fetchReminders();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update reminder status');
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'DEMO': return <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">📹 DEMO</span>;
      case 'PAYMENT_FOLLOWUP': return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">💵 PAYMENT</span>;
      case 'CALLBACK': return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">📞 CALLBACK</span>;
      case 'TERMINAL_FOLLOWUP': return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">💻 TERMINAL</span>;
      case 'ALGO_FOLLOWUP': return <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">🤖 ALGO</span>;
      case 'COPY_TRADING_FOLLOWUP': return <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">👥 COPY TRADING</span>;
      default: return <span className="bg-gray-500/20 text-gray-300 border border-gray-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">🔔 GENERAL</span>;
    }
  };

  return (
    <div className="space-y-6 text-white font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161B22] p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              Smart CRM & Telegram Reminders Hub
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-bold">
                Asia/Kolkata (IST)
              </span>
            </h2>
            <p className="text-xs text-gray-400">Natural-language Telegram bot reminders + CRM follow-up schedules with VPS server-side execution.</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-black px-4 py-2 rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-1.5 transform hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> + Create Reminder
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div 
          onClick={() => setTimeFilter('TODAY')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xl ${
            timeFilter === 'TODAY' ? 'bg-amber-500/20 border-amber-500' : 'bg-[#161B22] border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[10px] font-black uppercase text-amber-400">Today&apos;s Due Reminders</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">{summary.todayPendingCount}</div>
        </div>

        <div 
          onClick={() => setTimeFilter('OVERDUE')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xl ${
            timeFilter === 'OVERDUE' ? 'bg-red-500/20 border-red-500' : 'bg-[#161B22] border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[10px] font-black uppercase text-red-400">Overdue Reminders</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-300">{summary.overdueCount}</div>
        </div>

        <div 
          onClick={() => setStatusFilter('COMPLETED')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xl ${
            statusFilter === 'COMPLETED' ? 'bg-emerald-500/20 border-emerald-500' : 'bg-[#161B22] border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[10px] font-black uppercase text-emerald-400">Completed Follow-ups</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300">{summary.completedCount}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-[#161B22] p-4 rounded-2xl border border-white/10 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-[#0B0E14] p-1 rounded-xl border border-white/5 text-xs">
            {['ALL', 'TODAY', 'OVERDUE', 'UPCOMING_7_DAYS'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  timeFilter === tf ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[#0B0E14] px-3 py-1.5 rounded-xl border border-white/10 text-xs w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search reminders..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchReminders()}
              className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Reminders List */}
      {loading ? (
        <div className="bg-[#161B22] p-12 rounded-2xl border border-white/10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-xs text-gray-400 font-bold">Loading CRM Reminders...</p>
        </div>
      ) : reminders.length === 0 ? (
        <div className="bg-[#161B22] p-12 rounded-2xl border border-white/10 text-center space-y-2">
          <Bell className="w-8 h-8 text-gray-500 mx-auto" />
          <h3 className="text-sm font-bold text-gray-300">No Reminders Found</h3>
          <p className="text-xs text-gray-500">Send a natural-language message to your Telegram bot (e.g., &quot;Kal raat 8 baje Rahul ka demo hai&quot;) or click Create Reminder above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.map(rem => {
            const timeStr = new Date(rem.scheduledAt).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              day: '2-digit',
              month: 'short'
            });

            return (
              <div key={rem.id} className="bg-[#161B22] border border-white/10 hover:border-amber-500/40 rounded-2xl p-4 space-y-3 shadow-xl relative overflow-hidden group">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors">
                        {rem.title}
                      </h4>
                      {getTypeBadge(rem.type)}
                    </div>
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 inline-block">
                      {rem.reminderNumber} • Source: {rem.source}
                    </span>
                  </div>

                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    rem.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                    rem.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {rem.status}
                  </span>
                </div>

                <div className="text-xs text-gray-300 bg-[#0B0E14] p-3 rounded-xl border border-white/5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" /> Scheduled (IST):
                    </span>
                    <span className="font-black text-amber-300">{timeStr}</span>
                  </div>
                  {rem.lead?.name && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400">Client/Lead:</span>
                      <strong className="text-white">{rem.lead.name} ({rem.lead.phone})</strong>
                    </div>
                  )}
                  {rem.description && (
                    <div className="text-[11px] text-gray-400 border-t border-white/5 pt-1 mt-1 italic">
                      &quot;{rem.description}&quot;
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 text-xs">
                  {rem.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(rem.id, 'COMPLETED')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px]"
                      >
                        ✓ Mark Complete
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(rem.id, 'CANCELLED')}
                        className="px-3 py-1 bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white font-bold rounded-lg text-[10px]"
                      >
                        ✕ Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Reminder */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" /> Create Manual CRM Reminder
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateReminder} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Reminder Title / Client Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Call Rahul for payment follow-up"
                  value={addForm.title}
                  onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Category / Type</label>
                  <select
                    value={addForm.type}
                    onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                  >
                    <option value="CALLBACK">CALLBACK</option>
                    <option value="DEMO">DEMO</option>
                    <option value="PAYMENT_FOLLOWUP">PAYMENT FOLLOW-UP</option>
                    <option value="ADMISSION_FOLLOWUP">ADMISSION FOLLOW-UP</option>
                    <option value="TERMINAL_FOLLOWUP">TERMINAL FOLLOW-UP</option>
                    <option value="ALGO_FOLLOWUP">ALGO FOLLOW-UP</option>
                    <option value="COPY_TRADING_FOLLOWUP">COPY TRADING FOLLOW-UP</option>
                    <option value="GENERAL">GENERAL</option>
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Scheduled Time (IST) *</label>
                  <input
                    type="datetime-local"
                    required
                    value={addForm.scheduledAt}
                    onChange={e => setAddForm({ ...addForm, scheduledAt: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none font-bold text-amber-300"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Notes / Description</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes for follow-up..."
                  value={addForm.description}
                  onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2 rounded-xl">Save Reminder</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
