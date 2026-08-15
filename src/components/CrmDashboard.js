'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, Calendar, PhoneCall, Video, Flame, Plus, Search, Filter, 
  Clock, CheckCircle, AlertCircle, ArrowRight, UserCheck, Tag, 
  MessageSquare, Sparkles, UserPlus, RefreshCw, Send, MapPin, 
  Briefcase, IndianRupee, ExternalLink, ChevronRight, Phone, Mail, Award,
  Trash2, ShieldAlert, Settings, BookOpen, Laptop, Bell
} from 'lucide-react';
import apiClient from '../lib/axios';
import EmployeeManager from './EmployeeManager';
import CrmConfigManager from './CrmConfigManager';
import ReminderManager from './ReminderManager';

export default function CrmDashboard() {
  const [activeTab, setActiveTab] = useState('LEADS'); // LEADS | REMINDERS | DEMOS | EMPLOYEES | CONFIG
  const [stats, setStats] = useState({
    todayNewLeads: 0,
    pendingCallbacks: 0,
    todayDemos: 0,
    hotLeads: 0
  });
  const [sourceBreakdown, setSourceBreakdown] = useState([]);
  const [leads, setLeads] = useState([]);
  const [sources, setSources] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [demos, setDemos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [terminalPlans, setTerminalPlans] = useState([]);

  // Justdial Email Sync Widget State
  const [justdialStats, setJustdialStats] = useState({
    syncStatus: 'Active',
    lastSyncAt: null,
    importedToday: 0,
    duplicatesSkipped: 0,
    failedParsing: 0,
    rejectedSender: 0,
    loading: false
  });

  // Clear Test Data Action State
  const [showClearTestDataModal, setShowClearTestDataModal] = useState(false);
  const [clearConfirmInput, setClearConfirmInput] = useState('');
  const [clearing, setClearing] = useState(false);

  // Filters & Search
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Selected Lead Modal & Active Details
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadDetailLoading, setLeadDetailLoading] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showScheduleFollowUpModal, setShowScheduleFollowUpModal] = useState(false);
  const [showAddDemoModal, setShowAddDemoModal] = useState(false);

  // New Lead Form State
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    sourceId: '',
    assignedEmployeeId: '',
    priority: 'MEDIUM',
    tradingExperience: 'BEGINNER',
    budget: '',
    notes: '',
    leadType: 'EDUCATIONAL_COURSE',
    selectedProduct: ''
  });

  // Follow-Up Form State
  const [followUpForm, setFollowUpForm] = useState({
    scheduledAt: '',
    channel: 'CALL',
    summary: '',
    nextAction: ''
  });

  // Demo Form State
  const [demoForm, setDemoForm] = useState({
    title: '',
    topic: '',
    scheduledAt: '',
    durationMinutes: '60',
    meetingUrl: '',
    instructorId: ''
  });

  const fetchJustdialStats = useCallback(async () => {
    setJustdialStats(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiClient.get('/crm/justdial/stats');
      if (res.data?.success && res.data?.stats) {
        setJustdialStats({
          syncStatus: 'Active',
          lastSyncAt: res.data.stats.lastSyncAt,
          importedToday: res.data.stats.importedToday || 0,
          duplicatesSkipped: res.data.stats.duplicatesSkipped || 0,
          failedParsing: res.data.stats.failedParsing || 0,
          rejectedSender: res.data.stats.rejectedSender || 0,
          loading: false
        });
      } else {
        setJustdialStats(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error fetching Justdial stats:', error);
      setJustdialStats(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchSourcesAndEmployees();
    fetchJustdialStats();
  }, [fetchJustdialStats]);

  useEffect(() => {
    fetchLeads();
  }, [selectedSource, selectedStatus, selectedPriority, searchQuery]);

  const fetchDashboardData = async () => {
    try {
      const res = await apiClient.get('/crm/leads/dashboard-stats');
      if (res.data?.success) {
        setStats(res.data.stats);
        setSourceBreakdown(res.data.sourceBreakdown);
      }
    } catch (error) {
      console.error('Error fetching CRM dashboard stats:', error);
    }
  };

  const fetchSourcesAndEmployees = async () => {
    try {
      const [srcRes, empRes, demoRes, courseRes, planRes] = await Promise.all([
        apiClient.get('/crm/leads/sources'),
        apiClient.get('/crm/leads/employees'),
        apiClient.get('/crm/demos'),
        apiClient.get('/crm/config/courses'),
        apiClient.get('/crm/config/plans')
      ]);

      if (srcRes.data?.success) setSources(srcRes.data.sources);
      if (empRes.data?.success) setEmployees(empRes.data.employees);
      if (demoRes.data?.success) setDemos(demoRes.data.demos);
      if (courseRes.data?.success) setCourses(courseRes.data.courses);
      if (planRes.data?.success) setTerminalPlans(planRes.data.plans);
    } catch (error) {
      console.error('Error fetching CRM options:', error);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedSource !== 'ALL') params.sourceId = selectedSource;
      if (selectedStatus !== 'ALL') params.status = selectedStatus;
      if (selectedPriority !== 'ALL') params.priority = selectedPriority;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await apiClient.get('/crm/leads', { params });
      if (res.data?.success) {
        setLeads(res.data.leads);
      }
    } catch (error) {
      console.error('Error fetching CRM leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeadDetails = async (id) => {
    setLeadDetailLoading(true);
    try {
      const res = await apiClient.get(`/crm/leads/${id}`);
      if (res.data?.success) {
        setSelectedLead(res.data.lead);
      }
    } catch (error) {
      console.error('Error fetching lead details:', error);
    } finally {
      setLeadDetailLoading(false);
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      let assignedEmpId = newLeadForm.assignedEmployeeId;
      if (!assignedEmpId) {
        const adminEmp = employees.find(emp => emp.designation === 'ADMIN');
        if (adminEmp) assignedEmpId = adminEmp.id;
      }

      const payload = {
        ...newLeadForm,
        assignedEmployeeId: assignedEmpId,
        leadType: newLeadForm.leadType || 'EDUCATIONAL_COURSE',
        productInterest: newLeadForm.selectedProduct || ''
      };

      const res = await apiClient.post('/crm/leads', payload);
      if (res.data?.success) {
        setShowAddLeadModal(false);
        setNewLeadForm({
          name: '', phone: '', email: '', city: '',
          sourceId: '', assignedEmployeeId: '', priority: 'MEDIUM',
          tradingExperience: 'BEGINNER', budget: '', notes: '',
          leadType: 'EDUCATIONAL_COURSE', selectedProduct: ''
        });
        fetchDashboardData();
        fetchLeads();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create lead');
    }
  };

  const handleScheduleFollowUp = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;
    try {
      const res = await apiClient.post(`/crm/leads/${selectedLead.id}/follow-up`, followUpForm);
      if (res.data?.success) {
        setShowScheduleFollowUpModal(false);
        setFollowUpForm({ scheduledAt: '', channel: 'CALL', summary: '', nextAction: '' });
        fetchLeadDetails(selectedLead.id);
        fetchDashboardData();
        fetchLeads();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to schedule follow-up');
    }
  };

  const handleUpdateCallStatus = async (leadId, callStatus) => {
    try {
      const res = await apiClient.patch(`/crm/leads/${leadId}`, { callStatus });
      if (res.data?.success) {
        if (selectedLead?.id === leadId) fetchLeadDetails(leadId);
        fetchLeads();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update call status');
    }
  };

  const handleUpdateLeadStatus = async (leadId, status) => {
    try {
      const res = await apiClient.patch(`/crm/leads/${leadId}`, { status });
      if (res.data?.success) {
        if (selectedLead?.id === leadId) fetchLeadDetails(leadId);
        fetchDashboardData();
        fetchLeads();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update status');
    }
  };

  const handleCreateDemo = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/crm/demos', demoForm);
      if (res.data?.success) {
        setShowAddDemoModal(false);
        setDemoForm({ title: '', topic: '', scheduledAt: '', durationMinutes: '60', meetingUrl: '', instructorId: '' });
        fetchSourcesAndEmployees();
        fetchDashboardData();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to schedule demo class');
    }
  };

  const handleRegisterLeadToDemo = async (demoId, leadId) => {
    try {
      const res = await apiClient.post(`/crm/demos/${demoId}/register-lead`, { leadId });
      if (res.data?.success) {
        fetchSourcesAndEmployees();
        if (selectedLead?.id === leadId) fetchLeadDetails(leadId);
        fetchLeads();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to register lead for demo');
    }
  };

  const handleToggleAttendance = async (demoId, leadId, attended) => {
    try {
      const res = await apiClient.patch(`/crm/demos/${demoId}/attendance`, { leadId, attended });
      if (res.data?.success) {
        fetchSourcesAndEmployees();
        if (selectedLead?.id === leadId) fetchLeadDetails(leadId);
        fetchLeads();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update attendance');
    }
  };

  // Helper Badge Colors & Icons
  const getSourceIcon = (sourceName) => {
    switch (sourceName?.toLowerCase()) {
      case 'instagram': return '📸';
      case 'facebook': return '📘';
      case 'justdial': return '📞';
      case 'google ads': return '🎯';
      case 'website': return '🌐';
      case 'referral': return '🎁';
      case 'offline': return '🏪';
      default: return '📣';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'URGENT': return <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">🔥 URGENT</span>;
      case 'HIGH': return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">⚡ HIGH</span>;
      case 'MEDIUM': return <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-semibold px-2 py-0.5 rounded-full">🔵 MEDIUM</span>;
      default: return <span className="bg-gray-500/20 text-gray-400 border border-gray-500/30 text-[9px] px-2 py-0.5 rounded-full">⚪ LOW</span>;
    }
  };

  const getLeadRegardingBadge = (lead) => {
    const type = lead?.leadType || lead?.leadRegarding || 'GENERAL_OTHER';
    let detail = lead?.productInterest || '';
    if (typeof detail === 'object') {
      try { detail = JSON.stringify(detail); } catch (e) { detail = ''; }
    }
    if (detail && typeof detail === 'string' && detail.startsWith('"') && detail.endsWith('"')) {
      detail = detail.slice(1, -1);
    }
    const labelDetail = detail ? ` — ${detail}` : '';

    switch (type) {
      case 'EDUCATIONAL_COURSE':
      case 'COURSE':
        return (
          <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            🎓 COURSE{labelDetail}
          </span>
        );
      case 'TRADING_TERMINAL':
      case 'TERMINAL':
        return (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            💻 TERMINAL{labelDetail}
          </span>
        );
      case 'ALGO_TRADING':
      case 'ALGO':
        return (
          <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            🤖 ALGO{labelDetail}
          </span>
        );
      case 'COPY_TRADING':
      case 'COPY':
        return (
          <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            🔄 COPY TRADING{labelDetail}
          </span>
        );
      case 'MULTIPLE_PRODUCTS':
      case 'MULTIPLE':
        return (
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            🔀 MULTIPLE{labelDetail}
          </span>
        );
      default:
        return (
          <span className="bg-gray-500/20 text-gray-300 border border-gray-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
            📌 GENERAL{labelDetail}
          </span>
        );
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'NEW': return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold px-2.5 py-0.5 rounded-full">✨ NEW LEAD</span>;
      case 'FOLLOW_UP': return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">⏰ FOLLOW-UP</span>;
      case 'DEMO_SCHEDULED': return <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">📹 DEMO BOOKED</span>;
      case 'DEMO_ATTENDED': return <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">🎓 DEMO ATTENDED</span>;
      case 'ADMITTED': return <span className="bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30 text-[9px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">🎉 ADMITTED</span>;
      case 'LOST': return <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-bold px-2.5 py-0.5 rounded-full">❌ LOST</span>;
      default: return <span className="bg-gray-500/20 text-gray-300 border border-gray-500/30 text-[9px] px-2.5 py-0.5 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 text-white pb-12 font-sans">
      {/* 🚀 Vibrant Animated CRM Header */}
      <div className="bg-gradient-to-r from-purple-900/40 via-blue-900/30 to-[#0F172A] rounded-2xl p-6 border border-purple-500/20 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-0 pointer-events-none animate-pulse" />
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-3xl animate-bounce">⚡</span>
              <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-pink-300 to-amber-200">
                Hello Trader CRM & Sales Hub
              </h1>
              <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full shadow-lg">
                PRO ACTIVE
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1 font-medium">
              Real-time Lead Ingestion, Callback Scheduling, Live Demo Class Tracking & Conversion Pipeline 🚀
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowAddLeadModal(true)}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> + Add New Lead
            </button>
            <button
              onClick={() => setShowAddDemoModal(true)}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95"
            >
              <Video className="w-4 h-4" /> + Schedule Demo Class
            </button>
            <button
              onClick={() => setShowClearTestDataModal(true)}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 text-xs font-bold px-3 py-2.5 rounded-xl transition-all flex items-center gap-1.5"
              title="Safely clear initial sample test leads"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" /> Clear Test Data
            </button>
          </div>
        </div>

        {/* 📊 Animated Quick Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div 
            onClick={() => { setSelectedStatus('ALL'); setSelectedPriority('ALL'); }}
            className="bg-[#161B22]/80 hover:bg-[#1E2634] border border-purple-500/20 hover:border-purple-500/50 rounded-xl p-4 cursor-pointer transition-all transform hover:-translate-y-1 shadow-lg group"
          >
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">🌟 Today&apos;s New Leads</span>
              <span className="text-xl group-hover:scale-125 transition-transform">🎯</span>
            </div>
            <div className="text-2xl font-black text-white">{stats.todayNewLeads}</div>
            <div className="text-[9px] text-gray-400 mt-1 font-semibold">Real-time incoming enquiries</div>
          </div>

          <div 
            onClick={() => { setSelectedStatus('FOLLOW_UP'); setSelectedPriority('ALL'); }}
            className="bg-[#161B22]/80 hover:bg-[#1E2634] border border-amber-500/20 hover:border-amber-500/50 rounded-xl p-4 cursor-pointer transition-all transform hover:-translate-y-1 shadow-lg group"
          >
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">⏰ Pending Callbacks</span>
              <span className="text-xl group-hover:scale-125 transition-transform">🔔</span>
            </div>
            <div className="text-2xl font-black text-amber-300">{stats.pendingCallbacks}</div>
            <div className="text-[9px] text-amber-400/80 mt-1 font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Scheduled or Due Today
            </div>
          </div>

          <div 
            onClick={() => setActiveTab('DEMOS')}
            className="bg-[#161B22]/80 hover:bg-[#1E2634] border border-cyan-500/20 hover:border-cyan-500/50 rounded-xl p-4 cursor-pointer transition-all transform hover:-translate-y-1 shadow-lg group"
          >
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">📹 Today&apos;s Live Demos</span>
              <span className="text-xl group-hover:scale-125 transition-transform">🎟️</span>
            </div>
            <div className="text-2xl font-black text-cyan-300">{stats.todayDemos}</div>
            <div className="text-[9px] text-cyan-400/80 mt-1 font-semibold">Masterclasses & Webinars</div>
          </div>

          <div 
            onClick={() => { setSelectedPriority('URGENT'); setSelectedStatus('ALL'); }}
            className="bg-[#161B22]/80 hover:bg-[#1E2634] border border-red-500/20 hover:border-red-500/50 rounded-xl p-4 cursor-pointer transition-all transform hover:-translate-y-1 shadow-lg group"
          >
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-red-400">🔥 Hot / Urgent Leads</span>
              <span className="text-xl group-hover:scale-125 transition-transform">⚡</span>
            </div>
            <div className="text-2xl font-black text-red-400 animate-pulse">{stats.hotLeads}</div>
            <div className="text-[9px] text-red-400/80 mt-1 font-semibold">High conversion intent</div>
          </div>
        </div>

        {/* 📥 Compact Justdial Email Sync Widget */}
        {/* 📥 Justdial Email Sync & IMAP Worker Widget */}
        <div className="mt-4 bg-[#161B22]/90 border border-purple-500/30 rounded-xl p-3.5 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-lg shrink-0">
              📥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider">Justdial Email Sync</h3>
                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                  justdialStats.worker?.status === 'ONLINE' || justdialStats.worker?.status === 'POLLING'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : justdialStats.worker?.status === 'ERROR'
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    justdialStats.worker?.status === 'ONLINE' || justdialStats.worker?.status === 'POLLING'
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-gray-400'
                  }`} />
                  Worker: {justdialStats.worker?.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>Last Poll: <strong className="text-gray-200">{justdialStats.worker?.lastPollAt ? new Date(justdialStats.worker.lastPollAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}</strong></span>
                <span>•</span>
                <span>Last Sync: <strong className="text-gray-200">{justdialStats.lastSyncAt ? new Date(justdialStats.lastSyncAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-[#0B0E14] px-3 py-1 rounded-lg border border-white/5 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase block">Unread Justdial</span>
              <span className="text-xs font-black text-cyan-400">{justdialStats.worker?.unreadJustdialEmailCount || 0}</span>
            </div>

            <div className="bg-[#0B0E14] px-3 py-1 rounded-lg border border-white/5 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase block">Imported Today</span>
              <span className="text-xs font-black text-emerald-400">{justdialStats.importedToday || 0}</span>
            </div>

            <div className="bg-[#0B0E14] px-3 py-1 rounded-lg border border-white/5 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase block">Duplicates Skipped</span>
              <span className="text-xs font-black text-amber-300">{justdialStats.duplicatesSkipped || 0}</span>
            </div>

            <div className="bg-[#0B0E14] px-3 py-1 rounded-lg border border-white/5 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase block">Parse Errors</span>
              <span className="text-xs font-black text-red-400">{justdialStats.failedParsing || 0}</span>
            </div>

            <button
              onClick={fetchJustdialStats}
              disabled={justdialStats.loading}
              className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              title="Refresh Justdial Email Sync Stats"
            >
              <RefreshCw className={`w-3 h-3 ${justdialStats.loading ? 'animate-spin' : ''}`} />
              Refresh Stats
            </button>
          </div>
        </div>
      </div>

      {/* 🎯 Marketing Source Channel Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1 mr-2">
          <Tag className="w-3 h-3 text-purple-400" /> Sources:
        </span>
        <button
          onClick={() => setSelectedSource('ALL')}
          className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
            selectedSource === 'ALL'
              ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
              : 'bg-[#161B22] text-gray-400 border-white/10 hover:text-white hover:border-white/20'
          }`}
        >
          ✨ All Channels ({sourceBreakdown.reduce((acc, s) => acc + s.count, 0)})
        </button>
        {sources.map(src => {
          const count = sourceBreakdown.find(s => s.id === src.id)?.count || 0;
          return (
            <button
              key={src.id}
              onClick={() => setSelectedSource(src.id)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedSource === src.id
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                  : 'bg-[#161B22] text-gray-300 border-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              <span>{getSourceIcon(src.name)}</span>
              <span>{src.name}</span>
              <span className="bg-white/10 px-1.5 py-0.2 text-[8px] rounded-full">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 🎛️ Navigation Tabs & Filters Bar */}
      <div className="bg-[#161B22] rounded-2xl border border-white/10 p-4 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-[#0B0E14] p-1.5 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'OVERVIEW'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>📊</span> Business Overview
            </button>

            <button
              onClick={() => setActiveTab('LEADS')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'LEADS'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-purple-300" /> Leads ({leads.length})
            </button>

            <button
              onClick={() => setActiveTab('ADMISSIONS')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'ADMISSIONS'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🎓</span> Admissions
            </button>

            <button
              onClick={() => setActiveTab('TERMINAL')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'TERMINAL'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>💻</span> Terminal
            </button>

            <button
              onClick={() => setActiveTab('ALGO')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'ALGO'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🤖</span> Algo
            </button>

            <button
              onClick={() => setActiveTab('COPY')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'COPY'
                  ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🔄</span> Copy Trading
            </button>

            <button
              onClick={() => setActiveTab('PAYMENTS')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'PAYMENTS'
                  ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>💳</span> Payments
            </button>

            <button
              onClick={() => setActiveTab('EXPENSES')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'EXPENSES'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>💸</span> Expenses
            </button>

            <button
              onClick={() => setActiveTab('EMPLOYEES')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'EMPLOYEES'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-pink-300" /> Staff
            </button>

            <button
              onClick={() => setActiveTab('REMINDERS')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'REMINDERS'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-300" /> Reminders
            </button>

            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`text-xs font-black px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'CONFIG'
                  ? 'bg-gradient-to-r from-slate-700 to-gray-700 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-gray-300" /> Config
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Lead Name, Phone, Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B0E14] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-all"
            />
          </div>
        </div>

        {/* Priority & Status Filters */}
        {activeTab === 'LEADS' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Filter className="w-3 h-3 text-purple-400" /> Status:
              </span>
              {['ALL', 'NEW', 'FOLLOW_UP', 'DEMO_SCHEDULED', 'DEMO_ATTENDED', 'ADMITTED', 'LOST'].map(st => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    selectedStatus === st
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-[#0B0E14] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Priority:</span>
              {['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map(pr => (
                <button
                  key={pr}
                  onClick={() => setSelectedPriority(pr)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    selectedPriority === pr
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-[#0B0E14] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {pr}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 📋 Leads List View */}
      {activeTab === 'LEADS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Leads Table / Cards Column */}
          <div className={`${selectedLead ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
            {loading ? (
              <div className="bg-[#161B22] rounded-2xl p-12 text-center border border-white/10">
                <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
                <p className="text-xs text-gray-400 font-bold">Loading CRM Lead Pipeline...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="bg-[#161B22] rounded-2xl p-12 text-center border border-white/10 space-y-3">
                <span className="text-4xl">🔍</span>
                <h3 className="text-sm font-bold text-gray-300">No Leads Found</h3>
                <p className="text-xs text-gray-500">Try adjusting your source, status, or search filters.</p>
                <button
                  onClick={() => setShowAddLeadModal(true)}
                  className="bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  + Add New Lead Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {leads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => fetchLeadDetails(lead.id)}
                    className={`bg-[#161B22] hover:bg-[#1E2634] border rounded-2xl p-4 cursor-pointer transition-all duration-200 shadow-lg relative overflow-hidden group ${
                      selectedLead?.id === lead.id
                        ? 'border-purple-500 ring-2 ring-purple-500/20 bg-[#1E2634]'
                        : 'border-white/10 hover:border-purple-500/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white group-hover:text-purple-300 transition-colors">
                            {lead.name}
                          </span>
                          <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                            {lead.leadNumber}
                          </span>
                          {getPriorityBadge(lead.priority)}
                          {getLeadRegardingBadge(lead)}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1 font-semibold text-gray-300">
                            <Phone className="w-3 h-3 text-purple-400" /> {lead.phone}
                          </span>
                          {lead.city && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <MapPin className="w-3 h-3 text-blue-400" /> {lead.city}
                            </span>
                          )}
                          <span className="flex items-center gap-1 bg-[#0B0E14] px-2 py-0.5 rounded border border-white/5 text-[10px] text-gray-300">
                            <span>{getSourceIcon(lead.source?.name)}</span> {lead.source?.name || 'Direct'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusBadge(lead.status)}
                        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                      </div>
                    </div>

                    {/* Quick Call Status & Employee Tag */}
                    <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between text-[10px] text-gray-400 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-500 uppercase">Assigned:</span>
                        <span className="text-gray-300 font-semibold flex items-center gap-1 bg-[#0B0E14] px-2 py-0.5 rounded border border-white/5">
                          👤 {lead.assignedEmployee?.name || 'Unassigned'}
                        </span>
                      </div>

                      {lead.followUps?.[0] && (
                        <div className="flex items-center gap-1 text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          <span>Callback: {new Date(lead.followUps[0].scheduledAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 🔍 Right Column: Selected Lead Details, Activity Timeline & Actions */}
          {selectedLead && (
            <div className="lg:col-span-5 bg-[#161B22] rounded-2xl border border-purple-500/30 p-5 space-y-5 shadow-2xl sticky top-6">
              {leadDetailLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between border-b border-white/10 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-white">{selectedLead.name}</h2>
                        {getPriorityBadge(selectedLead.priority)}
                      </div>
                      <p className="text-xs text-purple-400 font-mono mt-0.5">{selectedLead.leadNumber}</p>
                    </div>

                    <button
                      onClick={() => setSelectedLead(null)}
                      className="text-gray-400 hover:text-white text-xs bg-[#0B0E14] px-2.5 py-1 rounded-lg border border-white/10"
                    >
                      Close ✕
                    </button>
                  </div>

                  {/* Contact Info & Source */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-[#0B0E14] p-2.5 rounded-xl border border-white/5">
                      <span className="text-gray-500 text-[9px] font-bold block uppercase">Phone Number</span>
                      <a href={`tel:${selectedLead.phone}`} className="text-purple-300 font-black flex items-center gap-1 hover:underline">
                        <Phone className="w-3 h-3" /> {selectedLead.phone}
                      </a>
                    </div>
                    <div className="bg-[#0B0E14] p-2.5 rounded-xl border border-white/5">
                      <span className="text-gray-500 text-[9px] font-bold block uppercase">Marketing Source</span>
                      <span className="text-white font-bold flex items-center gap-1">
                        <span>{getSourceIcon(selectedLead.source?.name)}</span> {selectedLead.source?.name || 'Direct'}
                      </span>
                    </div>
                    <div className="bg-[#0B0E14] p-2.5 rounded-xl border border-white/5">
                      <span className="text-gray-500 text-[9px] font-bold block uppercase">Trading Experience</span>
                      <span className="text-amber-300 font-bold">{selectedLead.tradingExperience || 'Beginner'}</span>
                    </div>
                    <div className="bg-[#0B0E14] p-2.5 rounded-xl border border-white/5">
                      <span className="text-gray-500 text-[9px] font-bold block uppercase">Budget / Fee Target</span>
                      <span className="text-[#00FF41] font-bold">₹{selectedLead.budget || '0'}</span>
                    </div>

                    {selectedLead.externalLeadId && (
                      <div className="bg-[#0B0E14] p-2.5 rounded-xl border border-purple-500/30 col-span-2">
                        <span className="text-purple-400 text-[9px] font-bold block uppercase">External Ref ID (Justdial)</span>
                        <span className="text-purple-300 font-mono font-bold text-xs">{selectedLead.externalLeadId}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {selectedLead.notes && (
                    <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-200">
                      <span className="font-bold text-purple-300 block mb-1">📝 Lead Notes:</span>
                      {selectedLead.notes}
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => setShowScheduleFollowUpModal(true)}
                      className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Clock className="w-4 h-4" /> Schedule Callback
                    </button>

                    <div className="relative">
                      <select
                        value={selectedLead.status}
                        onChange={(e) => handleUpdateLeadStatus(selectedLead.id, e.target.value)}
                        className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold py-2 px-3 rounded-xl appearance-none cursor-pointer focus:outline-none text-center"
                      >
                        <option value="NEW" className="bg-[#161B22] text-white">Status: NEW</option>
                        <option value="FOLLOW_UP" className="bg-[#161B22] text-white">Status: FOLLOW_UP</option>
                        <option value="DEMO_SCHEDULED" className="bg-[#161B22] text-white">Status: DEMO_SCHEDULED</option>
                        <option value="DEMO_ATTENDED" className="bg-[#161B22] text-white">Status: DEMO_ATTENDED</option>
                        <option value="ADMITTED" className="bg-[#161B22] text-white">Status: ADMITTED 🎉</option>
                        <option value="LOST" className="bg-[#161B22] text-white">Status: LOST ❌</option>
                      </select>
                    </div>
                  </div>

                  {/* 📜 Complete Activity Timeline */}
                  <div className="space-y-3 pt-3 border-t border-white/10">
                    <h4 className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" /> Complete Activity Timeline
                    </h4>

                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {selectedLead.crmActivities?.length === 0 ? (
                        <p className="text-xs text-gray-500">No activities logged yet.</p>
                      ) : (
                        selectedLead.crmActivities?.map((act, idx) => (
                          <div key={act.id} className="flex gap-3 text-xs relative">
                            {idx !== selectedLead.crmActivities.length - 1 && (
                              <div className="w-0.5 bg-purple-500/20 absolute left-2 top-5 bottom-0" />
                            )}
                            <div className="w-4 h-4 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-[8px] text-purple-300 z-10 shrink-0 mt-0.5">
                              ●
                            </div>
                            <div className="space-y-0.5 bg-[#0B0E14] p-2.5 rounded-xl border border-white/5 flex-1">
                              <div className="flex items-center justify-between text-gray-400 text-[9px]">
                                <span className="font-bold text-purple-300">{act.actorName} ({act.actorRole})</span>
                                <span>{new Date(act.timestamp).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div className="font-bold text-white text-xs">{act.title}</div>
                              {act.description && <div className="text-gray-400 text-[11px]">{act.description}</div>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 📹 Demo Masterclasses Tab */}
      {activeTab === 'DEMOS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Video className="w-4 h-4" /> Live Scheduled Masterclasses & Webinars
            </h2>
            <button
              onClick={() => setShowAddDemoModal(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl"
            >
              + Create Demo Class
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {demos.map(demo => (
              <div key={demo.id} className="bg-[#161B22] border border-cyan-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-black text-white">{demo.title}</h3>
                    <p className="text-xs text-cyan-300 font-medium">{demo.topic}</p>
                  </div>
                  <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-black px-2.5 py-0.5 rounded-full">
                    {demo.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                  <div>
                    <span className="text-gray-500 text-[9px] block uppercase font-bold">Scheduled At</span>
                    <span className="font-bold text-white">
                      {new Date(demo.scheduledAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[9px] block uppercase font-bold">Instructor</span>
                    <span className="font-bold text-amber-300">👤 {demo.instructor?.name}</span>
                  </div>
                </div>

                {demo.meetingUrl && (
                  <a
                    href={demo.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Join Live Meeting Link
                  </a>
                )}

                {/* Attendees Section */}
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-400">Registered Leads ({demo.attendees?.length || 0})</span>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {demo.attendees?.map(att => (
                      <div key={att.id} className="flex items-center justify-between bg-[#0B0E14] p-2 rounded-xl text-xs border border-white/5">
                        <div>
                          <div className="font-bold text-white">{att.lead?.name}</div>
                          <div className="text-[10px] text-gray-400">{att.lead?.phone}</div>
                        </div>

                        <button
                          onClick={() => handleToggleAttendance(demo.id, att.leadId, !att.attended)}
                          className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all ${
                            att.attended
                              ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                              : 'bg-gray-800 text-gray-400 border-white/10 hover:text-white'
                          }`}
                        >
                          {att.attended ? '✅ Attended' : 'Mark Attended'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ➕ Modal: Add New Lead */}
      {showAddLeadModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-purple-500/30 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>🌟</span> Add New Lead to CRM
              </h3>
              <button onClick={() => setShowAddLeadModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Lead Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={newLeadForm.name}
                    onChange={e => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={newLeadForm.phone}
                    onChange={e => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Email Address</label>
                  <input
                    type="email"
                    placeholder="rahul@gmail.com"
                    value={newLeadForm.email}
                    onChange={e => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">City / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Ahmedabad"
                    value={newLeadForm.city}
                    onChange={e => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Marketing Source</label>
                  <select
                    value={newLeadForm.sourceId}
                    onChange={e => setNewLeadForm({ ...newLeadForm, sourceId: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  >
                    <option value="">Direct / Select Source</option>
                    {sources.map(s => (
                      <option key={s.id} value={s.id}>{getSourceIcon(s.name)} {s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Assign Staff (Defaults to ADMIN)</label>
                  <select
                    value={newLeadForm.assignedEmployeeId}
                    onChange={e => setNewLeadForm({ ...newLeadForm, assignedEmployeeId: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  >
                    <option value="">👑 Auto-Assign to ADMIN</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 🎓 LEAD REGARDING / INTERESTED IN & DYNAMIC SECONDARY PRODUCT DROPDOWN */}
              <div className="grid grid-cols-2 gap-3 bg-[#0B0E14] p-3 rounded-xl border border-purple-500/30">
                <div>
                  <label className="text-purple-300 font-black block mb-1 uppercase text-[10px]">
                    LEAD REGARDING *
                  </label>
                  <select
                    required
                    value={newLeadForm.leadType || 'EDUCATIONAL_COURSE'}
                    onChange={e => setNewLeadForm({ ...newLeadForm, leadType: e.target.value, selectedProduct: '' })}
                    className="w-full bg-[#161B22] border border-purple-500/40 rounded-xl px-3 py-2 text-white focus:border-purple-400 outline-none font-bold text-xs"
                  >
                    <option value="EDUCATIONAL_COURSE">🎓 Educational Course</option>
                    <option value="TRADING_TERMINAL">💻 Trading Terminal</option>
                    <option value="ALGO_TRADING">🤖 Algo Trading</option>
                    <option value="COPY_TRADING">🔄 Copy Trading</option>
                    <option value="MULTIPLE_PRODUCTS">🔀 Multiple Products</option>
                    <option value="GENERAL_OTHER">📌 General / Other</option>
                  </select>
                </div>

                <div>
                  {(newLeadForm.leadType === 'EDUCATIONAL_COURSE' || newLeadForm.leadType === 'COURSE') && (
                    <>
                      <label className="text-cyan-300 font-black block mb-1 uppercase text-[10px]">
                        COURSE INTEREST *
                      </label>
                      <select
                        value={newLeadForm.selectedProduct}
                        onChange={e => setNewLeadForm({ ...newLeadForm, selectedProduct: e.target.value })}
                        className="w-full bg-[#161B22] border border-cyan-500/40 rounded-xl px-3 py-2 text-white focus:border-cyan-400 outline-none font-bold text-xs"
                      >
                        <option value="">Select Course</option>
                        {courses.map(c => (
                          <option key={c.id} value={c.name}>{c.name} (₹{c.fee})</option>
                        ))}
                      </select>
                    </>
                  )}

                  {(newLeadForm.leadType === 'TRADING_TERMINAL' || newLeadForm.leadType === 'TERMINAL') && (
                    <>
                      <label className="text-amber-300 font-black block mb-1 uppercase text-[10px]">
                        TERMINAL PLAN *
                      </label>
                      <select
                        value={newLeadForm.selectedProduct}
                        onChange={e => setNewLeadForm({ ...newLeadForm, selectedProduct: e.target.value })}
                        className="w-full bg-[#161B22] border border-amber-500/40 rounded-xl px-3 py-2 text-white focus:border-amber-400 outline-none font-bold text-xs"
                      >
                        <option value="">Select Terminal Plan</option>
                        {terminalPlans.map(p => (
                          <option key={p.id} value={p.name}>{p.name} (₹{p.price}/mo)</option>
                        ))}
                      </select>
                    </>
                  )}

                  {(newLeadForm.leadType === 'ALGO_TRADING' || newLeadForm.leadType === 'ALGO') && (
                    <>
                      <label className="text-blue-300 font-black block mb-1 uppercase text-[10px]">
                        ALGO PLAN *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. BankNifty Supertrend Algo"
                        value={newLeadForm.selectedProduct}
                        onChange={e => setNewLeadForm({ ...newLeadForm, selectedProduct: e.target.value })}
                        className="w-full bg-[#161B22] border border-blue-500/40 rounded-xl px-3 py-2 text-white focus:border-blue-400 outline-none font-bold text-xs"
                      />
                    </>
                  )}

                  {(newLeadForm.leadType === 'COPY_TRADING' || newLeadForm.leadType === 'COPY') && (
                    <>
                      <label className="text-pink-300 font-black block mb-1 uppercase text-[10px]">
                        COPY TRADING PLAN *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Master Trader Alpha"
                        value={newLeadForm.selectedProduct}
                        onChange={e => setNewLeadForm({ ...newLeadForm, selectedProduct: e.target.value })}
                        className="w-full bg-[#161B22] border border-pink-500/40 rounded-xl px-3 py-2 text-white focus:border-pink-400 outline-none font-bold text-xs"
                      />
                    </>
                  )}

                  {newLeadForm.leadType === 'MULTIPLE_PRODUCTS' && (
                    <>
                      <label className="text-emerald-300 font-black block mb-1 uppercase text-[10px]">
                        MULTIPLE PRODUCTS
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Technical Analysis + Terminal"
                        value={newLeadForm.selectedProduct}
                        onChange={e => setNewLeadForm({ ...newLeadForm, selectedProduct: e.target.value })}
                        className="w-full bg-[#161B22] border border-emerald-500/40 rounded-xl px-3 py-2 text-white focus:border-emerald-400 outline-none font-bold text-xs"
                      />
                    </>
                  )}

                  {newLeadForm.leadType === 'GENERAL_OTHER' && (
                    <>
                      <label className="text-gray-400 font-black block mb-1 uppercase text-[10px]">
                        GENERAL ENQUIRY
                      </label>
                      <input
                        type="text"
                        placeholder="General Trading Enquiry"
                        value={newLeadForm.selectedProduct}
                        onChange={e => setNewLeadForm({ ...newLeadForm, selectedProduct: e.target.value })}
                        className="w-full bg-[#161B22] border border-white/20 rounded-xl px-3 py-2 text-white focus:border-white/40 outline-none font-bold text-xs"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Priority</label>
                  <select
                    value={newLeadForm.priority}
                    onChange={e => setNewLeadForm({ ...newLeadForm, priority: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH 🔥</option>
                    <option value="URGENT">URGENT ⚡</option>
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Trading Experience</label>
                  <select
                    value={newLeadForm.tradingExperience}
                    onChange={e => setNewLeadForm({ ...newLeadForm, tradingExperience: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="EXPERIENCED">Experienced</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Initial Notes</label>
                <textarea
                  rows={2}
                  placeholder="Enquiry details, course interest, preferred batch..."
                  value={newLeadForm.notes}
                  onChange={e => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddLeadModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2 rounded-xl">Save Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⏰ Modal: Schedule Callback */}
      {showScheduleFollowUpModal && selectedLead && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Schedule Callback for {selectedLead.name}
              </h3>
              <button onClick={() => setShowScheduleFollowUpModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleScheduleFollowUp} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Callback Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={followUpForm.scheduledAt}
                  onChange={e => setFollowUpForm({ ...followUpForm, scheduledAt: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Contact Channel</label>
                <select
                  value={followUpForm.channel}
                  onChange={e => setFollowUpForm({ ...followUpForm, channel: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                >
                  <option value="CALL">📞 Phone Call</option>
                  <option value="WHATSAPP">💬 WhatsApp Message</option>
                  <option value="TELEGRAM">✈️ Telegram</option>
                  <option value="EMAIL">📧 Email</option>
                </select>
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Call Objective / Agenda *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Discuss fee discount, confirm payment mode..."
                  value={followUpForm.summary}
                  onChange={e => setFollowUpForm({ ...followUpForm, summary: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowScheduleFollowUpModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-5 py-2 rounded-xl">Save Callback</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📹 Modal: Schedule Demo Masterclass */}
      {showAddDemoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-cyan-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-cyan-300 flex items-center gap-2">
                <Video className="w-4 h-4 text-cyan-400" /> Schedule Live Demo Masterclass
              </h3>
              <button onClick={() => setShowAddDemoModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateDemo} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Masterclass Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mastering Nifty Options Algo Trading"
                  value={demoForm.title}
                  onChange={e => setDemoForm({ ...demoForm, title: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Scheduled Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={demoForm.scheduledAt}
                  onChange={e => setDemoForm({ ...demoForm, scheduledAt: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Instructor / Faculty *</label>
                  <select
                    required
                    value={demoForm.instructorId}
                    onChange={e => setDemoForm({ ...demoForm, instructorId: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                  >
                    <option value="">Select Faculty</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Meeting URL</label>
                  <input
                    type="url"
                    placeholder="https://meet.google.com/..."
                    value={demoForm.meetingUrl}
                    onChange={e => setDemoForm({ ...demoForm, meetingUrl: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddDemoModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2 rounded-xl">Create Session</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 🔔 Smart CRM & Telegram Reminders Tab */}
      {activeTab === 'REMINDERS' && <ReminderManager />}

      {/* 👤 Employee Management Tab */}
      {activeTab === 'EMPLOYEES' && <EmployeeManager />}

      {/* ⚙️ Dynamic Configuration Tab */}
      {activeTab === 'CONFIG' && <CrmConfigManager />}

      {/* ⚠️ Modal: Clear Test Data Confirmation */}
      {showClearTestDataModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-red-500/40 rounded-2xl w-full max-w-md p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center mx-auto text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Safe Action: Clear Initial Test Leads</h3>
              <p className="text-xs text-gray-400 mt-1">
                This will purge ONLY the 3 sample test leads (<strong className="text-red-300">Rajesh Kumar, Sneha Kapoor, Amit Patel</strong>) from the CRM database.
              </p>
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-[11px] text-red-300 text-left mt-2">
                <span className="font-bold block">✓ Guaranteed Data Safety:</span>
                Zero real user accounts, wallets, payment requests, referrals, or algo connections will be touched. LEADS count will update to 0.
              </div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (clearConfirmInput !== 'CLEAR_TEST_DATA') {
                alert('Please enter the exact confirmation keyword: CLEAR_TEST_DATA');
                return;
              }
              setClearing(true);
              try {
                const res = await apiClient.post('/crm/admin/clear-test-data', { confirmKeyword: clearConfirmInput });
                if (res.data?.success) {
                  alert(res.data.message);
                  setShowClearTestDataModal(false);
                  setClearConfirmInput('');
                  fetchDashboardData();
                  fetchLeads();
                }
              } catch (err) {
                alert(err.response?.data?.error || 'Failed to clear test data');
              } finally {
                setClearing(false);
              }
            }} className="space-y-3 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">
                  Type <strong className="text-red-400">CLEAR_TEST_DATA</strong> to confirm:
                </label>
                <input
                  type="text"
                  required
                  placeholder="CLEAR_TEST_DATA"
                  value={clearConfirmInput}
                  onChange={e => setClearConfirmInput(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-red-500/40 rounded-xl px-3 py-2 text-white font-mono text-center focus:outline-none"
                />
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearTestDataModal(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clearing || clearConfirmInput !== 'CLEAR_TEST_DATA'}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-red-600/30"
                >
                  {clearing ? 'Clearing...' : 'Confirm Clear Test Leads'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
