'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import Sidebar from '../components/Sidebar';
import Watchlist from '../components/Watchlist';
import Dashboard from '../components/Dashboard';
import TradingDesk from '../components/TradingDesk';
import OptionChain from '../components/OptionChain';
import MarketIntel from '../components/MarketIntel';
import TradeHub from '../components/TradeHub';
import GuardianDashboard from '../components/GuardianDashboard';
import MarketScanner from '../components/MarketScanner';
import AILab from '../components/AILab';
import WalletHub from '../components/WalletHub';
import AdminPortal from '../components/AdminPortal';
import ReferralDashboard from '../components/Referral';
import ApiStatusMonitor from '../components/ApiStatusMonitor';
import NotificationsModal from '../components/NotificationsModal';
import LandingPage from '../components/LandingPage';
import InstallPwaModal from '../components/InstallPwaModal';
import UserSettings from '../components/UserSettings';
import apiClient from '../lib/axios';
import { Bell, User, TrendingUp, TrendingDown, Lock, CheckCircle2, AlertTriangle, Key, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function Home() {
  const { 
    isServerOnline, setIsServerOnline,
    balance, activePnlTotal, currentStudent, monthlySubCost, 
    setCurrentStudentId, submitSignupRequest,
    purchaseSubscription, adminConfig,
    user, setUser, membershipPlans,
    isExpiredTrial, showRechargeModal, setShowRechargeModal, openRechargeModal,
    authLoading, setAuthLoading
  } = useTrading();
  
  const { tickers, marketMode, setMarketMode } = useMarketProvider();

  const [activeTab, setActiveTab] = useState('desk');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'SUCCESS', title: 'Free Trial Active', message: 'Your 4-day full access paper trading trial is active.', time: 'Just now' },
    { id: 2, type: 'CREDIT', title: 'Bonus Margin Credited', message: '₹50,00,000 Paper Trading Margin initialized.', time: 'Today' },
    { id: 3, type: 'ALERT', title: 'Hello Trader Engine', message: 'Hello Trader Pro institutional live market feed connected.', time: 'Today' }
  ]);

  // Authentication & Landing View State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [viewLanding, setViewLanding] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [loginMobileInput, setLoginMobileInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Password Reset State (Temporary password check)
  const [requiresReset, setRequiresReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');

  // Admin Backdoor State
  const [isAdmin, setIsAdmin] = useState(false);
  const [lockClicks, setLockClicks] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // Admin login credentials states
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPhoneInput, setAdminPhoneInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');

  // Password Visibility States
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Signup view state
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupRefCode, setSignupRefCode] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupError, setSignupError] = useState('');

  const isNseMarketOpen = useMemo(() => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const day = istDate.getUTCDay();
    const hours = istDate.getUTCHours();
    const mins = istDate.getUTCMinutes();
    const timeInMins = hours * 60 + mins;

    // 09:15 AM = 555 mins, 15:30 PM = 930 mins
    const isWeekday = day >= 1 && day <= 5;
    return isWeekday && timeInMins >= 555 && timeInMins <= 930;
  }, []);

  // ── Unified Referral Link & Auth Check Handler ──────────────────────────────
  useEffect(() => {
    const initApp = async () => {
      if (typeof window === 'undefined') return;
      setAuthLoading(true);

      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref');

      // 1. If referral parameter is present, force open Registration Modal
      if (refCode) {
        const code = refCode.toUpperCase();
        setSignupRefCode(code);
        setIsSignupOpen(true);

        // Clear any old session so the new student can register
        try { await apiClient.post('/auth/logout'); } catch (_) {}
        setIsAuthenticated(false);
        setUser(null);
        setCurrentStudentId(null);
        setAuthLoading(false);

        // Clean up ?ref parameter from URL bar
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        return;
      }

      // 2. Otherwise perform standard session check
      try {
        const res = await apiClient.get('/auth/me');
        if (res.data && res.data.user) {
          const u = res.data.user;
          setUser(u);
          setCurrentStudentId(u.id);
          setIsAuthenticated(true);
          if (String(u.role || '').trim().toLowerCase() === 'admin') {
            setIsAdmin(true);
            setActiveTab('admin');
          } else {
            setIsAdmin(false);
            setActiveTab('desk');
          }
        } else {
          setIsAuthenticated(false);
          setUser(null);
          setCurrentStudentId(null);
        }
      } catch (err) {
        setIsAuthenticated(false);
        setUser(null);
        setCurrentStudentId(null);
      } finally {
        setAuthLoading(false);
      }
    };

    initApp();
  }, []);

  // Safety Effect: Redirect away if an expired trial user lands directly on a locked tab
  useEffect(() => {
    if (authLoading) return; // Wait until auth/entitlement loading completes!
    const lockedTabs = ['option-chain', 'market-intel', 'ai-lab', 'scanner'];
    if (isExpiredTrial && lockedTabs.includes(activeTab)) {
      setActiveTab('dashboard');
      openRechargeModal();
    }
  }, [authLoading, isExpiredTrial, activeTab, openRechargeModal]);

  const handleTabChange = (targetTab) => {
    if (authLoading) return;
    const lockedTabs = ['option-chain', 'market-intel', 'ai-lab', 'scanner'];
    if (isExpiredTrial && lockedTabs.includes(targetTab)) {
      openRechargeModal();
      return; // Prevent tab activation!
    }
    setActiveTab(targetTab);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput || !passwordInput) return;

    try {
      const res = await apiClient.post('/auth/login', {
        emailOrPhone: studentIdInput.trim(),
        phone: loginMobileInput.trim(),
        password: passwordInput
      });

      if (res.data && res.data.user) {
        // Partner Gateway Check & Redirection
        if (res.data?.role === 'PARTNER' || res.data?.redirectTo === '/partner' || String(res.data.user?.role || '').toUpperCase() === 'PARTNER') {
          window.location.href = '/partner';
          return;
        }

        const student = res.data.user;
        if (student.status !== 'ACTIVE') {
          setLoginError('Account suspended or awaiting admin activation.');
          return;
        }

        setIsAdmin(String(student.role || '').trim().toLowerCase() === 'admin');
        setCurrentStudentId(student.id);
        setUser(student);
        setIsAuthenticated(true);
        setLoginError('');
        setActiveTab(String(student.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'desk');

        // Force password reset for all newly approved accounts
        if (passwordInput.startsWith('HT@') || passwordInput === 'password123' || passwordInput === 'password456') {
          setRequiresReset(true);
        }
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Invalid Student ID or Password.');
    }
  };

  
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/auth/login', {
        identifier: adminEmailInput.trim(),
        password: adminPasswordInput
      });
      if (res.data && res.data.user && String(res.data.user.role || '').trim().toLowerCase() === 'admin') {
        const u = res.data.user;
        setUser(u);
        setCurrentStudentId(u.id);
        setIsAdmin(true);
        setIsAuthenticated(true);
        setAdminLoginError('');
        setActiveTab('admin');
        setShowAdminLogin(false);
      } else {
        setAdminLoginError('Access Denied. Not an admin.');
      }
    } catch (err) {
      setAdminLoginError(err.response?.data?.error || 'Invalid credentials.');
    }
  };


  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 5) {
      setResetError('Password must contain at least 5 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    try {
      // Call backend to permanently save the new password
      await apiClient.post('/auth/change-password', { newPassword });
      setIsAdmin(false);
      setActiveTab('desk');
      setRequiresReset(false);
      setResetError('');
      alert('Password updated successfully! Welcome to Hello Trader Pro.');
    } catch (err) {
      setResetError(err.response?.data?.error || 'Failed to update password. Please try again.');
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setSignupError('');

    const res = await submitSignupRequest(signupName, signupEmail, signupPhone, signupRefCode);
    if (res.success) {
      setSignupSuccess(true);
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', { 'send_to': 'AW-18112591783/E3gzCNWB96AcEKfv4LxD' });
      }
      setSignupName('');
      setSignupEmail('');
      setSignupPhone('');
      setSignupRefCode('');
    } else {
      setSignupError(res.error);
    }
  };

  const handleLogout = async () => {
    try { await apiClient.post('/auth/logout'); } catch(_) {}
    setAuthLoading(false);
    setIsAuthenticated(false);
    setIsAdmin(false);
    setCurrentStudentId(null);
    setUser(null);
    setStudentIdInput('');
    setPasswordInput('');
    setAdminEmailInput('');
    setAdminPhoneInput('');
    setAdminPasswordInput('');
    setShowRechargeModal(false);
    setActiveTab('desk');
  };

  if (isSignupOpen) {
    return (
      <div role="application" className="fixed inset-0 z-[250] flex items-center justify-center bg-[#0b0e14] font-mono text-xs text-[#bbc9cf] p-4 overflow-y-auto">
        <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 flex items-center justify-center text-[#00D4FF] mb-2">
              <User className="w-6 h-6" />
            </div>
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">HELLO TRADER REGISTRATION</h2>
            <p className="text-[10px] text-gray-500 mt-1">Enroll to get a 4-day free trial terminal access code</p>
          </div>

          {!signupSuccess ? (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-gray-400 font-bold mb-1">FULL NAME</label>
                <input 
                  type="text" 
                  value={signupName}
                  onChange={e => setSignupName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#00D4FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">EMAIL ADDRESS</label>
                <input 
                  type="email" 
                  value={signupEmail}
                  onChange={e => setSignupEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#00D4FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">MOBILE NUMBER</label>
                <input 
                  type="tel" 
                  value={signupPhone}
                  onChange={e => setSignupPhone(e.target.value)}
                  placeholder="e.g. +91 94773 04939"
                  className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#00D4FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">INVITATION CODE (REFERRAL)</label>
                <input 
                  type="text" 
                  value={signupRefCode}
                  onChange={e => setSignupRefCode(e.target.value)}
                  placeholder="Direct registration (None)"
                  className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#00D4FF] font-bold text-purple-400"
                />
              </div>

              {signupError && (
                <div className="text-red-400 font-bold bg-red-500/10 p-2.5 rounded border border-red-500/20 text-[10px]">
                  {signupError}
                </div>
              )}

              <button 
                type="submit"
                className="w-full py-2.5 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded-lg text-xs transition-colors"
              >
                REQUEST TERMINAL ENROLLMENT
              </button>
            </form>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#00FF41]/10 border border-[#00FF41]/30 flex items-center justify-center text-[#00FF41] mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-[#00FF41]">REGISTRATION REQUEST LOGGED</h4>
                <p className="text-[10px] text-gray-400 mt-2 leading-relaxed px-2">
                  Your registration details have been submitted to the Admin. 
                  <br />Once approved, your <strong>Student ID</strong> and <strong>Temporary Password</strong> will be sent to your registered Email or Telegram.
                </p>
              </div>
            </div>
          )}

          <div className="text-center pt-2.5 border-t border-white/5 space-y-2">
            <InstallPwaModal variant="sidebar" />
            <button 
              onClick={() => {
                setIsSignupOpen(false);
                setSignupSuccess(false);
                setSignupError('');
              }}
              className="text-gray-400 hover:text-white font-bold transition-colors block w-full text-center"
            >
              Already have credentials? Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Public Landing Page or Login Authentication Modal ───
  if (!isAuthenticated || viewLanding) {
    return (
      <>
        <LandingPage 
          onOpenLogin={() => setShowLoginModal(true)} 
          onOpenSignup={() => {
            setShowLoginModal(false);
            setIsSignupOpen(true);
          }}
          isAuthenticated={isAuthenticated}
          onEnterTerminal={() => setViewLanding(false)}
        />

        {/* Login Modal Overlay */}
        {(showLoginModal || showAdminLogin) && (
          <div role="application" className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0e14]/85 backdrop-blur-md font-mono text-xs text-[#bbc9cf] p-4 animate-fadeIn">
            {showAdminLogin ? (
              <div className="bg-[#10131a] border border-red-500/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h2 className="text-base font-extrabold text-white uppercase tracking-wider">ADMINISTRATOR TERMINAL</h2>
                  <p className="text-[10px] text-gray-500 mt-1">Superadmin Security Access Panel</p>
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-4" autoComplete="off">
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
                  
                  {adminLoginError && (
                    <div className="text-red-400 font-bold text-[10px] bg-red-500/10 p-2 rounded border border-red-500/30 text-center">
                      {adminLoginError}
                    </div>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-extrabold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    AUTHENTICATE ADMIN
                  </button>
                </form>

                <div className="text-center pt-2.5 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setShowAdminLogin(false);
                      setAdminEmailInput('');
                      setAdminPhoneInput('');
                      setAdminPasswordInput('');
                      setAdminLoginError('');
                    }}
                    className="text-gray-400 hover:text-white font-bold transition-colors"
                  >
                    ← Back to Student Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#10131a] border border-[#D4AF37]/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-6 relative">
                {/* Close modal button */}
                <button 
                  onClick={() => setShowLoginModal(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-white font-bold text-sm"
                >
                  ✕
                </button>

                <div className="flex flex-col items-center text-center">
                  {/* Click 5 times to trigger showAdminLogin */}
                  <div 
                    onClick={() => {
                      setLockClicks(c => {
                        const next = c + 1;
                        if (next >= 5) {
                          setShowAdminLogin(true);
                          return 0;
                        }
                        return next;
                      });
                    }}
                    className="w-12 h-12 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] mb-2 cursor-pointer hover:bg-[#D4AF37]/20 transition-all active:scale-95"
                    title="Hello Trader Security Lock"
                  >
                    <Lock className="w-6 h-6" />
                  </div>
                  <h2 className="text-base font-extrabold text-white uppercase tracking-wider">HELLO TRADER TERMINAL</h2>
                  <p className="text-[10px] text-gray-500 mt-1">Demat Trading Education Environment</p>
                </div>

                {(() => {
                  const isPartnerLogin = studentIdInput.trim().toUpperCase().startsWith('PHT');
                  return (
                    <form onSubmit={handleLogin} className="space-y-4">
                      {isPartnerLogin && (
                        <div className="bg-cyan-500/10 border border-cyan-500/30 p-2 rounded-lg text-cyan-400 text-center font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Partner Business Authentication
                        </div>
                      )}

                      <div>
                        <label className="block text-gray-400 font-bold mb-1">
                          {isPartnerLogin ? 'PARTNER ID (PHT...)' : 'STUDENT ID / CODE'}
                        </label>
                        <input 
                          type="text"
                          disabled={!isServerOnline}
                          value={studentIdInput}
                          onChange={e => setStudentIdInput(e.target.value)}
                          placeholder={isPartnerLogin ? "e.g. PHT0036" : "e.g. HT1001"}
                          className={`w-full bg-[#0b0e14] border px-3 py-2.5 rounded-lg text-white font-extrabold focus:outline-none ${isPartnerLogin ? 'border-cyan-500/50 focus:border-cyan-400' : 'border-white/10 focus:border-[#D4AF37]'}`}
                          required
                        />
                      </div>

                      {isPartnerLogin && (
                        <div>
                          <label className="block text-cyan-400 font-bold mb-1">REGISTERED MOBILE NUMBER *</label>
                          <input 
                            type="tel"
                            disabled={!isServerOnline}
                            value={loginMobileInput}
                            onChange={e => setLoginMobileInput(e.target.value)}
                            placeholder="e.g. 9876543210"
                            className="w-full bg-[#0b0e14] border border-cyan-500/40 px-3 py-2.5 rounded-lg text-white font-extrabold focus:outline-none focus:border-cyan-400"
                            required
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-gray-400 font-bold mb-1">PASSWORD</label>
                        <div className="relative">
                          <input 
                            type={showStudentPassword ? "text" : "password"}
                            disabled={!isServerOnline}
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                            placeholder="••••••••"
                            className={`w-full bg-[#0b0e14] border pl-3 pr-10 py-2.5 rounded-lg text-white focus:outline-none ${isPartnerLogin ? 'border-cyan-500/50 focus:border-cyan-400' : 'border-white/10 focus:border-[#D4AF37]'}`}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowStudentPassword(!showStudentPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                          >
                            {showStudentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {loginError && (
                        <div className="text-red-400 font-bold bg-red-500/10 p-2 rounded border border-red-500/30 text-[10px]">
                          {loginError}
                        </div>
                      )}
                      {!isServerOnline && <div className="text-red-500 font-bold text-center">API SERVER OFFLINE - PLEASE WAIT</div>}

                      <button 
                        type="submit"
                        disabled={!isServerOnline}
                        className={`w-full py-2.5 font-extrabold rounded-lg text-xs transition-all ${isPartnerLogin ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_15px_rgba(0,212,255,0.3)]' : 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] hover:brightness-110 text-black shadow-[0_0_15px_rgba(212,175,55,0.3)]'}`}
                      >
                        {isPartnerLogin ? 'AUTHENTICATE PARTNER' : 'AUTHENTICATE ACCOUNT'}
                      </button>
                    </form>
                  );
                })()}

                <div className="text-center pt-2.5 border-t border-white/5 space-y-2">
                  <InstallPwaModal variant="sidebar" />
                  <button 
                    onClick={() => {
                      setShowLoginModal(false);
                      setIsSignupOpen(true);
                    }}
                    className="text-[#D4AF37] hover:underline font-bold block w-full text-center"
                  >
                    Don't have an account? Sign Up Now
                  </button>
                  <button 
                    onClick={() => setShowLoginModal(false)}
                    className="text-gray-400 hover:text-white font-medium text-[11px]"
                  >
                    ← Back to Public Website
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // ─── Render Forced Password Reset Overlay ───
  if (requiresReset) {
    return (
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0b0e14]/90 backdrop-blur-md p-4 font-mono text-xs text-[#bbc9cf]">
        <div className="bg-[#10131a] border border-purple-500/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
              <Key className="w-6 h-6" />
            </div>
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">PASSWORD RESET REQUIRED</h2>
            <p className="text-[10px] text-gray-500 mt-1">Please update your password to unlock the workspace dashboard.</p>
          </div>

          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label className="block text-gray-400 font-bold mb-1">NEW PASSWORD</label>
              <div className="relative">
                <input 
                  type={showResetPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 5 characters"
                  className="w-full bg-[#0b0e14] border border-white/10 pl-3 pr-10 py-2 rounded-lg text-white focus:outline-none focus:border-purple-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1">CONFIRM PASSWORD</label>
              <div className="relative">
                <input 
                  type={showResetPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full bg-[#0b0e14] border border-white/10 pl-3 pr-10 py-2 rounded-lg text-white focus:outline-none focus:border-purple-400"
                  required
                />
              </div>
            </div>

            {resetError && (
              <div className="text-red-400 font-bold bg-red-500/10 p-2 rounded border border-red-500/30 text-[10px]">
                {resetError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-extrabold rounded-lg text-xs transition-colors"
            >
              UPDATE PASSWORD & ENTER
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-white flex flex-col items-center justify-center font-mono space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" />
        <div className="text-xs text-gray-400 font-bold uppercase tracking-widest animate-pulse">
          VERIFYING INSTITUTIONAL SESSION & ENTITLEMENTS...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b0e14] text-white overflow-hidden">
      <ApiStatusMonitor onStatusChange={setIsServerOnline} />
        {/* Fixed Left Sidebar (desktop) or Drawer (mobile overlay) */}
      {sidebarOpen && (
        <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} handleLogout={handleLogout} isAdmin={isAdmin} />
      )}

      {/* Main Content Area */}
      <div className={`${sidebarOpen ? 'md:ml-[240px]' : 'md:ml-0'} ml-0 flex-1 flex flex-col overflow-hidden`}>
        
        {/* Top Nav Bar */}
        <header className={`fixed top-0 ${sidebarOpen ? 'md:left-[240px]' : 'md:left-0'} left-0 right-0 z-50 h-[52px] bg-[#10131a]/90 backdrop-blur-xl border-b border-[#3c494e]/30 flex items-center justify-between px-4 shadow-lg`}>
          {/* Left: Live Status + Index Prices */}
          <div className="flex items-center gap-4 font-mono text-xs">
            {/* Sidebar toggle - visible on all sizes */}
            <button
              onClick={() => setSidebarOpen(s => !s)}
              aria-label="Toggle sidebar"
              className="mr-2 p-2 rounded-md bg-transparent hover:bg-white/5 transition-colors"
            >
              ☰
            </button>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold font-mono ${
              isNseMarketOpen 
                ? 'bg-[#00FF41]/10 border-[#00FF41]/30 text-[#00FF41]' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isNseMarketOpen ? 'bg-[#00FF41] animate-ping' : 'bg-amber-400'}`} />
              <span>{isNseMarketOpen ? '🟢 NSE MARKET OPEN (09:15 - 15:30 IST)' : '🔴 NSE CLOSED (09:15 - 15:30 IST)'}</span>
            </div>
            {user?.adminSupportMode && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-bold">
                <span>⚠️ ADMIN / SUPPORT MODE</span>
                <button 
                  onClick={async () => {
                    try {
                      await apiClient.post('/auth/logout');
                      window.location.href = '/';
                    } catch (_) {
                      window.location.href = '/';
                    }
                  }}
                  className="ml-2 underline text-white hover:text-amber-400 cursor-pointer font-extrabold uppercase"
                >
                  [EXIT]
                </button>
              </div>
            )}
            <div className="hidden md:flex items-center gap-4 text-[#bbc9cf]">
              {tickers.slice(0,3).map(t => (
                <span key={t.symbol} className="cursor-pointer hover:text-white transition-colors">
                  {t.display} <span className={t.change >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}>{t.change >= 0 ? '+' : ''}{t.change}%</span>
                </span>
              ))}
            </div>
          </div>

          {/* Center: Scrolling Ticker */}
          <div className="hidden lg:block flex-1 mx-8 overflow-hidden">
            <div className="animate-ticker flex gap-8 font-mono text-[10px] text-[#bbc9cf] whitespace-nowrap">
              {tickers.length > 0 && [...tickers, ...tickers].map((t, i) => (
                <span key={i}>
                  {t.display} <span className={t.change >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}>₹{t.price.toLocaleString(undefined, {maximumFractionDigits: 2})} {t.change >= 0 ? '▲' : '▼'}{Math.abs(t.change)}%</span>
                </span>
              ))}
            </div>
          </div>

          {/* Right: Logo + Balance + Notifications */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="HELLO TRADER" className="h-7 w-auto object-contain hidden sm:block" onError={e => e.target.style.display='none'} />
            
            {/* Market Mode Switcher */}
            <div className="flex bg-[#1d2026] border border-[#3c494e]/50 p-0.5 rounded-lg text-xs font-mono shrink-0">
              <button
                onClick={() => setMarketMode('INDIAN')}
                className={`px-2 py-1 rounded font-extrabold text-[10px] transition-all flex items-center gap-1 ${marketMode === 'INDIAN' ? 'bg-[#00d4ff] text-black shadow-md' : 'text-[#bbc9cf] hover:text-white'}`}
              >
                🇮🇳 IND
              </button>
              <button
                onClick={() => setMarketMode('FOREX')}
                className={`px-2 py-1 rounded font-extrabold text-[10px] transition-all flex items-center gap-1 ${marketMode === 'FOREX' ? 'bg-[#00d4ff] text-black shadow-md' : 'text-[#bbc9cf] hover:text-white'}`}
              >
                🌍 FRX
              </button>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-[#1d2026] border border-[#3c494e]/50 px-3 py-1 rounded-lg text-xs font-mono">
              <span className="text-gray-400 text-[10px]">TOKENS</span>
              <span className="font-extrabold text-[#00FF41]" suppressHydrationWarning>🪙 {Math.max(0, balance).toLocaleString('en-IN')} Tokens</span>
              <span className="w-[1px] h-4 bg-white/10" />
              <span className={`font-bold ${activePnlTotal >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`} suppressHydrationWarning>
                {activePnlTotal >= 0 ? '+' : ''}₹{activePnlTotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
            </div>
            <InstallPwaModal variant="header" />

            <button 
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="text-[#bbc9cf] hover:text-[#00d4ff] transition-colors p-1.5 rounded-lg hover:bg-white/5 relative active:scale-95"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#00d4ff] rounded-full animate-ping" />
              )}
            </button>
            <div className="w-7 h-7 rounded-full bg-[#1d2026] border border-[#00d4ff]/40 flex items-center justify-center text-[10px] font-bold text-[#00d4ff]">
              HT
            </div>
          </div>
        </header>

        {/* Notifications Modal */}
        <NotificationsModal 
          isOpen={isNotifOpen} 
          onClose={() => setIsNotifOpen(false)} 
          notifications={notifications} 
          onClearAll={() => setNotifications([])} 
        />

        {/* Scrollable Ticker Tape below header */}
        <div className="mt-[52px] border-b border-[#3c494e]/20 bg-[#0b0e14] h-7 overflow-hidden flex items-center font-mono text-[10px] text-[#bbc9cf]">
          <div className="animate-ticker flex gap-8 px-4 whitespace-nowrap">
            {tickers.length > 0 && [...tickers, ...tickers, ...tickers].map((t, i) => (
              <span key={i} className="shrink-0">
                <span className="font-bold text-gray-300">{t.display}</span>{' '}
                ₹{t.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}{' '}
                <span className={t.change >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}>
                  {t.change >= 0 ? '▲' : '▼'}{Math.abs(t.change)}%
                </span>
                {'  ·  '}
              </span>
            ))}
          </div>
        </div>

        {/* 🔒 PRO FEATURE Recharge Modal */}
        {showRechargeModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0b0e14]/85 backdrop-blur-md p-4 font-mono text-xs animate-fadeIn">
            <div className="bg-[#10131a] border border-[#D4AF37]/40 rounded-2xl w-full max-w-sm p-6 shadow-[0_0_50px_rgba(212,175,55,0.25)] space-y-5 relative text-center">
              <button 
                onClick={() => setShowRechargeModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>

              <div className="w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] mx-auto shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                <Lock className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-black text-[#D4AF37] tracking-widest uppercase">
                  🔒 PRO FEATURE
                </div>
                <h2 className="text-base font-extrabold text-white">Your free trial has ended.</h2>
                <p className="text-xs text-gray-400 leading-relaxed px-2">
                  Recharge to unlock this feature and continue using Hello Trader Pro.
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  onClick={() => {
                    setShowRechargeModal(false);
                    setActiveTab('wallet');
                  }}
                  className="w-full py-3 bg-gradient-to-r from-[#D4AF37] via-[#F59E0B] to-[#D97706] hover:brightness-110 text-black font-black text-xs tracking-wider rounded-xl shadow-[0_0_25px_rgba(212,175,55,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 uppercase cursor-pointer"
                >
                  [ RECHARGE / ACTIVATE ]
                </button>
                <button
                  onClick={() => setShowRechargeModal(false)}
                  className="text-[11px] text-gray-500 hover:text-gray-300 font-bold block w-full py-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'desk' && (
              <div className="flex h-full">
                <div className="w-48 border-r border-[#3c494e]/20 overflow-hidden">
                  <Watchlist />
                </div>
                <div className="flex-1 overflow-hidden">
                  <TradingDesk />
                </div>
              </div>
            )}
            {activeTab === 'dashboard' && <Dashboard setActiveTab={handleTabChange} />}
            {activeTab === 'trade' && <TradeHub user={user} />}
            {activeTab === 'option-chain' && <OptionChain />}
            {activeTab === 'market-intel' && <MarketIntel />}
            {activeTab === 'scanner' && <MarketScanner />}
            {activeTab === 'ai-lab' && <AILab />}
            {activeTab === 'wallet' && <WalletHub />}
            {activeTab === 'admin' && <AdminPortal />}
            {activeTab === 'static-ip' && <AdminPortal initialTab="STATIC_IP" />}
            {activeTab === 'guardian' && <GuardianDashboard />}
            {activeTab === 'referral' && <ReferralDashboard />}
            {activeTab === 'settings' && <UserSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}
