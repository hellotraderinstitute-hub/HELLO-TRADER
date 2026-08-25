'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTrading } from '../context/TradingContext';
import { 
  ShieldCheck, Users, Activity, Server, Lock, AlertTriangle, 
  CheckCircle, CheckCircle2, RefreshCw, Settings, CreditCard, Send, X, 
  UserCheck, Key, Laptop, FileText, BarChart3, HelpCircle, Info, ArrowRightLeft,
  UserPlus, Check, Trash2, ShieldAlert, Eye, EyeOff, Copy, Sparkles, Share2, Zap, Globe
} from 'lucide-react';
import ProviderSettings from './ProviderSettings';
import AdminPaymentManager from './AdminPaymentManager';
import CrmDashboard from './CrmDashboard';
import SocialMediaManager from './SocialMediaManager';
import AdminPartnerManager from './AdminPartnerManager';
import AdminStaticIpManager from './AdminStaticIpManager';
import apiClient from '../lib/axios';

// ─── Student Trial Manager Component (Top Level — Rules of Hooks Compliant) ───
function StudentTrialManager({ student, onUpdate }) {
  const [trialDaysInput, setTrialDaysInput] = useState('');
  const [trialNoteInput, setTrialNoteInput] = useState('');
  const [trialStatus, setTrialStatus] = useState(null);
  const [trialSaving, setTrialSaving] = useState(false);

  useEffect(() => {
    if (!student?.id) return;
    apiClient.get(`/admin/student/${student.id}/trial`)
      .then(r => {
        setTrialStatus(r.data);
        setTrialDaysInput(String(r.data.effectiveDays));
        setTrialNoteInput(r.data.trialOverrideNote || '');
      })
      .catch(() => {});
  }, [student?.id]);

  const saveTrial = async (resetToDefault = false) => {
    setTrialSaving(true);
    try {
      const r = await apiClient.patch(`/admin/student/${student.id}/trial`, {
        trialDays: resetToDefault ? undefined : parseInt(trialDaysInput),
        note: resetToDefault ? undefined : (trialNoteInput || undefined),
        resetToDefault,
      });
      alert(r.data.message);
      const refreshed = await apiClient.get(`/admin/student/${student.id}/trial`);
      setTrialStatus(refreshed.data);
      setTrialDaysInput(String(refreshed.data.effectiveDays));
      setTrialNoteInput(refreshed.data.trialOverrideNote || '');
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update trial');
    } finally {
      setTrialSaving(false);
    }
  };

  if (!trialStatus || !student) return null;

  const expiry = trialStatus.trialExpiry ? new Date(trialStatus.trialExpiry) : null;
  const started = trialStatus.trialStartedAt ? new Date(trialStatus.trialStartedAt) : null;

  return (
    <div className="bg-[#0B0E14] rounded-xl border border-amber-500/20 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
          ⏱ Trial Period Management — {student.name}
        </h3>
        <div className="flex items-center gap-2 text-[9px]">
          {trialStatus.isOverridden ? (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-black">
              CUSTOM OVERRIDE ACTIVE
            </span>
          ) : (
            <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-black">
              DEFAULT TRIAL
            </span>
          )}
          {trialStatus.isExpired && !trialStatus.hasActiveMembership ? (
            <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-black">
              TRIAL EXPIRED
            </span>
          ) : (
            <span className="bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 px-2 py-0.5 rounded font-black">
              TRIAL ACTIVE ({trialStatus.daysRemaining}d REMAINING)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="bg-[#161B22] rounded-lg p-2 space-y-0.5 border border-white/5">
          <span className="text-gray-500 text-[8px] block font-bold uppercase">Global Default</span>
          <span className="text-white font-black">{trialStatus.globalDays} Days</span>
        </div>
        <div className="bg-[#161B22] rounded-lg p-2 space-y-0.5 border border-white/5">
          <span className="text-gray-500 text-[8px] block font-bold uppercase">This Student</span>
          <span className={`font-black ${trialStatus.isOverridden ? 'text-amber-400' : 'text-gray-300'}`}>
            {trialStatus.effectiveDays} Days {trialStatus.isOverridden ? '(Custom)' : '(Default)'}
          </span>
        </div>
        <div className="bg-[#161B22] rounded-lg p-2 space-y-0.5 border border-white/5">
          <span className="text-gray-500 text-[8px] block font-bold uppercase">Trial Started</span>
          <span className="text-gray-300 font-bold text-[9px]">
            {started ? started.toLocaleDateString('en-IN') : '—'}
          </span>
        </div>
        <div className="bg-[#161B22] rounded-lg p-2 space-y-0.5 border border-white/5">
          <span className="text-gray-500 text-[8px] block font-bold uppercase">Trial Expires</span>
          <span className={`font-black text-[9px] ${trialStatus.isExpired ? 'text-red-400' : 'text-[#00FF41]'}`}>
            {expiry ? expiry.toLocaleDateString('en-IN') : '—'}
          </span>
        </div>
      </div>

      {trialStatus.isOverridden && trialStatus.trialOverrideNote && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-[10px] text-amber-300">
          <span className="font-bold text-amber-400">Admin Note:</span> {trialStatus.trialOverrideNote}
          {trialStatus.trialOverrideAt && (
            <span className="text-gray-500 ml-2">(Set: {new Date(trialStatus.trialOverrideAt).toLocaleString()})</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[100px]">
          <label className="text-[9px] text-gray-500 font-bold block mb-1 uppercase">Trial Days (Custom)</label>
          <input
            type="number"
            min="1"
            max="365"
            value={trialDaysInput}
            onChange={e => setTrialDaysInput(e.target.value)}
            className="w-full bg-[#161B22] border border-amber-500/30 text-white text-xs font-black px-3 py-2 rounded-lg focus:outline-none focus:border-amber-400"
            placeholder="e.g. 7"
          />
        </div>
        <div className="flex-[2] min-w-[160px]">
          <label className="text-[9px] text-gray-500 font-bold block mb-1 uppercase">Admin Note (Optional)</label>
          <input
            type="text"
            value={trialNoteInput}
            onChange={e => setTrialNoteInput(e.target.value)}
            className="w-full bg-[#161B22] border border-white/10 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-white/30"
            placeholder="e.g. Extended for demo, special case"
          />
        </div>
        <button
          onClick={() => saveTrial(false)}
          disabled={trialSaving || !trialDaysInput}
          className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg font-black text-[10px] transition-all disabled:opacity-50 active:scale-95"
        >
          {trialSaving ? 'Saving...' : 'SET CUSTOM TRIAL'}
        </button>
        <button
          onClick={() => saveTrial(true)}
          disabled={trialSaving}
          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg font-bold text-[10px] transition-all disabled:opacity-50 active:scale-95"
        >
          RESET TO DEFAULT
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] text-gray-500 font-bold uppercase self-center">Quick Set:</span>
        {[1, 2, 3, 4, 7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setTrialDaysInput(String(d))}
            className={`px-2 py-1 rounded text-[9px] font-black border transition-all ${
              parseInt(trialDaysInput) === d
                ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                : 'bg-white/5 text-gray-400 border-white/10 hover:border-amber-500/30 hover:text-amber-300'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>
    </div>
  );
}

const formatIST = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const dStr = d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const tStr = d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `${dStr} at ${tStr}`;
};

export default function AdminPortal({ initialTab = 'STUDENTS' }) {
  const {
    monthlySubCost, setMonthlySubCost, isServerOnline,
    creditWallet, debitWallet,
    adminConfig, updateAdminConfig,
    tokenExchangeRate, setTokenExchangeRate,
    user, setUser,
    membershipPlans: contextPlans, fetchPlans
  } = useTrading();

  // Login credentials states
  
  const [signupRequests, setSignupRequests] = useState([]);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [membershipPlans, setMembershipPlans] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedAuditPayment, setSelectedAuditPayment] = useState(null);
  const [referralMonthFilter, setReferralMonthFilter] = useState('ALL');
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const fetchDashboard = () => setFetchTrigger(prev => prev + 1);

  // Normalize backend-provided collections into arrays for safe rendering.
  const normalizeToArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'object') {
      if (Array.isArray(value.data)) return value.data;
      if (Array.isArray(value.items)) return value.items;
      const vals = Object.values(value);
      if (vals.length && vals.every(v => v && typeof v === 'object')) return vals;
      return [value];
    }
    return [];
  };



  const approveSignupRequest = async (requestId, tempPassword) => {
    try {
      const res = await apiClient.post('/admin/approve-signup', { requestId, tempPassword });
      setSignupRequests(prev => prev.filter(r => r.id !== requestId));
      fetchDashboard(); // Refresh student list
      return res.data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const rejectSignupRequest = async (requestId) => {
    try {
      await apiClient.post('/admin/reject-signup', { requestId });
      setSignupRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error(err);
    }
  };

  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPhoneInput, setAdminPhoneInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Sync with global auth state
  useEffect(() => {
    if (user?.role?.toLowerCase() === 'admin') {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, [user]);

  const [authError, setAuthError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Lock backdoor states
  const [showBackdoor, setShowBackdoor] = useState(false);
  const [backdoorPassword, setBackdoorPassword] = useState('');
  const [backdoorError, setBackdoorError] = useState('');
  const [showBackdoorPassword, setShowBackdoorPassword] = useState(false);

  // Edit Admin Credentials states
  const [adminNameField, setAdminNameField] = useState(adminConfig?.name || '');
  const [adminEmailField, setAdminEmailField] = useState(adminConfig?.email || '');
  const [adminPhoneField, setAdminPhoneField] = useState(adminConfig?.phone || '');
  const [adminPasswordField, setAdminPasswordField] = useState(adminConfig?.password || '');
  const [adminLockedField, setAdminLockedField] = useState(adminConfig?.isLocked || false);
  const [showAdminSettingsPassword, setShowAdminSettingsPassword] = useState(false);

  // Dynamic Plans Form States
  const [planNameInput, setPlanNameInput] = useState('');
  const [planDaysInput, setPlanDaysInput] = useState('');
  const [planPriceInput, setPlanPriceInput] = useState('');
  const [planDescInput, setPlanDescInput] = useState('');

  // Token Price Exchange Rate State
  const [tokenPriceInput, setTokenPriceInput] = useState(tokenExchangeRate?.toString() || '1');

  // Algo Token Charges State & Handlers
  const [algoConnectionTiers, setAlgoConnectionTiers] = useState([
    { minLots: 1, maxLots: 5, tokens: 3800 },
    { minLots: 6, maxLots: 10, tokens: 7600 },
    { minLots: 11, maxLots: 15, tokens: 11400 }
  ]);

  const [algoBrokerageTiers, setAlgoBrokerageTiers] = useState([
    { minLots: 1, maxLots: 2, buyTokens: 10, sellTokens: 10 },
    { minLots: 3, maxLots: 5, buyTokens: 12, sellTokens: 12 },
    { minLots: 6, maxLots: 10, buyTokens: 15, sellTokens: 15 }
  ]);

  const [algoChargesLoading, setAlgoChargesLoading] = useState(false);
  const [algoChargesMsg, setAlgoChargesMsg] = useState(null);

  const fetchAlgoCharges = useCallback(async () => {
    setAlgoChargesLoading(true);
    try {
      const res = await apiClient.get('/admin/charges');
      if (res.data?.success && res.data.charges) {
        const c = res.data.charges;
        if (c.algoConnectionCharges?.tiers) {
          setAlgoConnectionTiers(c.algoConnectionCharges.tiers);
        }
        if (c.algoBrokerage?.tiers) {
          setAlgoBrokerageTiers(c.algoBrokerage.tiers);
        }
      }
    } catch (err) {
      console.error('Failed to fetch charges:', err);
    } finally {
      setAlgoChargesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAlgoCharges();
    }
  }, [isAuthenticated, fetchAlgoCharges]);

  // Student Drilldown & Audit States
  const [studentAuditModal, setStudentAuditModal] = useState(null);
  const [studentAlgoModal, setStudentAlgoModal] = useState(null);
  const [trialOverrideModal, setTrialOverrideModal] = useState(null);
  const [manualReserves, setManualReserves] = useState([]);
  const [optionChainStatus, setOptionChainStatus] = useState(null);

  const fetchStudentLoginHistory = async (student) => {
    try {
      const res = await apiClient.get(`/admin/students/${student.id}/login-history`);
      if (res.data?.success) {
        setStudentAuditModal({ student, history: res.data.loginHistory || [] });
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load login history');
    }
  };

  const fetchStudentAlgoMonitoring = async (student) => {
    try {
      const res = await apiClient.get(`/admin/students/${student.id}/algo-monitoring`);
      if (res.data?.success) {
        setStudentAlgoModal({ student, monitoring: res.data.monitoring || res.data });
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load algo monitoring data');
    }
  };

  const handleSetTrialOverride = async (e) => {
    e.preventDefault();
    if (!trialOverrideModal?.student) return;
    try {
      const res = await apiClient.patch(`/admin/student/${trialOverrideModal.student.id}/trial`, {
        trialDays: Number(trialOverrideModal.trialDays || 7),
        note: trialOverrideModal.note || 'Admin Override'
      });
      if (res.data?.success) {
        alert(`Trial override updated for ${trialOverrideModal.student.name}!`);
        setTrialOverrideModal(null);
        fetchDashboard();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to set trial override');
    }
  };

  const fetchManualReserves = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/manual-reserves');
      if (res.data?.success) {
        setManualReserves(res.data.reserves || []);
      }
    } catch (_) {}
  }, []);

  const fetchOptionChainStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/trade/option-chain/status');
      if (res.data?.success) {
        setOptionChainStatus(res.data);
      }
    } catch (_) {}
  }, []);

  // Sync edits if config updates from local storage
  useEffect(() => {
    setAdminNameField(adminConfig?.name || '');
    setAdminEmailField(adminConfig?.email || '');
    setAdminPhoneField(adminConfig?.phone || '');
    setAdminPasswordField(adminConfig?.password || '');
    setAdminLockedField(adminConfig?.isLocked || false);
  }, [adminConfig]);

  // Sync token rate input if loaded from local storage
  useEffect(() => {
    setTokenPriceInput(tokenExchangeRate?.toString() || '1');
  }, [tokenExchangeRate]);

  // Live Market Data Health Monitor State
  const [liveHealth, setLiveHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const fetchLiveHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await apiClient.get('/admin/live-market-health');
      setLiveHealth(res.data);
    } catch (_) {}
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    fetchLiveHealth();
    const interval = setInterval(fetchLiveHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveHealth]);

  // Active Tab within Admin Panel
  const [adminTab, setAdminTab] = useState(initialTab || 'STUDENTS');

  useEffect(() => {
    if (initialTab) {
      setAdminTab(initialTab);
    }
  }, [initialTab]);

  // Selected Student for detailed drills
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Student Filter & Search States
  const [studentFilter, setStudentFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'ACTIVE' | 'INACTIVE'
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  // Calculate Today's Accounts Count (Asia/Kolkata IST)
  const todayStudentsCount = React.useMemo(() => {
    const nowIndiaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return (students || []).filter(s => {
      const created = s.createdAt || s.trialStartedAt;
      if (!created) return false;
      const d = new Date(created);
      if (isNaN(d.getTime())) return false;
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === nowIndiaStr;
    }).length;
  }, [students]);

  // Filtered and Sorted Students List (Newest First)
  const filteredStudents = React.useMemo(() => {
    const nowIndiaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    let list = [...(students || [])];

    // Sort newest first
    list.sort((a, b) => {
      const dA = new Date(a.createdAt || a.trialStartedAt || 0).getTime();
      const dB = new Date(b.createdAt || b.trialStartedAt || 0).getTime();
      return dB - dA;
    });

    if (studentFilter === 'TODAY') {
      list = list.filter(s => {
        const created = s.createdAt || s.trialStartedAt;
        if (!created) return false;
        const d = new Date(created);
        if (isNaN(d.getTime())) return false;
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === nowIndiaStr;
      });
    } else if (studentFilter === 'ACTIVE') {
      list = list.filter(s => s.status === 'ACTIVE');
    } else if (studentFilter === 'INACTIVE') {
      list = list.filter(s => s.status !== 'ACTIVE');
    }

    if (studentSearchQuery.trim()) {
      const q = studentSearchQuery.toLowerCase().trim();
      list = list.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.studentId && s.studentId.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q))
      );
    }

    return list;
  }, [students, studentFilter, studentSearchQuery]);

  // Form states for manual adjustments
  const [manualAmount, setManualAmount] = useState('');
  const [manualCategory, setManualCategory] = useState('recharge');
  const [manualAction, setManualAction] = useState('credit');
  
  // Password Reset state
  const [newPasswordVal, setNewPasswordVal] = useState('');

  // Change Admin Password state
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [changePassLoading, setChangePassLoading] = useState(false);
  const [changePassError, setChangePassError] = useState('');
  const [changePassSuccess, setChangePassSuccess] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const handleChangeAdminPassword = async (e) => {
    e.preventDefault();
    setChangePassError('');
    setChangePassSuccess('');

    if (!currentAdminPass) {
      setChangePassError('Please enter your current admin password.');
      return;
    }
    if (!newAdminPass || newAdminPass.length < 5) {
      setChangePassError('New password must be at least 5 characters long.');
      return;
    }
    if (newAdminPass !== confirmAdminPass) {
      setChangePassError('New password and confirm password do not match.');
      return;
    }

    setChangePassLoading(true);
    try {
      const res = await apiClient.post('/admin/change-password', {
        currentPassword: currentAdminPass,
        newPassword: newAdminPass
      });
      setChangePassSuccess(res.data?.message || 'Admin password updated successfully. Logging out...');
      setCurrentAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');

      setTimeout(async () => {
        await handleLogout();
      }, 1500);
    } catch (err) {
      setChangePassError(err.response?.data?.error || 'Failed to update admin password.');
    } finally {
      setChangePassLoading(false);
    }
  };

  // Signup temp password states
  const [tempPasswordInputs, setTempPasswordInputs] = useState({});

  // Subscription Fee input state
  const [subCostInput, setSubCostInput] = useState(monthlySubCost.toString());

  // Fetch admin dashboard data
  useEffect(() => {
    if (isAuthenticated) {
      const fetchDashboardData = async () => {
        try {
          const res = await apiClient.get('/admin/dashboard');
          if (res.data) {
            setSignupRequests(normalizeToArray(res.data.signupRequests || []));
            setStudents(normalizeToArray(res.data.students || []));
            setPayments(normalizeToArray(res.data.payments || []));
            // Build audit trail from recent payments
            const logs = (res.data.payments || []).slice(0, 50).map(p => {
              const actual = (p.actualAmount !== null && p.actualAmount !== undefined) ? p.actualAmount : p.amount;
              const hasDiff = p.actualAmount !== null && p.actualAmount !== undefined && p.actualAmount !== p.amount;
              let actionText = '';
              if (p.status === 'APPROVED') {
                actionText = `Payment APPROVED — Recv: ₹${actual.toLocaleString()}${hasDiff ? ` (Claimed: ₹${p.amount.toLocaleString()})` : ''} — ${p.user?.name || 'Unknown'}`;
              } else if (p.status === 'REJECTED') {
                actionText = `Payment REJECTED — Claimed: ₹${p.amount.toLocaleString()} — ${p.user?.name || 'Unknown'}`;
              } else {
                actionText = `Payment PENDING — Claimed: ₹${p.amount.toLocaleString()} — ${p.user?.name || 'Unknown'}`;
              }
              return {
                id: p.id,
                payment: p,
                action: actionText,
                actualAmount: actual,
                claimedAmount: p.amount,
                reason: p.reason,
                status: p.status,
                user: p.user,
                timestamp: new Date(p.timestamp).toLocaleString()
              };
            });
            setAuditLogs(logs);
          }

          // Fetch active membership plans
          try {
            const plansRes = await apiClient.get('/membership/plans');
            if (plansRes.data?.plans) {
              setMembershipPlans(plansRes.data.plans);
            }
          } catch (_) {}
        } catch (err) {
          console.error('Failed to load admin dashboard', err);
        }
      };
      fetchDashboardData();
    }
  }, [isAuthenticated, adminTab, fetchTrigger]);

  // Admin is authenticated via global user context (user.role === 'ADMIN')

  const handleLogin = async (e) => {
    e.preventDefault();
    const identifier = adminEmailInput.trim() || adminPhoneInput.trim();
    if (!identifier || !adminPasswordInput) {
      setAuthError('Please enter your admin email or phone number, and password.');
      return;
    }

    try {
      // 1. Authenticate with actual backend
      const res = await apiClient.post('/auth/login', {
        identifier: identifier,
        password: adminPasswordInput
      });

      // 2. Enforce Admin Role Security (case-insensitive)
      if (res.data.user && String(res.data.user.role || '').trim().toLowerCase() === 'admin') {
        setIsAuthenticated(true);
        setAuthError('');
        setUser(res.data.user); // Update global context user
        fetchDashboard();       // Trigger admin dashboard refetch now that we have cookies
      } else {
        setAuthError('UNAUTHORIZED: Account does not have Superadmin privileges.');
        // Clean up the cookie since they aren't admin but the backend logged them in
        await apiClient.post('/auth/logout');
      }
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Invalid Admin Email, Phone, or Password.');
    }
  };

  const handleBackdoorUnlock = (e) => {
    e.preventDefault();
    if (backdoorPassword === (adminConfig?.password || '')) {
      setIsAuthenticated(true);
      setAuthError('');
      setShowBackdoor(false);
      setBackdoorPassword('');
      updateAdminConfig({ isLocked: false }); // unlock lock screen
      if (typeof window !== 'undefined') {
        
      }
      alert('Backdoor Triggered: Admin Panel successfully unlocked and logged in!');
    } else {
      setBackdoorError('Incorrect Master Password.');
    }
  };

  const handleLogout = async () => {
    try { await apiClient.post('/auth/logout'); } catch(_) {}
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleSaveSubCost = () => {
    const cost = Number(subCostInput);
    if (isNaN(cost) || cost <= 0) {
      alert("Invalid price value.");
      return;
    }
    setMonthlySubCost(cost);
    alert(`Monthly subscription cost updated to ${cost} tokens!`);
  };

  const handleSaveAdminConfig = () => {
    if (!adminNameField || !adminEmailField || !adminPhoneField || !adminPasswordField) {
      alert("Please fill in all security fields.");
      return;
    }
    updateAdminConfig({
      name: adminNameField,
      email: adminEmailField,
      phone: adminPhoneField,
      password: adminPasswordField,
      isLocked: adminLockedField
    });
    alert("Admin security configuration updated successfully!");
  };

  const handleSaveTokenPrice = async () => {
    const rate = Number(tokenPriceInput);
    if (isNaN(rate) || rate <= 0) {
      alert("Invalid price conversion rate.");
      return;
    }

    try {
      const res = await apiClient.post('/admin/token-price', { tokenPrice: rate });
      if (res.data?.success) {
        setTokenExchangeRate(rate);
        alert(`Token price rate successfully set and saved to database: 1 Token = ₹${rate} INR`);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update token exchange rate');
    }
  };

  const handleAddPlan = async (e) => {
    e.preventDefault();
    const days = Number(planDaysInput);
    const price = Number(planPriceInput);
    if (isNaN(days) || days <= 0 || isNaN(price) || price <= 0) {
      alert("Plan duration and token price must be positive numericals.");
      return;
    }

    try {
      const res = await apiClient.post('/admin/plans', {
        name: planNameInput,
        durationDays: days,
        price: price,
        description: planDescInput
      });

      if (res.data?.success) {
        const createdPlan = res.data.plan;
        setPlanNameInput('');
        setPlanDaysInput('');
        setPlanPriceInput('');
        setPlanDescInput('');
        alert(`Membership plan "${createdPlan.name}" (${createdPlan.durationDays} Days, ₹${createdPlan.price}) created and saved to database!`);
        
        // Refresh plans list immediately in UI
        const plansRes = await apiClient.get('/membership/plans');
        if (plansRes.data?.plans) {
          setMembershipPlans(plansRes.data.plans);
        }
        if (fetchPlans) fetchPlans();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create membership plan');
    }
  };

  const handleSaveAlgoCharges = async () => {
    // Validate connection tiers
    for (let i = 0; i < algoConnectionTiers.length; i++) {
      const t = algoConnectionTiers[i];
      if (t.minLots <= 0 || t.maxLots <= 0 || t.tokens < 0 || t.minLots > t.maxLots) {
        alert(`Invalid connection tier #${i + 1}: minLots, maxLots, and tokens must be positive with minLots <= maxLots.`);
        return;
      }
    }
    // Validate brokerage tiers
    for (let i = 0; i < algoBrokerageTiers.length; i++) {
      const t = algoBrokerageTiers[i];
      if (t.minLots <= 0 || t.maxLots <= 0 || t.buyTokens < 0 || t.sellTokens < 0 || t.minLots > t.maxLots) {
        alert(`Invalid brokerage tier #${i + 1}: minLots, maxLots, buyTokens, and sellTokens must be non-negative with minLots <= maxLots.`);
        return;
      }
    }

    try {
      setAlgoChargesMsg(null);
      const res = await apiClient.put('/admin/charges', {
        algoConnectionTiers,
        algoBrokerageTiers
      });
      if (res.data?.success) {
        setAlgoChargesMsg({ type: 'success', text: 'Algo token charges successfully saved to database!' });
        await fetchAlgoCharges();
      }
    } catch (err) {
      setAlgoChargesMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save algo charges' });
    }
  };

  const activeDrillStudent = (students || []).find(s => s.id === selectedStudentId) || null;

  // Calculate Revenue Metrics from local payments state
  const revenueMetrics = React.useMemo(() => {
    const totalRecharges = (payments || [])
      .filter(r => r.status === 'APPROVED')
      .reduce((s, r) => s + ((r.actualAmount !== null && r.actualAmount !== undefined) ? r.actualAmount : (r.amount || 0)), 0);

    const pendingAmount = (payments || [])
      .filter(r => r.status === 'PENDING')
      .reduce((s, r) => s + (r.amount || 0), 0);

    const activeUsers = (students || []).filter(s => s.status === 'ACTIVE').length;
    const totalReferralsAwarded = (payments || []).filter(r => r.status === 'APPROVED').length;

    return { totalRecharges, pendingAmount, activeUsers, totalReferralsAwarded };
  }, [students, payments]);

  // ─── Render "Coming Soon" Lock Screen ───
  if (adminConfig.isLocked && !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-[#0b0e14] font-mono text-xs text-[#bbc9cf] p-4 select-none">
        <div className="bg-[#10131a] border border-red-500/20 rounded-2xl w-full max-w-md p-8 shadow-[0_0_50px_rgba(239,68,68,0.1)] space-y-6 text-center">
          
          <div className="flex flex-col items-center gap-2.5">
            {/* Double click key lock triggers backdoor */}
            <div 
              onDoubleClick={() => setShowBackdoor(true)}
              className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 cursor-pointer hover:bg-red-500/20 transition-all active:scale-95"
              title="Double click to reveal backdoor settings"
            >
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>
            <h2 className="text-lg font-black text-white tracking-widest uppercase">COMING SOON</h2>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Hello Trader Admin Management environment is undergoing scheduled maintenance. 
              Password checking attempts are suspended.
            </p>
          </div>

          <div className="bg-[#0b0e14] border border-[#3c494e]/30 p-4 rounded-xl text-[10px] text-gray-400">
            🔒 IP logs and device fingerprints are recorded. Unauthorized attempts will trigger network blockades.
          </div>

          {/* Backdoor Login Form */}
          {showBackdoor && (
            <form onSubmit={handleBackdoorUnlock} className="space-y-3 pt-4 border-t border-white/5 animate-fadeIn">
              <div>
                <label className="block text-left text-gray-400 font-bold mb-1">MASTER KEY PASSWORD</label>
                <div className="relative">
                  <input 
                    type={showBackdoorPassword ? "text" : "password"}
                    value={backdoorPassword}
                    onChange={e => setBackdoorPassword(e.target.value)}
                    placeholder="ENTER 12 DIGIT PASSWORD"
                    className="w-full bg-[#0b0e14] border border-[#3c494e]/50 pl-3 pr-10 py-2 rounded text-white text-center focus:outline-none focus:border-red-500 font-mono text-[10px]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowBackdoorPassword(!showBackdoorPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    {showBackdoorPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {backdoorError && <div className="text-red-400 text-[10px] font-bold">{backdoorError}</div>}
              
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowBackdoor(false)}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded font-bold transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded transition-colors"
                >
                  UNLOCK SYSTEM
                </button>
              </div>
            </form>
          )}

          <div className="text-[9px] text-gray-600">
            © 2026 Hello Trader Institute Support Desk.
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Admin Login Panel (Regular Credential Check) ───
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0e14] font-mono text-xs text-[#bbc9cf] px-4">
        <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">ADMIN TERMINAL</h2>
            <p className="text-[10px] text-gray-500">Superadmin Credentials Verification REQUIRED</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-gray-400 font-bold mb-1">ADMIN EMAIL ADDRESS</label>
              <input 
                type="email" 
                value={adminEmailInput}
                onChange={e => setAdminEmailInput(e.target.value)}
                placeholder="your admin email"
                autoComplete="off"
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-red-500 font-bold"
              />
              <p className="text-[10px] text-gray-500 mt-1">Or leave blank and use phone number below.</p>
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1">ADMIN PHONE NUMBER</label>
              <input 
                type="text" 
                value={adminPhoneInput}
                onChange={e => setAdminPhoneInput(e.target.value)}
                placeholder="0000000000"
                autoComplete="off"
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-red-500 font-bold"
              />
              <p className="text-[10px] text-gray-500 mt-1">Use either your admin email or phone number to sign in.</p>
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1">PASSWORD</label>
              <div className="relative">
                <input 
                  type={showAdminPassword ? "text" : "password"}
                  value={adminPasswordInput}
                  onChange={e => setAdminPasswordInput(e.target.value)}
                  placeholder="ENTER 12 DIGIT PASSWORD"
                  autoComplete="new-password"
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 pl-3 pr-10 py-2 rounded text-white focus:outline-none focus:border-red-500 font-mono text-[10px]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            {authError && (
              <div className="text-red-400 font-bold text-[10px] bg-red-500/10 p-2 rounded border border-red-500/30 text-center">
                {authError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-extrabold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              AUTHENTICATE SESSION
            </button>
          </form>
          
          <div className="text-[9px] text-gray-650 text-center">
            Authorized admin personnel only. System is monitored.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono space-y-4 overflow-y-auto">
      {/* Top Banner */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              ADMIN CONTROL CENTER
              <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">{adminConfig.name} (Superadmin)</span>
            </h1>
            <p className="text-xs text-gray-400">Risk management, signup requests, deposit approvals, and ledgers audit controls</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {/* Subscription Fee Config */}
          <div className="flex items-center gap-1.5 bg-[#0b0e14] border border-[#3c494e]/50 px-2 py-1 rounded-lg">
            <span className="text-[10px] text-gray-400 font-bold uppercase">Monthly Price</span>
            <input 
              type="number"
              value={subCostInput}
              onChange={e => setSubCostInput(e.target.value)}
              className="w-12 bg-transparent text-center border-b border-white/20 focus:border-[#00d4ff] text-white font-extrabold focus:outline-none"
            />
            <button 
              onClick={handleSaveSubCost}
              className="text-[#00d4ff] hover:text-white transition-colors"
              title="Save Price"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={handleLogout}
            className="px-3 py-1.5 bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-gray-400 hover:text-red-400 rounded-lg text-xs transition-all active:scale-95"
          >
            LOGOUT
          </button>
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-[#161B22] p-1 rounded-xl border border-white/10 text-[10px] font-bold">
        {[
          { id: 'STUDENTS', label: 'STUDENT DIRECTORY', icon: Users },
          { id: 'STATIC_IP', label: '🌐 STATIC IP FLEET', icon: Globe, highlight: true },
          { id: 'PARTNERS', label: '🤝 PARTNER BUSINESS HUB', icon: Users },
          { id: 'CRM', label: '⚡ CRM & LEADS HUB', icon: Sparkles },
          { id: 'SOCIAL', label: 'AI SOCIAL MEDIA', icon: Share2 },
          { id: 'SIGNUPS', label: 'SIGNUP REQUESTS', icon: UserPlus, badge: signupRequests.length },
          { id: 'DEPOSITS', label: 'PENDING DEPOSITS', icon: CreditCard, badge: (payments || []).filter(r => r.status === 'PENDING').length },
          { id: 'PAYMENTS', label: 'PAYMENT MANAGER', icon: CreditCard },
          { id: 'REFERRALS', label: 'REFERRALS VERIFY', icon: UserCheck, badge: 0 },
          { id: 'ADJUSTMENTS', label: 'MANUAL LEDGER / REVERSAL', icon: ArrowRightLeft },
          { id: 'PROVIDER', label: 'PROVIDER SETTINGS', icon: Settings },
          { id: 'REVENUE', label: 'REVENUE & LOGS', icon: BarChart3 },
          { id: 'SECURITY', label: 'SECURITY & PLANS', icon: Key }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setAdminTab(tab.id)}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              adminTab === tab.id
                ? 'bg-[#00D4FF] text-black shadow-md font-black'
                : tab.highlight
                  ? 'text-[#00D4FF] border border-[#00D4FF]/40 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 font-bold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.badge > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[8px]">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {adminTab === 'PARTNERS' && <AdminPartnerManager />}
      {adminTab === 'SOCIAL' && <SocialMediaManager />}
      {adminTab === 'CRM' && <CrmDashboard />}
      {adminTab === 'STATIC_IP' && <AdminStaticIpManager />}
      {adminTab === 'STUDENTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-[#3c494e]/30 pb-2">
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#00d4ff]" /> STUDENT REGISTER
              </h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
                {filteredStudents.length} {studentFilter === 'TODAY' ? 'TODAY' : 'TOTAL'}
              </span>
            </div>

            {/* Today's New Accounts Banner */}
            <div className="bg-gradient-to-r from-purple-900/30 to-[#00D4FF]/10 border border-purple-500/30 rounded-xl p-3 flex justify-between items-center">
              <div>
                <span className="text-[9px] font-bold text-gray-400 block uppercase">TODAY'S NEW ACCOUNTS (IST)</span>
                <span className="text-base font-black text-white">{todayStudentsCount} Registered Today</span>
              </div>
              <button
                onClick={() => setStudentFilter(studentFilter === 'TODAY' ? 'ALL' : 'TODAY')}
                className={`px-2.5 py-1 rounded text-[10px] font-black transition-all cursor-pointer ${
                  studentFilter === 'TODAY'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-white/10 hover:bg-white/20 text-purple-300 border border-purple-500/30'
                }`}
              >
                {studentFilter === 'TODAY' ? 'SHOW ALL' : 'FILTER TODAY'}
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1 text-[9px] font-bold">
              {[
                { id: 'ALL', label: `ALL (${students.length})` },
                { id: 'TODAY', label: `TODAY (${todayStudentsCount})` },
                { id: 'ACTIVE', label: `ACTIVE (${(students || []).filter(s => s.status === 'ACTIVE').length})` },
                { id: 'INACTIVE', label: `INACTIVE (${(students || []).filter(s => s.status !== 'ACTIVE').length})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStudentFilter(f.id)}
                  className={`px-2 py-1 rounded transition-all cursor-pointer ${
                    studentFilter === f.id
                      ? 'bg-[#00D4FF] text-black font-black'
                      : 'bg-[#0B0E14] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div>
              <input
                type="text"
                placeholder="Search name, ID, email, mobile..."
                value={studentSearchQuery}
                onChange={e => setStudentSearchQuery(e.target.value)}
                className="w-full bg-[#0B0E14] border border-white/10 p-2 rounded text-[10px] text-white outline-none focus:border-[#00D4FF]"
              />
            </div>

            {/* Student Cards List */}
            <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
              {filteredStudents.length === 0 ? (
                <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-4 text-center text-[10px] text-gray-500">
                  No accounts found matching filter.
                </div>
              ) : (
                filteredStudents.map(s => {
                  const createdDate = s.createdAt ? new Date(s.createdAt) : null;
                  const istDateStr = createdDate ? createdDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
                  const istTimeStr = createdDate ? createdDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                  const nowIndiaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                  const isRegisteredToday = createdDate && createdDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === nowIndiaStr;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedStudentId(s.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        s.id === selectedStudentId
                          ? 'bg-[#00d4ff]/10 border-[#00d4ff]'
                          : isRegisteredToday
                          ? 'bg-purple-900/20 border-purple-500/40 hover:border-purple-500'
                          : 'bg-[#0b0e14] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.isOnline ? 'bg-[#00e639]' : 'bg-gray-600'}`} />
                          <span className="font-bold text-white text-[11px] truncate">{s.name}</span>
                          {isRegisteredToday && (
                            <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[8px] px-1 rounded font-black">
                              NEW TODAY
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className={`px-1 py-0.2 rounded text-[7px] font-extrabold ${s.isOnline ? 'bg-[#00e639]/15 text-[#00e639] border border-[#00e639]/30' : 'bg-white/5 text-gray-400 border border-white/5'}`}>
                            {s.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                          <span className={`px-1 py-0.2 rounded text-[7px] font-extrabold ${s.status === 'ACTIVE' ? 'bg-[#00e639]/10 text-[#00e639]' : 'bg-red-500/10 text-red-400'}`}>
                            {s.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between text-[9px] text-gray-400 font-mono mb-0.5">
                        <span>ID: <strong className="text-white">{s.studentId}</strong></span>
                        <span>Mob: {s.phone || '—'}</span>
                      </div>

                      <div className="space-y-0.5 border-t border-white/5 pt-1.5 mt-1 text-[9px] text-gray-400 font-mono">
                        <div className="flex justify-between">
                          <span>Registered (IST):</span>
                          <span className="text-purple-300 font-bold">{s.createdAt ? formatIST(s.createdAt) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Last Login (IST):</span>
                          <span className="text-cyan-400 font-bold">
                            {s.lastLoginTimestamp ? formatIST(s.lastLoginTimestamp) : 'NEVER LOGGED IN'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Last Seen (IST):</span>
                          <span className="text-amber-400 font-bold">
                            {s.lastSeenAt ? formatIST(s.lastSeenAt) : 'NEVER SEEN'}
                          </span>
                        </div>
                      </div>

                      <div className="text-[9px] text-gray-400 text-left pt-1.5 mt-1 border-t border-white/5 font-bold flex justify-between">
                        <span>Bal: ₹{((s.wallets?.find(w => w.type === 'PAPER')?.balance || 0) + (s.wallets?.find(w => w.type === 'TOKEN')?.balance || 0)).toLocaleString()}</span>
                        <span>Refs: {(students || []).filter(x => x.referredBy === s.referralCode).length} Total</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 mt-2 border-t border-white/5">
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Initiate Admin Support Mode for ${s.name} (${s.studentId})?`)) return;
                            try {
                              const masterPassword = formatIST(s.createdAt);
                              const res = await apiClient.post('/auth/support-login', {
                                studentId: s.studentId,
                                masterPassword
                              });
                              if (res.data && res.data.success) {
                                alert(`Admin Support Mode activated for ${s.name}!`);
                                window.location.href = '/';
                              }
                            } catch (err) {
                              alert(err.response?.data?.error || 'Support login failed.');
                            }
                          }}
                          className="w-full py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black font-extrabold rounded text-[9px] transition-all cursor-pointer border border-amber-500/30 uppercase text-center"
                        >
                          Support Login
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <Laptop className="w-4 h-4 text-purple-400" /> STUDENT CONTROL DECK ({activeDrillStudent?.name || 'No Student Selected'})
            </h2>

            {activeDrillStudent ? (
              <div className="space-y-4 font-mono">
                {/* User Info & Referral Origin Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0B0E14] p-3.5 rounded-xl border border-white/5 text-[11px]">
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">EMAIL ADDRESS</span>
                    <span className="font-bold text-white truncate block">{activeDrillStudent.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">MOBILE PHONE</span>
                    <span className="font-bold text-white">{activeDrillStudent.phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">ACCOUNT CREATED</span>
                    <span className="font-bold text-gray-300 text-[10px]">
                      {new Date(activeDrillStudent.createdAt || activeDrillStudent.trialStartedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">MEMBERSHIP PLAN</span>
                    <span className={`font-bold ${activeDrillStudent.subscriptionActive ? 'text-[#00FF41]' : 'text-red-400'}`}>
                      {activeDrillStudent.subscriptionActive ? 'ACTIVE MEMBER' : 'TRIAL / INACTIVE'}
                    </span>
                  </div>
                </div>

                {/* Login & Online Activity Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[#0B0E14] p-3.5 rounded-xl border border-white/5 text-[11px] items-center">
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">ONLINE STATUS</span>
                    <span className={`font-bold flex items-center gap-1.5 ${activeDrillStudent.isOnline ? 'text-[#00FF41]' : 'text-gray-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${activeDrillStudent.isOnline ? 'bg-[#00FF41] animate-pulse' : 'bg-gray-600'}`} />
                      {activeDrillStudent.isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">LAST LOGIN (IST)</span>
                    <span className="font-bold text-cyan-400">
                      {activeDrillStudent.lastLoginTimestamp ? formatIST(activeDrillStudent.lastLoginTimestamp) : 'NEVER LOGGED IN'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px] font-bold">LAST SEEN (IST)</span>
                    <span className="font-bold text-amber-400">
                      {activeDrillStudent.lastSeenAt ? formatIST(activeDrillStudent.lastSeenAt) : 'NEVER SEEN'}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => fetchStudentLoginHistory(activeDrillStudent)}
                      className="px-3 py-1.5 bg-[#00D4FF]/25 hover:bg-[#00D4FF] text-[#00D4FF] hover:text-black font-extrabold rounded text-[10px] border border-[#00D4FF]/40 tracking-wider transition-all"
                    >
                      VIEW LOGIN HISTORY
                    </button>
                  </div>
                </div>

                {/* Referral Source & Origin Card */}
                {(() => {
                  const referrerUser = (students || []).find(s => s.referralCode === activeDrillStudent.referredBy);
                  const studentRefs = (students || []).filter(x => x.referredBy === activeDrillStudent.referralCode);
                  const totalRefs = studentRefs.length;
                  const currentCycle = totalRefs % 3;
                  const completedCycles = Math.floor(totalRefs / 3);

                  return (
                    <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/10 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#00D4FF]" />
                          <h3 className="font-extrabold text-xs text-white uppercase">REFERRAL ORIGIN & REWARD AUDIT</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[#00D4FF]/10 text-[#00D4FF] text-[10px] font-bold">
                          OWN REF CODE: {activeDrillStudent.referralCode || `REF${activeDrillStudent.studentId}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Signup Source */}
                        <div className="bg-[#161B22] p-3 rounded-lg border border-white/5 space-y-1">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">SIGNUP REGISTRATION SOURCE</span>
                          {activeDrillStudent.referredBy ? (
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-[#00FF41] block">
                                🔗 Referred by: {referrerUser ? referrerUser.name : 'Referral Code Owner'}
                              </span>
                              <span className="text-[10px] text-gray-400 block">
                                Referrer ID: {referrerUser ? referrerUser.studentId : activeDrillStudent.referredBy} ({activeDrillStudent.referredBy})
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-[#00D4FF] block">
                                🌐 Joined via Main Website Link (Organic)
                              </span>
                              <span className="text-[10px] text-gray-400 block">No referral code used during registration.</span>
                            </div>
                          )}
                        </div>

                        {/* 3-Referral Reward Progress Tracker */}
                        <div className="bg-[#161B22] p-3 rounded-lg border border-white/5 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400 font-bold uppercase">3-REFERRAL REWARD GOAL</span>
                            <span className="font-extrabold text-[#00D4FF]">{currentCycle} / 3 Completed</span>
                          </div>
                          {/* Progress Bar */}
                          <div className="w-full h-2 bg-[#0b0e14] rounded-full overflow-hidden border border-white/5">
                            <div 
                              className="h-full bg-gradient-to-r from-[#00D4FF] to-[#00FF41] transition-all duration-300"
                              style={{ width: `${(currentCycle / 3) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[9px] text-gray-400 pt-0.5">
                            <span>Total Referrals: <strong className="text-white">{totalRefs} Users</strong></span>
                            <span>Reward Milestones Won: <strong className="text-[#00FF41]">{completedCycles} Wins</strong></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Operations Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-2">
                    <span className="font-extrabold text-[10px] text-gray-400 block uppercase">Account Access Status</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          try {
                            await apiClient.post('/admin/set-user-status', { userId: activeDrillStudent.id, status: 'ACTIVE' });
                            fetchDashboard();
                          } catch(err) { alert(err.response?.data?.error || 'Failed'); }
                        }}
                        className={`flex-1 py-1.5 rounded text-[10px] font-bold ${activeDrillStudent.status === 'ACTIVE' ? 'bg-[#00e639] text-black' : 'bg-white/5 text-white'}`}
                      >
                        ACTIVATE
                      </button>
                      <button 
                        onClick={async () => {
                          try {
                            await apiClient.post('/admin/set-user-status', { userId: activeDrillStudent.id, status: 'LOCKED' });
                            fetchDashboard();
                          } catch(err) { alert(err.response?.data?.error || 'Failed'); }
                        }}
                        className={`flex-1 py-1.5 rounded text-[10px] font-bold ${activeDrillStudent.status === 'LOCKED' ? 'bg-red-500 text-white' : 'bg-white/5 text-white'}`}
                      >
                        SUSPEND
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-2">
                    <span className="font-extrabold text-[10px] text-gray-400 block uppercase">Reset Password (Student)</span>
                    <div className="flex gap-1.5">
                      <input 
                        type="text" 
                        placeholder="New Password" 
                        value={newPasswordVal}
                        onChange={e => setNewPasswordVal(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 px-2 py-1 rounded text-white focus:outline-none"
                      />
                      <button 
                        onClick={async () => {
                          if(!newPasswordVal) return;
                          try {
                            await apiClient.post('/admin/reset-password', { userId: activeDrillStudent.id, newPassword: newPasswordVal });
                            setNewPasswordVal('');
                            alert('Password updated! Student can now login with the new password.');
                            fetchDashboard();
                          } catch(err) {
                            alert(err.response?.data?.error || 'Failed to reset password');
                          }
                        }}
                        className="bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black px-2.5 rounded font-black text-[10px]"
                      >
                        SET
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-2">
                    <span className="font-extrabold text-[10px] text-gray-400 block uppercase">Hardware Lock Signatures</span>
                    <button 
                      onClick={() => {
                        alert('Hardware signature lock feature coming soon.');
                      }}
                      className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded text-[10px] border border-white/10"
                    >
                      {activeDrillStudent.deviceLocked ? '🔓 UNLOCK HARDWARE DEVICE' : '🔒 LOCK HARDWARE SIGNATURE'}
                    </button>
                  </div>
                </div>
                 {/* ─── Trial Period Management ─────────────────────────── */}
                 <StudentTrialManager student={activeDrillStudent} onUpdate={fetchDashboard} />

                {/* Referred Students Calendar Log with Month Filter */}
                {(() => {
                  const studentRefs = students.filter(x => x.referredBy === activeDrillStudent.referralCode);
                  const filteredRefs = studentRefs.filter(refS => {
                    if (referralMonthFilter === 'ALL') return true;
                    const d = new Date(refS.createdAt || refS.trialStartedAt);
                    const monthYear = `${d.toLocaleString('default', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
                    return monthYear === referralMonthFilter;
                  });

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap justify-between items-center border-b border-white/5 pb-1">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          REFERRED STUDENTS REGISTER ({studentRefs.length} TOTAL)
                        </h3>
                        {/* Month Filter */}
                        <div className="flex items-center gap-1 text-[9px]">
                          <span className="text-gray-500 font-bold">MONTH:</span>
                          <select
                            value={referralMonthFilter}
                            onChange={e => setReferralMonthFilter(e.target.value)}
                            className="bg-[#0b0e14] border border-white/10 px-2 py-0.5 rounded text-white font-bold outline-none"
                          >
                            <option value="ALL">ALL MONTHS</option>
                            <option value="AUG 2026">AUG 2026</option>
                            <option value="JUL 2026">JUL 2026</option>
                            <option value="JUN 2026">JUN 2026</option>
                          </select>
                        </div>
                      </div>

                      <div className="bg-[#0B0E14] rounded-xl border border-white/5 p-3.5 space-y-2 max-h-40 overflow-y-auto">
                        {filteredRefs.length === 0 ? (
                          <div className="text-center text-gray-500 text-[10px] py-4">No student referrals found for selected month.</div>
                        ) : (
                          filteredRefs.map((refS, idx) => (
                            <div key={refS.id} className="flex flex-wrap items-center justify-between text-[10px] border-b border-white/5 pb-2 last:border-b-0 gap-2">
                              <div>
                                <span className="font-bold text-white block">
                                  #{idx + 1} {refS.name} ({refS.studentId})
                                </span>
                                <span className="text-[9px] text-gray-400 block">
                                  Phone: {refS.phone} // Email: {refS.email}
                                </span>
                                <span className="text-[9px] text-gray-500 font-mono block pt-0.5">
                                  📅 Signup Date & Time: {new Date(refS.createdAt || refS.trialStartedAt).toLocaleString()}
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${refS.subscriptionActive ? 'bg-[#00e639]/10 text-[#00e639] border border-[#00e639]/30' : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'}`}>
                                {refS.subscriptionActive ? 'ACTIVE MEMBER' : 'TRIAL MEMBER'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-10">Select a student from directory to inspect controls.</div>
            )}
          </div>
        </div>
      )}

      {adminTab === 'SIGNUPS' && (
        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
          <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
            <UserPlus className="w-4 h-4 text-[#00d4ff]" /> PENDING ENROLLMENT SIGNUPS
          </h2>

          {signupRequests.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-xs">No pending student enrollment request forms found in queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0b0e14] text-gray-400 font-bold border-b border-white/10">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Email Address</th>
                    <th className="py-2.5 px-3">Mobile Phone</th>
                    <th className="py-2.5 px-3">Referral Code</th>
                    <th className="py-2.5 px-3 text-center">Set Password & Approve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {signupRequests.map(r => {
                    const tempPass = tempPasswordInputs[r.id] || `HT@${Math.floor(1000 + Math.random() * 9000)}`;
                    return (
                      <tr key={r.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-3 text-gray-400">{r.timestamp}</td>
                        <td className="py-3 px-3 font-bold text-white">
                          {r.name}
                          {r.isDuplicateIp && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30" title="Another pending or approved request shares this IP">
                              [!] DUPLICATE IP
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">{r.email}</td>
                        <td className="py-3 px-3">{r.phone}</td>
                        <td className="py-3 px-3 font-bold text-purple-400">{r.referralCode || 'Direct'}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <input 
                              type="text" 
                              value={tempPass}
                              onChange={e => setTempPasswordInputs(prev => ({ ...prev, [r.id]: e.target.value }))}
                              placeholder="Temp Pass" 
                              className="bg-[#0b0e14] border border-white/15 px-2 py-1 rounded text-white text-[11px] w-24 text-center focus:outline-none"
                            />
                            <button
                              onClick={async () => {
                                try {
                                  const res = await approveSignupRequest(r.id, tempPass);
                                  const assignedId = res?.studentId || res?.user?.studentId || 'Assigned';
                                  const assignedPass = res?.tempPassword || tempPass;
                                  alert(`SignUp Approved Successfully!\n\nAccount Student ID: ${assignedId}\nTemporary Password: ${assignedPass}\n\nPlease share these credentials with the student.`);
                                } catch (err) {
                                  alert(err.response?.data?.error || 'Failed to approve signup request');
                                }
                              }}
                              className="px-2.5 py-1 bg-[#00e639] hover:bg-[#00c530] text-black font-extrabold rounded text-[10px]"
                            >
                              APPROVE
                            </button>
                            <button
                              onClick={() => {
                                rejectSignupRequest(r.id);
                                alert('SignUp request rejected.');
                              }}
                              className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded text-[10px] border border-red-500/35"
                            >
                              REJECT
                            </button>
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
      )}

      {adminTab === 'DEPOSITS' && (
        <AdminDepositsTab payments={payments} fetchData={fetchDashboard} selectedAuditPayment={selectedAuditPayment} setSelectedAuditPayment={setSelectedAuditPayment} />
      )}

      {adminTab === 'REFERRALS' && (
        <AdminReferralsTab />
      )}

      {adminTab === 'PAYMENTS' && (
        <AdminPaymentManager />
      )}

      {adminTab === 'ADJUSTMENTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <ArrowRightLeft className="w-4 h-4 text-purple-400" /> MANUAL LEDGER ADJUSTMENT
            </h2>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">SELECT TARGET STUDENT</label>
                <select 
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00D4FF]"
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (ID: {s.studentId})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1">ADJUSTMENT ACTION</label>
                  <select 
                    value={manualAction}
                    onChange={e => setManualAction(e.target.value)}
                    className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none"
                  >
                    <option value="credit">CREDIT / PUSH TOKENS (+)</option>
                    <option value="debit">DEBIT / PULL TOKENS (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">TOKEN CATEGORY</label>
                  <select 
                    value={manualCategory}
                    onChange={e => setManualCategory(e.target.value)}
                    className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none"
                  >
                    <option value="recharge">Recharge Tokens</option>
                    <option value="referral">Referral Tokens</option>
                    <option value="bonus">Bonus Tokens</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">TOKEN AMOUNT</label>
                <input 
                  type="number" 
                  value={manualAmount}
                  onChange={e => setManualAmount(e.target.value)}
                  placeholder="e.g. 500" 
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <button
                onClick={async () => {
                  const amt = Number(manualAmount);
                  if (isNaN(amt) || amt <= 0) {
                    alert("Please enter a valid positive token amount.");
                    return;
                  }
                  if (!selectedStudentId) {
                    alert("Please select a student from directory first.");
                    return;
                  }
                  try {
                    await apiClient.post('/admin/manual-ledger', {
                      userId: selectedStudentId,
                      amount: amt,
                      action: manualAction,
                      walletType: manualCategory
                    });
                    alert(`Successfully ${manualAction === 'credit' ? 'credited' : 'debited'} ${amt} ${manualCategory} tokens.`);
                    setManualAmount('');
                    fetchDashboard();
                  } catch (err) {
                    alert(err.response?.data?.error || "Failed to post ledger entry.");
                  }
                }}
                className="w-full py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded transition-all text-xs"
              >
                APPLY MANUAL CORRECTION ENTRY
              </button>
            </div>
          </div>

          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <RefreshCw className="w-4 h-4 text-red-400 animate-spin" style={{ animationDuration: '6s' }} /> REVERSE ACCIDENT TRANSACTIONS
            </h2>

            <div className="space-y-2 overflow-y-auto max-h-80">
              {payments.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No transactions logged in system ledgers yet.</div>
              ) : (
                payments
                  .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map(tx => (
                    <div key={tx.id} className="p-3 bg-[#0b0e14] rounded border border-white/5 flex items-center justify-between text-xs hover:border-red-500/30 transition-all">
                      <div>
                        <span className="font-bold text-white block">{tx.method || 'PAYMENT'}</span>
                        <span className="text-[10px] text-gray-400">Student: {tx.user?.name || tx.userId} // Status: {tx.status}</span>
                        <span className="text-[9px] text-gray-500 block">{new Date(tx.timestamp).toLocaleString()} // ID: {tx.id?.slice(0,8)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm text-[#00e639]">+₹{(tx.amount || 0).toLocaleString()}</span>
                        <button
                          onClick={() => {
                            alert('Transaction reversal: contact database admin to manually reverse ledger entry.');
                          }}
                          className="p-1 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded border border-red-500/35 transition-colors"
                          title="Reverse Transaction"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {adminTab === 'PROVIDER' && (
        <div className="mb-4">
          <ProviderSettings />
        </div>
      )}

      {adminTab === 'REVENUE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <BarChart3 className="w-4 h-4 text-[#00d4ff]" /> REVENUE PERFORMANCE
            </h2>

            <div className="space-y-4 text-xs">
              <div className="bg-[#0b0e14] p-3 rounded-lg border border-white/5">
                <span className="text-gray-400 text-[10px]">TOTAL COLLECTED CASH</span>
                <div className="text-2xl font-black text-[#00FF41] mt-1">₹{revenueMetrics.totalRecharges.toLocaleString()}</div>
                <span className="text-[9px] text-gray-500">From approved user deposits</span>
              </div>

              <div className="bg-[#0b0e14] p-3 rounded-lg border border-white/5">
                <span className="text-gray-400 text-[10px]">PENDING CASH PIPELINE</span>
                <div className="text-2xl font-black text-amber-500 mt-1">₹{revenueMetrics.pendingAmount.toLocaleString()}</div>
                <span className="text-[9px] text-gray-500">Awaiting receipt verification</span>
              </div>

              <div className="bg-[#0b0e14] p-3 rounded-lg border border-white/5">
                <div className="flex justify-between">
                  <div>
                    <span className="text-gray-400 text-[10px] block">ACTIVE TRADERS</span>
                    <span className="text-lg font-bold text-white">{revenueMetrics.activeUsers} Users</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block">TOTAL REF AWARDS</span>
                    <span className="text-lg font-bold text-[#00D4FF]">{revenueMetrics.totalReferralsAwarded} Wins</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3 flex flex-col min-h-[350px]">
            <div className="flex items-center justify-between border-b border-[#3c494e]/30 pb-2">
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-red-400" /> SYSTEM AUDIT LOGS & PAYMENT HISTORY
              </h2>
              <span className="text-[9px] text-gray-400 font-mono">Click any log entry to view receipt proof</span>
            </div>
            
            <div className="overflow-y-auto flex-1 max-h-80 space-y-2 font-mono">
              {auditLogs.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No audit logs recorded yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedAuditPayment(log.payment || log)}
                    className="p-2.5 bg-[#0b0e14] hover:bg-[#121722] rounded-lg border border-white/5 hover:border-[#00D4FF]/40 text-[10px] flex items-center justify-between gap-3 cursor-pointer transition-all shadow-sm group"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold shrink-0 ${
                        log.status === 'APPROVED' ? 'bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30' :
                        log.status === 'REJECTED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {log.status}
                      </span>
                      <div className="truncate">
                        <span className="text-white font-bold block truncate group-hover:text-[#00D4FF] transition-colors">
                          {log.action}
                        </span>
                        {log.reason && (
                          <span className="text-gray-400 text-[9px] block italic truncate">
                            Admin Note: "{log.reason}"
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <span className="text-gray-500 font-mono text-[9px]">{log.timestamp}</span>
                      <span className="px-2 py-0.5 bg-[#00D4FF]/10 text-[#00D4FF] rounded text-[9px] font-bold group-hover:bg-[#00D4FF] group-hover:text-black transition-all">
                        View Proof ➔
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {adminTab === 'SECURITY' && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Card 1: Admin Credentials */}
          <div className="bg-[#161B22] p-5 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2.5 flex items-center gap-1.5 uppercase text-[#00d4ff]">
              <Key className="w-4 h-4 text-[#00d4ff]" /> Admin Profile & Credentials
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-bold">ADMIN NAME</label>
                <input 
                  type="text"
                  value={adminNameField}
                  onChange={e => setAdminNameField(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff]"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 font-bold">ADMIN EMAIL ID</label>
                <input 
                  type="email"
                  value={adminEmailField}
                  onChange={e => setAdminEmailField(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff] font-bold"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 font-bold">ADMIN PHONE NUMBER</label>
                <input 
                  type="text"
                  value={adminPhoneField}
                  onChange={e => setAdminPhoneField(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff]"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 font-bold">ADMIN ACCESS PASSWORD</label>
                <div className="relative">
                  <input 
                    type={showAdminSettingsPassword ? "text" : "password"}
                    value={adminPasswordField}
                    onChange={e => setAdminPasswordField(e.target.value)}
                    className="w-full bg-[#0b0e14] border border-[#3c494e]/50 pl-3 pr-10 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff] font-bold font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminSettingsPassword(!showAdminSettingsPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    {showAdminSettingsPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0b0e14] p-3 rounded-lg border border-red-500/20 flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-white block">COMING SOON / LOCK MODE</span>
                <span className="text-[10px] text-gray-400">Lock the admin portal behind a placeholder coming soon page</span>
              </div>
              <input 
                type="checkbox"
                checked={adminLockedField}
                onChange={e => setAdminLockedField(e.target.checked)}
                className="w-4 h-4 accent-red-500 cursor-pointer"
              />
            </div>
            
            <button
              onClick={handleSaveAdminConfig}
              className="w-full py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded text-xs"
            >
              SAVE SECURITY PARAMETERS
            </button>
          </div>

          {/* Card: Change Admin Password */}
          <div className="bg-[#161B22] p-5 rounded-xl border border-red-500/30 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2.5 flex items-center gap-1.5 uppercase text-red-400">
              <Lock className="w-4 h-4 text-red-400" /> Change Admin Access Password
            </h2>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Verify your current admin password using bcrypt authentication and set a new secure password.
            </p>

            <form onSubmit={handleChangeAdminPassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-bold">CURRENT ADMIN PASSWORD</label>
                <div className="relative">
                  <input 
                    type={showCurrentPass ? "text" : "password"}
                    value={currentAdminPass}
                    onChange={e => setCurrentAdminPass(e.target.value)}
                    placeholder="Enter current admin password"
                    className="w-full bg-[#0b0e14] border border-[#3c494e]/50 pl-3 pr-10 py-2 rounded text-white focus:outline-none focus:border-red-500 font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-gray-400 mb-1 font-bold">NEW ADMIN PASSWORD</label>
                  <div className="relative">
                    <input 
                      type={showNewPass ? "text" : "password"}
                      value={newAdminPass}
                      onChange={e => setNewAdminPass(e.target.value)}
                      placeholder="Min 5 characters"
                      className="w-full bg-[#0b0e14] border border-[#3c494e]/50 pl-3 pr-10 py-2 rounded text-white focus:outline-none focus:border-red-500 font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1 font-bold">CONFIRM NEW PASSWORD</label>
                  <div className="relative">
                    <input 
                      type={showConfirmPass ? "text" : "password"}
                      value={confirmAdminPass}
                      onChange={e => setConfirmAdminPass(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full bg-[#0b0e14] border border-[#3c494e]/50 pl-3 pr-10 py-2 rounded text-white focus:outline-none focus:border-red-500 font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {changePassError && (
                <div className="text-red-400 text-[10px] font-bold bg-red-500/10 p-2.5 rounded border border-red-500/30">
                  {changePassError}
                </div>
              )}

              {changePassSuccess && (
                <div className="text-[#00FF41] text-[10px] font-bold bg-[#00FF41]/10 p-2.5 rounded border border-[#00FF41]/30">
                  {changePassSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={changePassLoading}
                className="w-full py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-extrabold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                {changePassLoading ? 'UPDATE IN PROGRESS...' : 'UPDATE ADMIN PASSWORD'}
              </button>
            </form>
          </div>

          {/* Card 2: Token Exchange Rate Settings */}
          <div className="bg-[#161B22] p-5 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2.5 flex items-center gap-1.5 uppercase text-amber-400">
              <CreditCard className="w-4 h-4 text-amber-400" /> Token Price & Exchange Config
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-bold">TOKEN PRICE RATE (1 Token = ₹X INR)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={tokenPriceInput}
                  onChange={e => setTokenPriceInput(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff] font-extrabold text-[#00d4ff]"
                />
              </div>
              <button
                onClick={handleSaveTokenPrice}
                className="py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded text-xs transition-colors"
              >
                UPDATE TOKEN PRICE RATE
              </button>
            </div>
          </div>

          {/* Card 3: Membership Plan Creation & Deletion */}
          <div className="bg-[#161B22] p-5 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2.5 flex items-center gap-1.5 uppercase text-purple-400">
              <FileText className="w-4 h-4 text-purple-400" /> Membership Tiers & Plans
            </h2>

            {/* List existing plans */}
            <div className="space-y-2">
              <span className="block text-gray-400 font-bold text-[10px] uppercase">ACTIVE PLANS</span>
              {membershipPlans.map(plan => (
                <div key={plan.id} className="p-3 bg-[#0b0e14] rounded-lg border border-white/5 flex items-center justify-between text-xs hover:border-[#00d4ff]/30 transition-all text-left">
                  <div>
                    <span className="font-bold text-white block">{plan.name}</span>
                    <span className="text-[10px] text-gray-400">{plan.durationDays} Days // Price: {plan.price} Tokens // {plan.description}</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (membershipPlans.length <= 1) {
                        alert("You must keep at least one active membership plan.");
                        return;
                      }
                      if (!confirm(`Are you sure you want to delete plan "${plan.name}"?`)) return;
                      try {
                        await apiClient.delete(`/admin/plans/${plan.id}`);
                        alert(`Plan "${plan.name}" deleted.`);
                        const plansRes = await apiClient.get('/membership/plans');
                        if (plansRes.data?.plans) {
                          setMembershipPlans(plansRes.data.plans);
                        }
                        if (fetchPlans) fetchPlans();
                      } catch (err) {
                        alert(err.response?.data?.error || 'Failed to delete plan');
                      }
                    }}
                    className="p-1.5 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded border border-red-500/35 transition-colors"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Plan form */}
            <form onSubmit={handleAddPlan} className="bg-[#0b0e14] p-4 rounded-lg border border-[#3c494e]/20 space-y-3">
              <span className="block text-gray-300 font-bold text-[10px] uppercase">CREATE NEW PLAN</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-gray-400 mb-1">PLAN NAME</label>
                  <input 
                    type="text"
                    required
                    value={planNameInput}
                    onChange={e => setPlanNameInput(e.target.value)}
                    placeholder="e.g. 180-Day VIP Pack"
                    className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2.5 py-1.5 rounded text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">DURATION (DAYS)</label>
                  <input 
                    type="number"
                    required
                    value={planDaysInput}
                    onChange={e => setPlanDaysInput(e.target.value)}
                    placeholder="e.g. 180"
                    className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2.5 py-1.5 rounded text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">PRICE (TOKENS)</label>
                  <input 
                    type="number"
                    required
                    value={planPriceInput}
                    onChange={e => setPlanPriceInput(e.target.value)}
                    placeholder="e.g. 4500"
                    className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2.5 py-1.5 rounded text-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-[10px]">DESCRIPTION</label>
                <input 
                  type="text"
                  required
                  value={planDescInput}
                  onChange={e => setPlanDescInput(e.target.value)}
                  placeholder="Summarize access privileges, greeks details, or indicators included..."
                  className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2.5 py-1.5 rounded text-white focus:outline-none text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-purple-500 hover:bg-purple-600 text-white font-extrabold rounded text-xs transition-colors"
              >
                ADD PLAN TO PORTAL LIST
              </button>
            </form>

          </div>

          {/* Card 4: Algo Token Connection & Brokerage Charges Config */}
          <div className="bg-[#161B22] p-5 rounded-xl border border-white/10 space-y-5">
            <div className="flex items-center justify-between border-b border-[#3c494e]/30 pb-2.5">
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase text-cyan-400">
                <Zap className="w-4 h-4 text-cyan-400" /> Algo Token Charges & Brokerage Config
              </h2>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded font-mono">
                TOKEN-BASED BROKERAGE
              </span>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-[11px] leading-relaxed flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                All charges are token-based. Manual broker trades have 0 Hello Trader token brokerage. Webhook execution requires BUY + SELL tokens in user wallet balance.
              </span>
            </div>

            {algoChargesMsg && (
              <div className={`p-3 rounded-lg text-xs font-bold ${algoChargesMsg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                {algoChargesMsg.text}
              </div>
            )}

            {/* Sub-Section A: Algo Connection Charge Tiers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 uppercase tracking-wide">A. Connection Fee Tiers (Lot Capacity)</span>
                <button
                  type="button"
                  onClick={() => {
                    const last = algoConnectionTiers[algoConnectionTiers.length - 1] || { maxLots: 0, tokens: 3800 };
                    setAlgoConnectionTiers([...algoConnectionTiers, { minLots: last.maxLots + 1, maxLots: last.maxLots + 5, tokens: last.tokens + 3800 }]);
                  }}
                  className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black text-[10px] font-bold rounded border border-cyan-500/40 transition-colors"
                >
                  + Add Connection Tier
                </button>
              </div>

              <div className="space-y-2">
                {algoConnectionTiers.map((tier, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#0b0e14] p-2.5 rounded-lg border border-white/5 text-xs">
                    <div className="col-span-3">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">Min Lots</label>
                      <input
                        type="number"
                        min="1"
                        value={tier.minLots}
                        onChange={e => {
                          const updated = [...algoConnectionTiers];
                          updated[idx].minLots = Number(e.target.value);
                          setAlgoConnectionTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-white font-mono"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">Max Lots</label>
                      <input
                        type="number"
                        min="1"
                        value={tier.maxLots}
                        onChange={e => {
                          const updated = [...algoConnectionTiers];
                          updated[idx].maxLots = Number(e.target.value);
                          setAlgoConnectionTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-white font-mono"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">Connection Fee (Tokens)</label>
                      <input
                        type="number"
                        min="0"
                        value={tier.tokens}
                        onChange={e => {
                          const updated = [...algoConnectionTiers];
                          updated[idx].tokens = Number(e.target.value);
                          setAlgoConnectionTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-cyan-400 font-bold font-mono"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {algoConnectionTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setAlgoConnectionTiers(algoConnectionTiers.filter((_, i) => i !== idx));
                          }}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-Section B: Algo Brokerage Tiers (BUY & SELL) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 uppercase tracking-wide">B. BUY & SELL Brokerage Tiers (Per Trade)</span>
                <button
                  type="button"
                  onClick={() => {
                    const last = algoBrokerageTiers[algoBrokerageTiers.length - 1] || { maxLots: 0, buyTokens: 10, sellTokens: 10 };
                    setAlgoBrokerageTiers([...algoBrokerageTiers, { minLots: last.maxLots + 1, maxLots: last.maxLots + 5, buyTokens: last.buyTokens + 5, sellTokens: last.sellTokens + 5 }]);
                  }}
                  className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black text-[10px] font-bold rounded border border-cyan-500/40 transition-colors"
                >
                  + Add Brokerage Tier
                </button>
              </div>

              <div className="space-y-2">
                {algoBrokerageTiers.map((tier, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#0b0e14] p-2.5 rounded-lg border border-white/5 text-xs">
                    <div className="col-span-2">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">Min Lots</label>
                      <input
                        type="number"
                        min="1"
                        value={tier.minLots}
                        onChange={e => {
                          const updated = [...algoBrokerageTiers];
                          updated[idx].minLots = Number(e.target.value);
                          setAlgoBrokerageTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-white font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">Max Lots</label>
                      <input
                        type="number"
                        min="1"
                        value={tier.maxLots}
                        onChange={e => {
                          const updated = [...algoBrokerageTiers];
                          updated[idx].maxLots = Number(e.target.value);
                          setAlgoBrokerageTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-white font-mono"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">BUY Brokerage (Tokens)</label>
                      <input
                        type="number"
                        min="0"
                        value={tier.buyTokens}
                        onChange={e => {
                          const updated = [...algoBrokerageTiers];
                          updated[idx].buyTokens = Number(e.target.value);
                          setAlgoBrokerageTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-green-400 font-bold font-mono"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] text-gray-400 uppercase mb-0.5">SELL Brokerage (Tokens)</label>
                      <input
                        type="number"
                        min="0"
                        value={tier.sellTokens}
                        onChange={e => {
                          const updated = [...algoBrokerageTiers];
                          updated[idx].sellTokens = Number(e.target.value);
                          setAlgoBrokerageTiers(updated);
                        }}
                        className="w-full bg-[#161B22] border border-[#3c494e]/50 px-2 py-1 rounded text-amber-400 font-bold font-mono"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {algoBrokerageTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setAlgoBrokerageTiers(algoBrokerageTiers.filter((_, i) => i !== idx));
                          }}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveAlgoCharges}
              disabled={algoChargesLoading}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-black font-extrabold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,212,255,0.2)]"
            >
              <Zap className="w-4 h-4 fill-current" />
              {algoChargesLoading ? 'SAVING ALGO CHARGES...' : 'SAVE ALGO TOKEN CHARGES'}
            </button>
          </div>
        </div>
      )}

      {/* ── Student Login Audit Modal ── */}
      {studentAuditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                📜 Login History Audit: {studentAuditModal.student.name} ({studentAuditModal.student.studentId})
              </h3>
              <button onClick={() => setStudentAuditModal(null)} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2 text-xs font-mono">
              {studentAuditModal.history.length === 0 ? (
                <div className="text-gray-500 text-center py-6">No login history recorded yet.</div>
              ) : (
                studentAuditModal.history.map((log, idx) => (
                  <div key={idx} className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                    <div>
                      <span className="text-white font-bold block">IP: {log.ip || '127.0.0.1'}</span>
                      <span className="text-gray-500 text-[10px]">{log.userAgent || 'Web Browser'}</span>
                    </div>
                    <span className="text-purple-400 font-bold">{new Date(log.timestamp || log.createdAt).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Student Algo Monitoring Modal ── */}
      {studentAlgoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                ⚡ Algo Strategy Execution Log: {studentAlgoModal.student.name} ({studentAlgoModal.student.studentId})
              </h3>
              <button onClick={() => setStudentAlgoModal(null)} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/5 space-y-3 font-mono text-xs">
              <div className="flex justify-between text-gray-300">
                <span>Algo Active: <strong className={studentAlgoModal.student.subscriptionActive ? 'text-green-400' : 'text-amber-400'}>{studentAlgoModal.student.subscriptionActive ? 'ENABLED' : 'DISABLED'}</strong></span>
                <span>Token Balance: <strong className="text-cyan-400">{studentAlgoModal.student.wallets?.find(w => w.type === 'TOKEN')?.balance || 0} Tokens</strong></span>
              </div>
              <div className="border-t border-white/10 pt-3 text-[11px] text-gray-400">
                Monitoring Status: Operational & Verified via Central Server Webhook.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Student Trial Override Modal ── */}
      {trialOverrideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                ⏱️ Trial Extension: {trialOverrideModal.student.name}
              </h3>
              <button onClick={() => setTrialOverrideModal(null)} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSetTrialOverride} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-gray-400 mb-1">Trial Extension Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={trialOverrideModal.trialDays}
                  onChange={e => setTrialOverrideModal({ ...trialOverrideModal, trialDays: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Override Reason / Note</label>
                <input
                  type="text"
                  value={trialOverrideModal.note}
                  onChange={e => setTrialOverrideModal({ ...trialOverrideModal, note: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-extrabold rounded-lg transition-colors"
              >
                SAVE TRIAL OVERRIDE
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDepositsTab({ payments, fetchData, selectedAuditPayment, setSelectedAuditPayment }) {
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalType, setModalType] = useState(null); // 'APPROVE' or 'REJECT'
  const [actualAmount, setActualAmount] = useState('');
  const [reason, setReason] = useState('');
  const [applyBonus, setApplyBonus] = useState(true);
  const [selectedReversePayment, setSelectedReversePayment] = useState(null);
  const [reversalReasonInput, setReversalReasonInput] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);

  const handleReverseApproval = async () => {
    if (!selectedReversePayment) return;
    setReversalLoading(true);
    try {
      const res = await apiClient.post('/admin/reverse-payment', {
        requestId: selectedReversePayment.id,
        reason: reversalReasonInput
      });
      alert(`Approved recharge reversed successfully!\n\nTokens Reversed: ${res.data?.totalTokensReversed}\nPremium Action: ${res.data?.membershipAction}`);
      setSelectedReversePayment(null);
      setReversalReasonInput('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Error reversing approved payment.");
    } finally {
      setReversalLoading(false);
    }
  };

  const pendingPayments = payments.filter(p => p.status === 'PENDING');

  const handleApprove = async () => {
    try {
      if (!actualAmount) {
        alert("Please enter actual amount received.");
        return;
      }
      await apiClient.post('/admin/approve-payment', {
        requestId: selectedPayment.id,
        actualAmountReceived: Number(actualAmount),
        applyBonus,
        reason
      });
      alert('Payment approved successfully! Tokens credited.');
      setModalType(null);
      setSelectedPayment(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Error approving payment.");
    }
  };

  const handleReject = async () => {
    try {
      await apiClient.post('/admin/reject-payment', {
        requestId: selectedPayment.id,
        reason
      });
      alert('Payment rejected.');
      setModalType(null);
      setSelectedPayment(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Error rejecting payment.");
    }
  };

  return (
    <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
      <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
        <CreditCard className="w-4 h-4 text-amber-500" /> PENDING RECHARGE DEPOSITS
      </h2>

      {pendingPayments.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-xs">No pending deposit verification tickets in queue.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0b0e14] text-gray-400 font-bold border-b border-white/10">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">User Amount</th>
                <th className="py-2.5 px-3">Method & UTR</th>
                <th className="py-2.5 px-3">Screenshot</th>
                <th className="py-2.5 px-3 text-center">Receipt Verification & Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pendingPayments.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3 text-gray-400">{new Date(r.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-3 font-bold text-white">{r.user?.name} <br/><span className="text-[10px] text-gray-500">{r.user?.phone}</span></td>
                  <td className="py-3 px-3 font-bold text-[#00FF41]">₹{r.amount.toLocaleString()}</td>
                  <td className="py-3 px-3">
                    <span className="font-bold">{r.method}</span>
                    <br/>
                    {r.utr && (
                      <span className="text-[10px] text-purple-400 font-mono">UTR: {r.utr} <Copy className="w-3 h-3 inline cursor-pointer" onClick={() => {navigator.clipboard.writeText(r.utr); alert('Copied UTR');}}/></span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {r.screenshotUrl ? (
                      <a href={r.screenshotUrl} target="_blank" className="text-[#00D4FF] text-[10px] underline" rel="noreferrer">View Receipt</a>
                    ) : (
                      <span className="text-[10px] text-gray-500">None</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => { setSelectedPayment(r); setModalType('APPROVE'); setActualAmount(r.amount.toString()); }}
                        className="px-3 py-1.5 bg-[#00FF41]/20 hover:bg-[#00FF41] text-[#00FF41] hover:text-black font-extrabold rounded text-[10px] border border-[#00FF41]/40"
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => { setSelectedPayment(r); setModalType('REJECT'); }}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded text-[10px] border border-red-500/40"
                      >
                        REJECT
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* APPROVED RECHARGES & REVERSAL SECTION */}
      <div className="pt-6 border-t border-white/10 space-y-4">
        <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4 text-[#00FF41]" /> RECENT APPROVED RECHARGES (ALLOW REVERSAL)
          </span>
          <span className="text-[10px] text-amber-400 font-normal">
            * Reversing deducts credited tokens & recalculates premium entitlement
          </span>
        </h2>

        {payments.filter(p => p.status === 'APPROVED' || p.status === 'APPROVED_REVERSED').length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-xs">No approved recharges recorded in database.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0b0e14] text-gray-400 font-bold border-b border-white/10">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Method & UTR</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Admin Reversal Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments
                  .filter(p => p.status === 'APPROVED' || p.status === 'APPROVED_REVERSED')
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map(r => (
                    <tr key={r.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 text-gray-400">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="py-3 px-3 font-bold text-white">
                        {r.user?.name || 'Unknown'} <br/>
                        <span className="text-[10px] text-purple-400 font-mono">ID: {r.user?.studentId || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-3 font-bold text-[#00FF41]">
                        ₹{(r.actualAmount || r.amount).toLocaleString()}
                        {r.bonusApplied > 0 && (
                          <span className="block text-[9px] text-amber-300 font-normal">+₹{r.bonusApplied} Bonus Tokens</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold">{r.method}</span>
                        <br/>
                        {r.utr && <span className="text-[10px] text-gray-400 font-mono">UTR: {r.utr}</span>}
                      </td>
                      <td className="py-3 px-3 font-bold">
                        {r.status === 'APPROVED' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30">APPROVED</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30">REVERSED ↺</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {r.status === 'APPROVED' ? (
                          <button
                            onClick={() => { setSelectedReversePayment(r); setReversalReasonInput(''); }}
                            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-extrabold rounded text-[10px] border border-amber-500/40 transition-all cursor-pointer"
                          >
                            REVERSE APPROVAL ↺
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-500 italic">Reversal Processed</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval/Rejection Modal */}
      {modalType && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-sm p-6 text-white shadow-2xl relative">
            <h3 className="font-bold text-lg mb-4 text-[#00D4FF]">{modalType === 'APPROVE' ? 'APPROVE PAYMENT' : 'REJECT PAYMENT'}</h3>
            
            {modalType === 'APPROVE' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-400 font-bold mb-1">AMOUNT ACTUALLY RECEIVED (INR)</label>
                  <input type="number" value={actualAmount} onChange={e => setActualAmount(e.target.value)} className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:border-[#00D4FF] font-bold text-sm outline-none"/>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={applyBonus} onChange={e => setApplyBonus(e.target.checked)} className="w-4 h-4 accent-[#00D4FF]"/>
                  <span className="text-[10px] font-bold">Apply Bonus Automatically</span>
                </div>
              </div>
            )}
            
            <div className="mt-4">
              <label className="block text-[10px] text-gray-400 font-bold mb-1">REASON (OPTIONAL)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Cleared via HDFC" className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:border-[#00D4FF] text-sm outline-none"/>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => { setModalType(null); setSelectedPayment(null); setReason(''); }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-bold text-xs">CANCEL</button>
              {modalType === 'APPROVE' ? (
                <button onClick={handleApprove} className="flex-1 py-2 bg-[#00FF41] text-black hover:bg-[#00e639] rounded font-bold text-xs">APPROVE</button>
              ) : (
                <button onClick={handleReject} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-bold text-xs">REJECT</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal: Reverse Approved Recharge */}
      {selectedReversePayment && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono text-xs">
          <div className="bg-[#10131a] border border-amber-500/50 rounded-2xl w-full max-w-md p-6 text-white shadow-[0_0_40px_rgba(245,158,11,0.2)] space-y-4 relative">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-amber-300 uppercase">REVERSE APPROVED RECHARGE?</h3>
                <p className="text-[10px] text-gray-400">This action will debit credited tokens and recalculate premium entitlement.</p>
              </div>
            </div>

            <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-400">Student Name:</span>
                <span className="font-bold text-white">{selectedReversePayment.user?.name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Student ID:</span>
                <span className="font-bold text-purple-400">{selectedReversePayment.user?.studentId || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount Approved:</span>
                <span className="font-bold text-[#00FF41]">₹{(selectedReversePayment.actualAmount || selectedReversePayment.amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">UTR / Ref:</span>
                <span className="font-mono text-gray-300">{selectedReversePayment.utr || 'N/A'}</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-200 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 leading-relaxed">
              ⚠ <strong>Notice:</strong> Reverse this approved recharge? This may remove its token credit and premium entitlement.
            </p>

            <div>
              <label className="block text-[10px] text-gray-400 font-bold mb-1">REVERSAL REASON (AUDIT LOG)</label>
              <input
                type="text"
                value={reversalReasonInput}
                onChange={e => setReversalReasonInput(e.target.value)}
                placeholder="e.g. Chargeback, Invalid UTR verification, Refund issued"
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white text-xs outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setSelectedReversePayment(null); setReversalReasonInput(''); }}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-xs"
              >
                CANCEL
              </button>
              <button
                onClick={handleReverseApproval}
                disabled={reversalLoading}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-extrabold rounded-xl text-xs transition-all uppercase"
              >
                {reversalLoading ? 'REVERSING...' : 'CONFIRM REVERSAL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Payment Audit & Receipt Proof Modal */}
      {selectedAuditPayment && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto font-mono text-xs">
          <div className="bg-[#10131a] border border-[#3c494e]/60 rounded-2xl w-full max-w-lg p-6 text-white shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#00D4FF]" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">PAYMENT RECEIPT & AUDIT PROOF</h3>
              </div>
              <button 
                onClick={() => setSelectedAuditPayment(null)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Student Info Box */}
            <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-1.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase block">STUDENT PROFILE</span>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white text-sm">{selectedAuditPayment.user?.name || 'Unknown'}</span>
                <span className="px-2 py-0.5 rounded bg-[#00D4FF]/10 text-[#00D4FF] font-bold text-[10px]">
                  ID: {selectedAuditPayment.user?.studentId || selectedAuditPayment.userId || 'N/A'}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 flex flex-wrap justify-between gap-2 pt-1 border-t border-white/5">
                <span>Email: {selectedAuditPayment.user?.email || '—'}</span>
                <span>Phone: {selectedAuditPayment.user?.phone || '—'}</span>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0b0e14] p-3 rounded-xl border border-white/5">
                <span className="text-[10px] text-gray-400 block font-bold">CLAIMED BY USER</span>
                <span className="text-base font-extrabold text-white mt-1 block">
                  ₹{(selectedAuditPayment.amount || 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-[#0b0e14] p-3 rounded-xl border border-[#00FF41]/30">
                <span className="text-[10px] text-[#00FF41] block font-bold">APPROVED CASH RECV</span>
                <span className="text-base font-extrabold text-[#00FF41] mt-1 block">
                  ₹{((selectedAuditPayment.actualAmount !== null && selectedAuditPayment.actualAmount !== undefined) ? selectedAuditPayment.actualAmount : (selectedAuditPayment.amount || 0)).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Verification Metadata */}
            <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-2 text-[11px]">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Payment Status:</span>
                <span className={`font-bold ${
                  selectedAuditPayment.status === 'APPROVED' ? 'text-[#00FF41]' :
                  selectedAuditPayment.status === 'REJECTED' ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {selectedAuditPayment.status}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Payment Method:</span>
                <span className="font-bold text-white">{selectedAuditPayment.method || 'UPI/BANK'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">UTR / Ref Number:</span>
                <span className="font-bold text-purple-400 font-mono">{selectedAuditPayment.utr || 'Not provided'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Timestamp:</span>
                <span className="font-bold text-gray-300 font-mono">{new Date(selectedAuditPayment.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Admin Note / Reason:</span>
                <span className="font-bold text-[#00D4FF] italic">{selectedAuditPayment.reason || 'None specified'}</span>
              </div>
            </div>

            {/* Receipt Image Proof */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-gray-400 font-bold uppercase block">UPLOADED RECEIPT SCREENSHOT</span>
              {selectedAuditPayment.screenshotUrl ? (
                <div className="bg-[#0b0e14] p-2 rounded-xl border border-white/10 text-center space-y-2">
                  <img 
                    src={selectedAuditPayment.screenshotUrl} 
                    alt="Payment Receipt Proof" 
                    className="max-h-60 rounded-lg mx-auto object-contain border border-white/10 shadow-md"
                  />
                  <a 
                    href={selectedAuditPayment.screenshotUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-block px-3 py-1 bg-[#00D4FF]/10 text-[#00D4FF] hover:bg-[#00D4FF] hover:text-black rounded text-[10px] font-bold transition-all"
                  >
                    Open Full Image in New Tab ↗
                  </a>
                </div>
              ) : (
                <div className="bg-[#0b0e14] p-4 rounded-xl border border-white/5 text-center text-gray-500 text-xs">
                  No payment screenshot uploaded by student for this transaction.
                </div>
              )}
            </div>

            <button 
              onClick={() => setSelectedAuditPayment(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-all"
            >
              CLOSE AUDIT PROOF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function AdminReferralsTab() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await apiClient.get('/admin/referrals');
      setReferrals(res.data.referrals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
      <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
        <UserCheck className="w-4 h-4 text-purple-400" /> ENTERPRISE REFERRAL TREE
      </h2>

      {loading ? (
        <div className="text-center py-10 text-gray-500 text-xs">Loading referrals...</div>
      ) : referrals.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-xs">No referrals found in the system.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0b0e14] text-gray-400 font-bold border-b border-white/10">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Referrer</th>
                <th className="py-2.5 px-3">Referred New User</th>
                <th className="py-2.5 px-3">IP Address</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {referrals.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3 text-gray-400">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="py-3 px-3 font-bold text-white">{r.referrer?.name} <br/><span className="text-[10px] text-gray-500">{r.referrer?.referralCode}</span></td>
                  <td className="py-3 px-3 text-white">{r.referred?.name || r.signupEmail || 'Pending User'}</td>
                  <td className="py-3 px-3 font-mono text-[10px] text-gray-500">{r.ipAddress || 'N/A'}</td>
                  <td className="py-3 px-3 text-center">
                    {r.status === 'SUCCESS' && <span className="px-2 py-1 bg-[#00FF41]/20 text-[#00FF41] rounded">SUCCESS</span>}
                    {r.status === 'PENDING' && <span className="px-2 py-1 bg-amber-500/20 text-amber-500 rounded">PENDING</span>}
                    {r.status === 'INVALID' && <span className="px-2 py-1 bg-red-500/20 text-red-500 rounded flex flex-col items-center">INVALID <span className="text-[8px]">(Anti-Fraud)</span></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
