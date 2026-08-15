'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, Tag, BookOpen, Laptop, Plus, Edit3, CheckCircle2, 
  XCircle, RefreshCw, IndianRupee, Clock, ShieldCheck
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function CrmConfigManager() {
  const [activeTab, setActiveTab] = useState('SOURCES'); // SOURCES | COURSES | PLANS
  const [sources, setSources] = useState([]);
  const [courses, setCourses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Source Form
  const [newSourceForm, setNewSourceForm] = useState({ name: '', channelType: 'DIGITAL' });
  const [showAddSource, setShowAddSource] = useState(false);

  // Course Form
  const [newCourseForm, setNewCourseForm] = useState({ name: '', code: '', fee: '', durationDays: '90', description: '' });
  const [showAddCourse, setShowAddCourse] = useState(false);

  // Plan Form
  const [newPlanForm, setNewPlanForm] = useState({ name: '', price: '', validityDays: '30', maxBrokers: '2', description: '' });
  const [showAddPlan, setShowAddPlan] = useState(false);

  useEffect(() => {
    fetchAllConfig();
  }, []);

  const fetchAllConfig = async () => {
    setLoading(true);
    try {
      const [srcRes, crsRes, plnRes] = await Promise.all([
        apiClient.get('/crm/config/sources?includeInactive=true'),
        apiClient.get('/crm/config/courses'),
        apiClient.get('/crm/config/plans')
      ]);

      if (srcRes.data?.success) setSources(srcRes.data.sources);
      if (crsRes.data?.success) setCourses(crsRes.data.courses);
      if (plnRes.data?.success) setPlans(plnRes.data.plans);
    } catch (error) {
      console.error('Error fetching CRM configurations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Lead Source Handlers
  const handleAddSource = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/crm/config/sources', newSourceForm);
      if (res.data?.success) {
        setShowAddSource(false);
        setNewSourceForm({ name: '', channelType: 'DIGITAL' });
        fetchAllConfig();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add source');
    }
  };

  const handleToggleSourceActive = async (id, currentActive) => {
    try {
      await apiClient.patch(`/crm/config/sources/${id}`, { isActive: !currentActive });
      fetchAllConfig();
    } catch (error) {
      alert('Failed to update source status');
    }
  };

  // Course Handlers
  const handleAddCourse = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/crm/config/courses', newCourseForm);
      if (res.data?.success) {
        setShowAddCourse(false);
        setNewCourseForm({ name: '', code: '', fee: '', durationDays: '90', description: '' });
        fetchAllConfig();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add course');
    }
  };

  const handleToggleCourseActive = async (id, currentActive) => {
    try {
      await apiClient.patch(`/crm/config/courses/${id}`, { isActive: !currentActive });
      fetchAllConfig();
    } catch (error) {
      alert('Failed to update course status');
    }
  };

  // Terminal Plan Handlers
  const handleAddPlan = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/crm/config/plans', newPlanForm);
      if (res.data?.success) {
        setShowAddPlan(false);
        setNewPlanForm({ name: '', price: '', validityDays: '30', maxBrokers: '2', description: '' });
        fetchAllConfig();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add terminal plan');
    }
  };

  const handleTogglePlanActive = async (id, currentActive) => {
    try {
      await apiClient.patch(`/crm/config/plans/${id}`, { isActive: !currentActive });
      fetchAllConfig();
    } catch (error) {
      alert('Failed to update plan status');
    }
  };

  return (
    <div className="space-y-6 text-white font-sans">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161B22] p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 flex items-center justify-center text-white shadow-lg">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Dynamic Database Configurations</h2>
            <p className="text-xs text-gray-400">Manage Marketing Lead Sources, Educational Courses & Terminal Subscription Plans dynamically.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#0B0E14] p-1 rounded-xl border border-white/5 text-xs">
          <button
            onClick={() => setActiveTab('SOURCES')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'SOURCES' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-purple-300" /> Lead Sources ({sources.length})
          </button>
          <button
            onClick={() => setActiveTab('COURSES')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'COURSES' ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-300" /> Academy Courses ({courses.length})
          </button>
          <button
            onClick={() => setActiveTab('PLANS')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'PLANS' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 text-emerald-300" /> Terminal Plans ({plans.length})
          </button>
        </div>
      </div>

      {/* 🏷️ TAB 1: LEAD SOURCES */}
      {activeTab === 'SOURCES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-purple-300 uppercase tracking-wider">Marketing & Enquiry Channels</h3>
            <button
              onClick={() => setShowAddSource(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg"
            >
              + Add Lead Source
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {sources.map(src => (
              <div key={src.id} className="bg-[#161B22] border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-xl">
                <div>
                  <div className="text-sm font-black text-white">{src.name}</div>
                  <span className="text-[10px] text-gray-400 font-semibold">{src.channelType} Channel</span>
                  <div className="text-[9px] text-purple-400 mt-1 font-bold">
                    {src._count?.leads || 0} Registered Leads
                  </div>
                </div>

                <button
                  onClick={() => handleToggleSourceActive(src.id, src.isActive)}
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full border transition-all ${
                    src.isActive
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-red-500/20 text-red-400 border-red-500/40'
                  }`}
                >
                  {src.isActive ? 'ACTIVE' : 'DISABLED'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📚 TAB 2: ACADEMY COURSES */}
      {activeTab === 'COURSES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-cyan-300 uppercase tracking-wider">Educational Courses & Fee Catalogue</h3>
            <button
              onClick={() => setShowAddCourse(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg"
            >
              + Add Course
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courses.map(crs => (
              <div key={crs.id} className="bg-[#161B22] border border-cyan-500/30 rounded-2xl p-5 space-y-3 shadow-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-white">{crs.name}</h4>
                      <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {crs.code}
                      </span>
                    </div>
                    {crs.description && <p className="text-xs text-gray-400 mt-1">{crs.description}</p>}
                  </div>

                  <button
                    onClick={() => handleToggleCourseActive(crs.id, crs.isActive)}
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full border transition-all ${
                      crs.isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border-red-500/40'
                    }`}
                  >
                    {crs.isActive ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                  <div>
                    <span className="text-gray-500 text-[9px] block uppercase font-bold">Course Fee</span>
                    <span className="text-sm font-black text-[#00FF41]">₹{(crs.fee || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[9px] block uppercase font-bold">Duration</span>
                    <span className="text-sm font-bold text-white">{crs.durationDays} Days</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 💻 TAB 3: TERMINAL PLANS */}
      {activeTab === 'PLANS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-emerald-300 uppercase tracking-wider">Trading Terminal Subscription Tiers</h3>
            <button
              onClick={() => setShowAddPlan(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg"
            >
              + Add Terminal Plan
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(pln => (
              <div key={pln.id} className="bg-[#161B22] border border-emerald-500/30 rounded-2xl p-5 space-y-3 shadow-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-black text-white">{pln.name}</h4>
                    {pln.description && <p className="text-xs text-gray-400 mt-1">{pln.description}</p>}
                  </div>

                  <button
                    onClick={() => handleTogglePlanActive(pln.id, pln.isActive)}
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full border transition-all ${
                      pln.isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border-red-500/40'
                    }`}
                  >
                    {pln.isActive ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                  <div>
                    <span className="text-gray-500 text-[9px] block uppercase font-bold">Plan Price</span>
                    <span className="text-sm font-black text-[#00FF41]">₹{(pln.price || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[9px] block uppercase font-bold">Max Brokers</span>
                    <span className="text-sm font-bold text-amber-300">{pln.maxBrokers} Brokers</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ➕ Modal: Add Source */}
      {showAddSource && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-purple-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-400" /> Add Lead Source Channel
              </h3>
              <button onClick={() => setShowAddSource(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddSource} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Source Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WhatsApp Business / Walk-in"
                  value={newSourceForm.name}
                  onChange={e => setNewSourceForm({ ...newSourceForm, name: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Channel Type</label>
                <select
                  value={newSourceForm.channelType}
                  onChange={e => setNewSourceForm({ ...newSourceForm, channelType: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                >
                  <option value="DIGITAL">DIGITAL (Online Ads / Social)</option>
                  <option value="DIRECT">DIRECT (Referral / Direct Call)</option>
                  <option value="OFFLINE">OFFLINE (Walk-in / Banners)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddSource(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2 rounded-xl">Save Source</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ Modal: Add Course */}
      {showAddCourse && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-cyan-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-cyan-300 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" /> Add Educational Course
              </h3>
              <button onClick={() => setShowAddCourse(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddCourse} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Course Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Trader 90-Day Bootcamp"
                  value={newCourseForm.name}
                  onChange={e => setNewCourseForm({ ...newCourseForm, name: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Fee Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="25000"
                    value={newCourseForm.fee}
                    onChange={e => setNewCourseForm({ ...newCourseForm, fee: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Duration (Days)</label>
                  <input
                    type="number"
                    placeholder="90"
                    value={newCourseForm.durationDays}
                    onChange={e => setNewCourseForm({ ...newCourseForm, durationDays: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Description</label>
                <textarea
                  rows={2}
                  placeholder="Course curriculum highlights..."
                  value={newCourseForm.description}
                  onChange={e => setNewCourseForm({ ...newCourseForm, description: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCourse(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2 rounded-xl">Save Course</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ Modal: Add Terminal Plan */}
      {showAddPlan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-emerald-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                <Laptop className="w-4 h-4 text-emerald-400" /> Add Terminal Plan Tier
              </h3>
              <button onClick={() => setShowAddPlan(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddPlan} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ALGO_ELITE / VIP"
                  value={newPlanForm.name}
                  onChange={e => setNewPlanForm({ ...newPlanForm, name: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Price (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="999"
                    value={newPlanForm.price}
                    onChange={e => setNewPlanForm({ ...newPlanForm, price: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Max Brokers Supported</label>
                  <input
                    type="number"
                    placeholder="2"
                    value={newPlanForm.maxBrokers}
                    onChange={e => setNewPlanForm({ ...newPlanForm, maxBrokers: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddPlan(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-xl">Save Terminal Plan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
