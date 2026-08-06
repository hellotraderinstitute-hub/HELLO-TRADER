'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { 
  ShieldCheck, Users, Activity, Server, Lock, AlertTriangle, 
  CheckCircle2, RefreshCw, Settings, CreditCard, Send, X, 
  UserCheck, Key, Laptop, FileText, BarChart3, HelpCircle, ArrowRightLeft,
  UserPlus, Check, Trash2, ShieldAlert, Eye, EyeOff, Copy
} from 'lucide-react';
import ProviderSettings from './ProviderSettings';
import apiClient from '../lib/axios';

export default function AdminPortal() {
  const {
    students, pendingRecharges, pendingReferrals, auditLogs, monthlySubCost, setMonthlySubCost, isServerOnline, approveRechargeRequest, rejectRechargeRequest,
    approveReferral, rejectReferral,
    creditWallet, debitWallet, reverseTransaction,
    setUserStatus, resetUserPassword, resetUserDevice,
    adminConfig, updateAdminConfig,
    membershipPlans, setMembershipPlans, tokenExchangeRate, setTokenExchangeRate
  } = useTrading();

  // Login credentials states
  
  const [signupRequests, setSignupRequests] = useState([]);
  const [adminDashboardStudents, setAdminDashboardStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const fetchDashboard = () => setFetchTrigger(prev => prev + 1);

  // Fetch admin dashboard data
  useEffect(() => {
    if (isAuthenticated) {
      const fetchDashboardData = async () => {
        try {
          const res = await apiClient.get('/admin/dashboard');
          if (res.data) {
            setSignupRequests(res.data.signupRequests || []);
            setAdminDashboardStudents(res.data.students || []);
            setPayments(res.data.payments || []);
          }
        } catch (err) {
          console.error("Failed to load admin dashboard", err);
        }
      };
      fetchDashboardData();
    }
  }, [isAuthenticated, adminTab, fetchTrigger]);

  const approveSignupRequest = async (requestId, tempPassword) => {
    try {
      await apiClient.post('/admin/approve-signup', { requestId, tempPassword });
      setSignupRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error(err);
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
  const [authError, setAuthError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Lock backdoor states
  const [showBackdoor, setShowBackdoor] = useState(false);
  const [backdoorPassword, setBackdoorPassword] = useState('');
  const [backdoorError, setBackdoorError] = useState('');
  const [showBackdoorPassword, setShowBackdoorPassword] = useState(false);

  // Edit Admin Credentials states
  const [adminNameField, setAdminNameField] = useState(adminConfig.name);
  const [adminEmailField, setAdminEmailField] = useState(adminConfig.email);
  const [adminPhoneField, setAdminPhoneField] = useState(adminConfig.phone);
  const [adminPasswordField, setAdminPasswordField] = useState(adminConfig.password);
  const [adminLockedField, setAdminLockedField] = useState(adminConfig.isLocked);
  const [showAdminSettingsPassword, setShowAdminSettingsPassword] = useState(false);

  // Dynamic Plans Form States
  const [planNameInput, setPlanNameInput] = useState('');
  const [planDaysInput, setPlanDaysInput] = useState('');
  const [planPriceInput, setPlanPriceInput] = useState('');
  const [planDescInput, setPlanDescInput] = useState('');

  // Token Price Exchange Rate State
  const [tokenPriceInput, setTokenPriceInput] = useState(tokenExchangeRate.toString());

  // Sync edits if config updates from local storage
  useEffect(() => {
    setAdminNameField(adminConfig.name);
    setAdminEmailField(adminConfig.email);
    setAdminPhoneField(adminConfig.phone);
    setAdminPasswordField(adminConfig.password);
    setAdminLockedField(adminConfig.isLocked);
  }, [adminConfig]);

  // Sync token rate input if loaded from local storage
  useEffect(() => {
    setTokenPriceInput(tokenExchangeRate.toString());
  }, [tokenExchangeRate]);

  // Active Tab within Admin Panel
  const [adminTab, setAdminTab] = useState('STUDENTS');

  // Selected Student for detailed drills
  const [selectedStudentId, setSelectedStudentId] = useState('STU-001');

  // Form states for manual adjustments
  const [manualAmount, setManualAmount] = useState('');
  const [manualCategory, setManualCategory] = useState('recharge');
  const [manualAction, setManualAction] = useState('credit');
  
  // Password Reset state
  const [newPasswordVal, setNewPasswordVal] = useState('');

  // Signup temp password states
  const [tempPasswordInputs, setTempPasswordInputs] = useState({});

  // Subscription Fee input state
  const [subCostInput, setSubCostInput] = useState(monthlySubCost.toString());

  // Pull auth session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = true;
      if (auth === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (
      adminEmailInput.trim().toLowerCase() === adminConfig.email.toLowerCase() &&
      adminPhoneInput.trim() === adminConfig.phone &&
      adminPasswordInput === adminConfig.password
    ) {
      setIsAuthenticated(true);
      setAuthError('');
      if (typeof window !== 'undefined') {
        
      }
    } else {
      setAuthError('Invalid Admin Email, Phone, or Password.');
    }
  };

  const handleBackdoorUnlock = (e) => {
    e.preventDefault();
    if (backdoorPassword === adminConfig.password) {
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

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      
    }
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

  const handleSaveTokenPrice = () => {
    const rate = Number(tokenPriceInput);
    if (isNaN(rate) || rate <= 0) {
      alert("Invalid price conversion rate.");
      return;
    }
    setTokenExchangeRate(rate);
    alert(`Token exchange rate successfully set to: ₹1 = ${rate} Tokens`);
  };

  const handleAddPlan = (e) => {
    e.preventDefault();
    const days = Number(planDaysInput);
    const price = Number(planPriceInput);
    if (isNaN(days) || days <= 0 || isNaN(price) || price <= 0) {
      alert("Plan duration and token price must be positive numericals.");
      return;
    }
    const newPlan = {
      id: `PLAN-${Date.now()}`,
      name: planNameInput,
      durationDays: days,
      price: price,
      description: planDescInput
    };
    setMembershipPlans(prev => [...prev, newPlan]);
    setPlanNameInput('');
    setPlanDaysInput('');
    setPlanPriceInput('');
    setPlanDescInput('');
    alert(`Membership tier plan "${planNameInput}" created and added to list!`);
  };

  const activeDrillStudent = students.find(s => s.id === selectedStudentId) || students[0];

  // Calculate Revenue Metrics
  const revenueMetrics = React.useMemo(() => {
    const totalRecharges = pendingRecharges
      .filter(r => r.status === 'APPROVED')
      .reduce((s, r) => s + r.amount, 0);

    const pendingAmount = pendingRecharges
      .filter(r => r.status === 'PENDING')
      .reduce((s, r) => s + r.amount, 0);

    const activeUsers = students.filter(s => s.status === 'ACTIVE').length;
    const totalReferralsAwarded = pendingReferrals.filter(r => r.status === 'APPROVED').length;

    return { totalRecharges, pendingAmount, activeUsers, totalReferralsAwarded };
  }, [students, pendingRecharges, pendingReferrals]);

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
              <label className="block text-gray-400 font-bold mb-1">ADMIN EMAIL ID</label>
              <input 
                type="email" 
                value={adminEmailInput}
                onChange={e => setAdminEmailInput(e.target.value)}
                placeholder="your gmail id"
                autoComplete="off"
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-red-500 font-bold"
                required
              />
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
                required
              />
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
          { id: 'SIGNUPS', label: 'SIGNUP REQUESTS', icon: UserPlus, badge: signupRequests.length },
          { id: 'DEPOSITS', label: 'PENDING DEPOSITS', icon: CreditCard, badge: pendingRecharges.filter(r => r.status === 'PENDING').length },
          { id: 'REFERRALS', label: 'REFERRALS VERIFY', icon: UserCheck, badge: pendingReferrals.filter(r => r.status === 'PENDING').length },
          { id: 'ADJUSTMENTS', label: 'MANUAL LEDGER / REVERSAL', icon: ArrowRightLeft },
          { id: 'PROVIDER', label: 'PROVIDER SETTINGS', icon: Settings },
          { id: 'REVENUE', label: 'REVENUE & LOGS', icon: BarChart3 },
          { id: 'SECURITY', label: 'SECURITY & PLANS', icon: Key }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setAdminTab(tab.id)}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all ${adminTab === tab.id ? 'bg-[#00D4FF] text-black shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.badge > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[8px]">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {adminTab === 'STUDENTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <Users className="w-4 h-4 text-[#00d4ff]" /> STUDENT REGISTER
            </h2>
            <div className="space-y-2">
              {students.map(s => (
                <div 
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${s.id === selectedStudentId ? 'bg-[#00d4ff]/10 border-[#00d4ff]' : 'bg-[#0b0e14] border-white/5 hover:border-white/20'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white text-[11px]">{s.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${s.status === 'ACTIVE' ? 'bg-[#00e639]/10 text-[#00e639]' : 'bg-red-500/10 text-red-400'}`}>{s.status}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-550">
                    <span>Code: {s.refCode}</span>
                    <span>Active Refs: {students.filter(x => x.referredByCode === s.refCode && x.subscriptionActive).length}</span>
                  </div>
                  <div className="text-[9px] text-gray-400 text-left pt-0.5 font-bold">
                    Bal: ₹{(s.rechargeTokens + s.referralTokens + s.bonusTokens).toLocaleString()} (Refs: {students.filter(x => x.referredByCode === s.refCode).length} Total)
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <Laptop className="w-4 h-4 text-purple-400" /> STUDENT CONTROL DECK ({activeDrillStudent?.name || 'No Student Selected'})
            </h2>

            {activeDrillStudent ? (
              <div className="space-y-4">
                {/* User Info Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5 text-[11px]">
                  <div>
                    <span className="text-gray-500 block text-[9px]">EMAIL</span>
                    <span className="font-bold text-white truncate block">{activeDrillStudent.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px]">MOBILE PHONE</span>
                    <span className="font-bold text-white">{activeDrillStudent.phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px]">TRIAL EXPIRED</span>
                    <span className="font-bold text-white">
                      {((Date.now() - new Date(activeDrillStudent.trialStartedAt).getTime()) > (4 * 24 * 60 * 60 * 1000)) ? 'YES' : 'NO'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[9px]">MEMBERSHIP PLAN</span>
                    <span className={`font-bold ${activeDrillStudent.subscriptionActive ? 'text-[#00FF41]' : 'text-red-400'}`}>
                      {activeDrillStudent.subscriptionActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>

                {/* Operations Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#0b0e14] p-3.5 rounded-xl border border-white/5 space-y-2">
                    <span className="font-extrabold text-[10px] text-gray-400 block uppercase">Account Access Status</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setUserStatus(activeDrillStudent.id, 'ACTIVE')}
                        className={`flex-1 py-1.5 rounded text-[10px] font-bold ${activeDrillStudent.status === 'ACTIVE' ? 'bg-[#00e639] text-black' : 'bg-white/5 text-white'}`}
                      >
                        ACTIVATE
                      </button>
                      <button 
                        onClick={() => setUserStatus(activeDrillStudent.id, 'SUSPENDED')}
                        className={`flex-1 py-1.5 rounded text-[10px] font-bold ${activeDrillStudent.status === 'SUSPENDED' ? 'bg-red-500 text-white' : 'bg-white/5 text-white'}`}
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
                        onClick={() => {
                          if(!newPasswordVal) return;
                          resetUserPassword(activeDrillStudent.id, newPasswordVal);
                          setNewPasswordVal('');
                          alert('Password updated successfully!');
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
                        resetUserDevice(activeDrillStudent.id, !activeDrillStudent.deviceLocked);
                        alert(`Hardware signature lock ${!activeDrillStudent.deviceLocked ? 'enabled' : 'cleared'}!`);
                      }}
                      className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded text-[10px] border border-white/10"
                    >
                      {activeDrillStudent.deviceLocked ? '🔓 UNLOCK HARDWARE DEVICE' : '🔒 LOCK HARDWARE SIGNATURE'}
                    </button>
                  </div>
                </div>

                {/* Ledger Transactions Audit */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">LEDGER BALANCE STATEMENTS</h3>
                  <div className="bg-[#0B0E14] rounded-xl border border-white/5 p-3.5 space-y-2 max-h-32 overflow-y-auto">
                    {activeDrillStudent.walletTransactions.length === 0 ? (
                      <div className="text-center text-gray-500 text-[10px] py-4">No transactions exist in this ledger.</div>
                    ) : (
                      activeDrillStudent.walletTransactions.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between text-[10px] border-b border-white/5 pb-1.5 last:border-b-0">
                          <div>
                            <span className="font-bold text-white block">{tx.label}</span>
                            <span className="text-[9px] text-gray-500">{tx.timestamp} // {tx.id}</span>
                          </div>
                          <span className={`font-mono font-bold ${tx.amount >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                            {tx.amount >= 0 ? '+' : ''}₹{tx.amount.toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Referred Students Log */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-gray-450 uppercase tracking-wider">REFERRED ACCOUNTS REGISTER ({students.filter(x => x.referredByCode === activeDrillStudent.refCode).length} TOTAL)</h3>
                  <div className="bg-[#0B0E14] rounded-xl border border-white/5 p-3.5 space-y-2 max-h-32 overflow-y-auto">
                    {students.filter(x => x.referredByCode === activeDrillStudent.refCode).length === 0 ? (
                      <div className="text-center text-gray-500 text-[10px] py-4">No student referred by this account yet.</div>
                    ) : (
                      students.filter(x => x.referredByCode === activeDrillStudent.refCode).map(refS => (
                        <div key={refS.id} className="flex items-center justify-between text-[10px] border-b border-white/5 pb-1.5 last:border-b-0">
                          <div>
                            <span className="font-bold text-white block">{refS.name} ({refS.id})</span>
                            <span className="text-[9px] text-gray-500">Email: {refS.email} // Phone: {refS.phone}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold ${refS.subscriptionActive ? 'bg-[#00e639]/10 text-[#00e639]' : 'bg-amber-500/10 text-amber-500'}`}>
                            {refS.subscriptionActive ? 'ACTIVE MEMBER' : 'PENDING ACTION'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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
                        <td className="py-3 px-3 font-bold text-white">{r.name}</td>
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
                              onClick={() => {
                                approveSignupRequest(r.id, tempPass);
                                alert(`SignUp Approved! Temporary password assigned: ${tempPass}`);
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
        <AdminDepositsTab payments={payments} fetchData={fetchDashboard} />
      )}

      {adminTab === 'REFERRALS' && (
        <AdminReferralsTab />
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
                    <option key={s.id} value={s.id}>{s.name} (Code: {s.refCode} // Balance: ₹{s.rechargeTokens + s.referralTokens + s.bonusTokens})</option>
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
                onClick={() => {
                  const amt = Number(manualAmount);
                  if (isNaN(amt) || amt <= 0) {
                    alert("Please enter a valid positive token amount.");
                    return;
                  }
                  if (manualAction === 'credit') {
                    creditWallet(selectedStudentId, amt, manualCategory);
                    alert(`Credited ${amt} ${manualCategory} tokens to student.`);
                  } else {
                    debitWallet(selectedStudentId, amt, manualCategory);
                    alert(`Debited ${amt} ${manualCategory} tokens from student.`);
                  }
                  setManualAmount('');
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
              {students.flatMap(s => s.walletTransactions.map(tx => ({ ...tx, studentId: s.id, studentName: s.name }))).length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No transactions logged in system ledgers yet.</div>
              ) : (
                students.flatMap(s => s.walletTransactions.map(tx => ({ ...tx, studentId: s.id, studentName: s.name })))
                  .sort((a,b) => b.id.localeCompare(a.id))
                  .map(tx => (
                    <div key={tx.id} className="p-3 bg-[#0b0e14] rounded border border-white/5 flex items-center justify-between text-xs hover:border-red-500/30 transition-all">
                      <div>
                        <span className="font-bold text-white block">{tx.label}</span>
                        <span className="text-[10px] text-gray-400">Student: {tx.studentName} // Type: {tx.type}</span>
                        <span className="text-[9px] text-gray-500 block">{tx.timestamp} // ID: {tx.id}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold text-sm ${tx.amount >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                          {tx.amount >= 0 ? '+' : ''}₹{tx.amount.toLocaleString()}
                        </span>
                        <button
                          onClick={() => {
                            reverseTransaction(tx.studentId, tx.id);
                            alert('Transaction successfully reversed! Tokens returned/debited accordingly.');
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
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-red-400" /> SYSTEM AUDIT LOGS (IMMUTABLE)
            </h2>
            
            <div className="overflow-y-auto flex-1 max-h-80 space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-2 bg-[#0b0e14] rounded border border-white/5 text-[10px] flex justify-between gap-4">
                  <span className="text-gray-300 font-bold">{log.action}</span>
                  <span className="text-gray-500 font-mono shrink-0">{log.timestamp}</span>
                </div>
              ))}
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

          {/* Card 2: Token Exchange Rate Settings */}
          <div className="bg-[#161B22] p-5 rounded-xl border border-white/10 space-y-4">
            <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2.5 flex items-center gap-1.5 uppercase text-amber-400">
              <CreditCard className="w-4 h-4 text-amber-400" /> Token Price & Exchange Config
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-bold">EXCHANGE RATE (₹1 = X Tokens)</label>
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
                    onClick={() => {
                      if (membershipPlans.length <= 1) {
                        alert("You must keep at least one active membership plan.");
                        return;
                      }
                      setMembershipPlans(prev => prev.filter(p => p.id !== plan.id));
                      alert(`Plan ${plan.name} deleted successfully!`);
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
        </div>
      )}
    </div>
  );
}

function AdminDepositsTab({ payments, fetchData }) {
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalType, setModalType] = useState(null); // 'APPROVE' or 'REJECT'
  const [actualAmount, setActualAmount] = useState('');
  const [reason, setReason] = useState('');
  const [applyBonus, setApplyBonus] = useState(true);

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
    </div>
  );
}

function AdminReferralsTab() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

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
