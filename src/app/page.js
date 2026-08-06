'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import Sidebar from '../components/Sidebar';
import Watchlist from '../components/Watchlist';
import Dashboard from '../components/Dashboard';
import TradingDesk from '../components/TradingDesk';
import OptionChain from '../components/OptionChain';
import MarketScanner from '../components/MarketScanner';
import AILab from '../components/AILab';
import WalletHub from '../components/WalletHub';
import AdminPortal from '../components/AdminPortal';
import ReferralDashboard from '../components/Referral';
import ApiStatusMonitor from '../components/ApiStatusMonitor';
import apiClient from '../lib/axios';
import { Bell, User, TrendingUp, TrendingDown, Lock, CheckCircle2, AlertTriangle, Key, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function Home() {
  const { 
    isServerOnline, setIsServerOnline,
    balance, activePnlTotal, currentStudent, monthlySubCost, 
    setCurrentStudentId, students, submitSignupRequest,
    membershipPlans, purchaseSubscription, adminConfig,
    resetUserPassword
  } = useTrading();
  
  const { tickers, marketMode, setMarketMode } = useMarketProvider();

  const [activeTab, setActiveTab] = useState('desk');

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [studentIdInput, setStudentIdInput] = useState('');
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

  // Check URL query parameters for referral link (e.g. ?ref=HT1001)
  
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiClient.get('/auth/me');
        if (res.data && res.data.user) {
          setIsAuthenticated(true);
          if (res.data.user.role === 'ADMIN') {
            setIsAdmin(true);
            setActiveTab('admin');
          } else {
            setCurrentStudentId(res.data.user.id);
            setActiveTab('desk');
          }
        }
      } catch (err) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);


  const handleLogin = (e) => {
    e.preventDefault();
    if (!studentIdInput || !passwordInput) return;

    // Search by student code (e.g. HT1001) or standard database ID (STU-001)
    const student = students.find(s => 
      (s.id.toLowerCase() === studentIdInput.trim().toLowerCase() || 
       s.refCode.toLowerCase() === studentIdInput.trim().toLowerCase()) && 
      s.password === passwordInput
    );

    if (student) {
      if (student.status !== 'ACTIVE') {
        setLoginError('Account suspended or awaiting admin activation.');
        return;
      }

      // Clear admin session to avoid conflicts
      
      setIsAdmin(false);

      setCurrentStudentId(student.id);
      setIsAuthenticated(true);
      setLoginError('');
      setActiveTab('desk'); // Explicitly route to student desk
      

      // Force password reset for all newly approved accounts
      if (student.requiresPasswordReset || passwordInput.startsWith('HT@') || passwordInput === 'password123' || passwordInput === 'password456') {
        setRequiresReset(true);
      }
    } else {
      setLoginError('Invalid Student ID or Password.');
    }
  };

  
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/auth/login', {
        emailOrPhone: adminEmailInput.trim(),
        password: adminPasswordInput
      });
      if (res.data && res.data.user && res.data.user.role === 'ADMIN') {
        setIsAdmin(true);
        setIsAuthenticated(true);
        setAdminLoginError('');
        setActiveTab('admin');
        setShowAdminLogin(false);
      } else {
        setAdminLoginError('Access Denied. Not an admin.');
      }
    } catch (err) {
      setAdminLoginError('Invalid Admin Email, Phone, or Password.');
    }
  };


  const handlePasswordReset = (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 5) {
      setResetError('Password must contain at least 5 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    // Call context action to update password correctly in students array
    resetUserPassword(currentStudent.id, newPassword);
    
    // Explicitly clear any admin hooks and redirect user to desk
    
    setIsAdmin(false);
    setActiveTab('desk');

    setRequiresReset(false);
    setResetError('');
    alert('Password updated successfully! Welcome to Hello Trader Pro.');
  };

  const handleSignupSubmit = (e) => {
    e.preventDefault();
    setSignupError('');

    const res = submitSignupRequest(signupName, signupEmail, signupPhone, signupRefCode);
    if (res.success) {
      setSignupSuccess(true);
      setSignupName('');
      setSignupEmail('');
      setSignupPhone('');
      setSignupRefCode('');
    } else {
      setSignupError(res.error);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsAdmin(false);
    setStudentIdInput('');
    setPasswordInput('');
    setAdminEmailInput('');
    setAdminPhoneInput('');
    setAdminPasswordInput('');
    setActiveTab('desk'); // Ensure it defaults back to desk for the next user
    
    
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

          <div className="text-center pt-2.5 border-t border-white/5">
            <button 
              onClick={() => {
                setIsSignupOpen(false);
                setSignupSuccess(false);
                setSignupError('');
              }}
              className="text-gray-400 hover:text-white font-bold transition-colors"
            >
              Already have credentials? Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Login Authentication Overlay ───
  if (!isAuthenticated) {
    if (showAdminLogin) {
      return (
        <div role="application" className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0e14] font-mono text-xs text-[#bbc9cf] p-4 animate-fadeIn">
          <div className="bg-[#10131a] border border-red-500/20 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-6">
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
                ← Back to Student Terminal
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div role="application" className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0e14] font-mono text-xs text-[#bbc9cf] p-4">
        <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center">
            {/* Click 5 times to trigger showAdminLogin */}
            <div 
              onClick={() => {
                setLockClicks(c => {
                  const next = c + 1;
                  if (next >= 5) {
                    setShowAdminLogin(true);
                    return 0; // reset
                  }
                  return next;
                });
              }}
              className="w-12 h-12 rounded-full bg-[#00D4FF]/10 border border-[#00D4FF]/30 flex items-center justify-center text-[#00D4FF] mb-2 cursor-pointer hover:bg-[#00D4FF]/20 transition-all active:scale-95"
              title="Hello Trader Security Lock"
            >
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">HELLO TRADER TERMINAL</h2>
            <p className="text-[10px] text-gray-500 mt-1">Demat Trading Education Environment</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-gray-400 font-bold mb-1">STUDENT ID / CODE</label>
              <input 
                type="text"
                disabled={!isServerOnline}
                value={studentIdInput}
                onChange={e => setStudentIdInput(e.target.value)}
                placeholder="e.g. HT1001"
                className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2.5 rounded-lg text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
                required
              />
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1">PASSWORD</label>
              <div className="relative">
                <input 
                  type={showStudentPassword ? "text" : "password"}
                  disabled={!isServerOnline}
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0b0e14] border border-white/10 pl-3 pr-10 py-2.5 rounded-lg text-white focus:outline-none focus:border-[#00D4FF]"
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
              className="w-full py-2.5 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded-lg text-xs transition-colors"
            >
              AUTHENTICATE ACCOUNT
            </button>
          </form>

          <div className="text-center pt-2.5 border-t border-white/5">
            <button 
              onClick={() => setIsSignupOpen(true)}
              className="text-[#00D4FF] hover:underline font-bold"
            >
              Don't have an account? Sign Up Now
            </button>
          </div>
        </div>
      </div>
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

  return (
    <div className="flex h-screen bg-[#0b0e14] text-white overflow-hidden">
      <ApiStatusMonitor onStatusChange={setIsServerOnline} />
      {/* Fixed Left Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} handleLogout={handleLogout} isAdmin={isAdmin} />

      {/* Main Content Area */}
      <div className="ml-[240px] flex-1 flex flex-col overflow-hidden">
        
        {/* Top Nav Bar */}
        <header className="fixed top-0 left-[240px] right-0 z-50 h-[52px] bg-[#10131a]/90 backdrop-blur-xl border-b border-[#3c494e]/30 flex items-center justify-between px-4 shadow-lg">
          {/* Left: Live Status + Index Prices */}
          <div className="flex items-center gap-4 font-mono text-xs">
            <div className="flex items-center gap-1.5 bg-[#00FF41]/10 border border-[#00FF41]/30 px-2 py-0.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-ping" />
              <span className="text-[10px] font-bold text-[#00FF41] tracking-wide">LIVE MARKET ({marketMode === 'INDIAN' ? 'INDIA' : 'FOREX'})</span>
            </div>
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
              <span className="text-gray-400 text-[10px]">BALANCE</span>
              <span className="font-extrabold text-white" suppressHydrationWarning>₹{balance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <span className="w-[1px] h-4 bg-white/10" />
              <span className={`font-bold ${activePnlTotal >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`} suppressHydrationWarning>
                {activePnlTotal >= 0 ? '+' : ''}₹{activePnlTotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
            </div>
            <button className="text-[#bbc9cf] hover:text-[#00d4ff] transition-colors p-1.5 rounded-lg hover:bg-white/5 relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#00d4ff] rounded-full" />
            </button>
            <div className="w-7 h-7 rounded-full bg-[#1d2026] border border-[#00d4ff]/40 flex items-center justify-center text-[10px] font-bold text-[#00d4ff]">
              HT
            </div>
          </div>
        </header>

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

        {/* Page Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {(() => {
            const isTrialActive = currentStudent?.trialStartedAt && (Date.now() - new Date(currentStudent.trialStartedAt).getTime()) < (4 * 24 * 60 * 60 * 1000);
            const isSubActive = currentStudent?.subscriptionActive && currentStudent?.subscriptionExpiry && (new Date() < new Date(currentStudent.subscriptionExpiry));
            const isBlocked = !isTrialActive && !isSubActive;
            const isTabBlocked = isBlocked && ['desk', 'option-chain', 'scanner', 'ai-lab'].includes(activeTab);

            if (isTabBlocked) {
              return (
                <div className="flex-1 flex items-center justify-center bg-[#0b0e14]/40 backdrop-blur-xl p-6 font-mono text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[#0b0e14]/80 pointer-events-none" />
                  <div className="bg-[#10131a] border border-red-500/30 rounded-2xl w-full max-w-md p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] space-y-6 relative z-10">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 animate-pulse">
                        <Lock className="w-8 h-8" />
                      </div>
                      <h2 className="text-lg font-extrabold text-white tracking-wide uppercase">TERMINAL ACCESS RESTRICTED</h2>
                      <p className="text-[11px] text-gray-500">Your 4-day free trial has expired or you do not have an active membership plan.</p>
                    </div>
                    
                    <div className="space-y-3.5 max-h-48 overflow-y-auto">
                      <div className="flex justify-between text-[#bbc9cf] text-[10px] uppercase font-bold border-b border-white/5 pb-1">
                        <span>AVAILABLE PLANS</span>
                        <span className="text-gray-500">Wallet Balance: ₹{balance} Tokens</span>
                      </div>
                      {membershipPlans.map(plan => (
                        <div key={plan.id} className="bg-[#0b0e14] p-3 rounded-xl border border-white/5 flex items-center justify-between gap-3 text-left">
                          <div className="space-y-0.5">
                            <span className="font-bold text-white text-[11px] block">{plan.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono leading-snug block">{plan.durationDays} Days • {plan.description}</span>
                          </div>
                          <button
                            onClick={() => {
                              if (balance < plan.price) {
                                alert(`Insufficient balance to purchase. Please recharge ₹${plan.price - balance} tokens first.`);
                                return;
                              }
                              purchaseSubscription(plan.id);
                            }}
                            className="px-3 py-1.5 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded text-[10px] shrink-0"
                          >
                            Buy ₹{plan.price}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="text-[11px] text-gray-400">
                      Please recharge your wallet and activate your subscription to unlock trading charts, options tables, and scanner alerts.
                    </div>

                    <button 
                      onClick={() => setActiveTab('wallet')}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold tracking-wider rounded-lg text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      ADD TOKENS / RECHARGE WALLET
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="flex-1 overflow-hidden">
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
                {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
                {activeTab === 'option-chain' && <OptionChain />}
                {activeTab === 'scanner' && <MarketScanner />}
                {activeTab === 'ai-lab' && <AILab />}
                {activeTab === 'wallet' && <WalletHub />}
                {activeTab === 'admin' && <AdminPortal />}
                {activeTab === 'referral' && <ReferralDashboard />}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
