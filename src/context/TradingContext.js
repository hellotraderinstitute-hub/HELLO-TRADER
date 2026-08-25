'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useMarketProvider } from './MarketProviderContext';
import apiClient from '../lib/axios';

const TradingContext = createContext();
export let globalServerStatus = true;

export function TradingProvider({ children }) {
  const { tickers, resolvePrice, updateOptionQuotes, getQuoteInfo } = useMarketProvider();

  const [isServerOnline, setIsServerOnline] = useState(true);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState(null);

  const [wallet, setWallet] = useState({ tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] });
  const [membership, setMembership] = useState({ status: 'INACTIVE', expiresAt: null, autoRenew: false, trialStartedAt: null });
  const [settings, setSettings] = useState({ monthlyCost: 900, tokenPrice: 1, trialDays: 4, membershipDuration: 30 });
  const [adminConfig, setAdminConfig] = useState({});
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [membershipPlans, setMembershipPlans] = useState([]);

  // ─── Fetch Functions (defined at top level, reusable everywhere) ──────────
  const fetchFinancials = useCallback(async () => {
    if (!currentStudentId) {
      setInitialized(true);
      return;
    }
    try {
      const [wRes, mRes, meRes] = await Promise.all([
        apiClient.get('/wallet').catch(() => ({ data: { tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] } })),
        apiClient.get('/membership').catch(() => ({ data: { membership: null, trialStartedAt: null } })),
        apiClient.get('/auth/me').catch(() => null)
      ]);

      if (meRes?.data?.user) {
        setUser(meRes.data.user);
      }

      const safeWallet = wRes.data ? {
        ...wRes.data,
        tokenBalance: Math.max(0, wRes.data.tokenBalance || 0),
        paperBalance: Math.max(0, wRes.data.paperBalance || 0),
        referralBalance: Math.max(0, wRes.data.referralBalance || 0)
      } : { tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] };

      setWallet(safeWallet);
      if (wRes.data?.tokenPrice) {
        setSettings(s => ({ ...s, tokenPrice: wRes.data.tokenPrice }));
      }

      if (mRes.data?.membership) {
        setMembership({
          status: mRes.data.membership.status,
          expiresAt: mRes.data.membership.expiresAt,
          autoRenew: mRes.data.membership.autoRenew,
          trialStartedAt: mRes.data.trialStartedAt
        });
      } else {
        setMembership(prev => ({ ...prev, trialStartedAt: mRes.data?.trialStartedAt || null }));
      }

      // Sync global trialDays default from server (may change when admin edits system settings)
      if (mRes.data?.trialDays != null) {
        setSettings(s => ({ ...s, trialDays: mRes.data.trialDays }));
      }
      // Sync per-user trialDaysOverride from server into user state
      if (meRes?.data?.user && mRes.data?.trialDaysOverride !== undefined) {
        setUser(prev => prev ? { ...prev, trialDaysOverride: mRes.data.trialDaysOverride } : prev);
      }

      setInitError(null);
      setInitialized(true);
    } catch (error) {
      console.error('Failed to load financials', error);
      setInitError(error.message || 'Failed to load data');
      setInitialized(true);
    }
  }, [currentStudentId]);

  const fetchPositions = useCallback(async () => {
    if (!currentStudentId) return;
    try {
      const [posRes, histRes] = await Promise.all([
        apiClient.get('/trade/positions'),
        apiClient.get('/trade/history')
      ]);
      setPositions(posRes.data.openPositions || []);
      setTradeHistory(histRes.data.trades || []);
    } catch (err) {
      console.error('Failed to fetch trades', err);
    }
  }, [currentStudentId]);

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchFinancials();
    const interval = setInterval(fetchFinancials, 15000);
    return () => clearInterval(interval);
  }, [fetchFinancials]);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  // Authenticated user activity heartbeat (every 30s, active tab only)
  useEffect(() => {
    if (!currentStudentId) return;

    const sendHeartbeat = async () => {
      try {
        await apiClient.post('/auth/heartbeat');
      } catch (err) {
        console.warn('Heartbeat update failed:', err.message);
      }
    };

    // Immediate ping on focus/load
    sendHeartbeat();

    let heartbeatInterval = setInterval(sendHeartbeat, 30000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      } else {
        sendHeartbeat();
        if (!heartbeatInterval) {
          heartbeatInterval = setInterval(sendHeartbeat, 30000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentStudentId]);

  // Server status monitor
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await apiClient.get('/health', { timeout: 3000 });
        setIsServerOnline(true);
        globalServerStatus = true;
      } catch {
        setIsServerOnline(false);
        globalServerStatus = false;
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // ─── Centralized Access Control Hook & Helpers ──────────────────────────────
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  const isAdmin = useMemo(() => {
    if (authLoading || !user) return false;
    const role = String(user.role || '').trim().toUpperCase();
    const email = String(user.email || '').trim().toLowerCase();
    return role === 'ADMIN' || email === 'hellotraderinstitute@gmail.com';
  }, [authLoading, user]);

  const trialStartedAt = useMemo(() => {
    return user?.trialStartedAt || membership?.trialStartedAt || user?.createdAt || null;
  }, [user?.trialStartedAt, membership?.trialStartedAt, user?.createdAt]);

  const isTrialActive = useMemo(() => {
    if (authLoading || !user) return false;
    if (isAdmin) return true;
    if (!trialStartedAt) return false;
    const startedAt = new Date(trialStartedAt).getTime();
    if (isNaN(startedAt)) return false;
    const trialDays = (user?.trialDaysOverride !== null && user?.trialDaysOverride !== undefined)
      ? user.trialDaysOverride
      : (settings?.trialDays || 4);
    return (Date.now() - startedAt) < (trialDays * 24 * 60 * 60 * 1000);
  }, [authLoading, user, isAdmin, trialStartedAt, settings?.trialDays, user?.trialDaysOverride]);

  const isSubActive = useMemo(() => {
    if (authLoading || !user) return false;
    if (isAdmin) return true;
    const expiresAt = user?.subscriptionExpiry || membership?.expiresAt;
    if (!expiresAt) return false;
    const expTime = new Date(expiresAt).getTime();
    if (isNaN(expTime)) return false;
    return Date.now() < expTime;
  }, [authLoading, user, isAdmin, user?.subscriptionExpiry, membership?.expiresAt]);

  const isExpiredTrial = useMemo(() => {
    if (authLoading || !user) return false;
    if (isAdmin) return false;
    return !isTrialActive && !isSubActive;
  }, [authLoading, user, isAdmin, isTrialActive, isSubActive]);

  const canUseProFeature = useCallback((featureKey) => {
    if (authLoading || !user) return false; // Fail-closed when loading or unauthenticated
    if (isAdmin) return true;
    if (isTrialActive || isSubActive) return true;
    return false;
  }, [authLoading, user, isAdmin, isTrialActive, isSubActive]);

  const dailyFreeTradeCount = useMemo(() => {
    if (isAdmin) return 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    const userId = user?.id || user?.studentId || currentStudentId || 'user';
    
    let count = 0;
    const historyTrades = Array.isArray(tradeHistory) ? tradeHistory : [];
    historyTrades.forEach(t => {
      const dateStr = new Date(t.timestamp || t.createdAt || Date.now()).toISOString().slice(0, 10);
      if (dateStr === todayStr) count++;
    });

    const openPositions = Array.isArray(positions) ? positions : [];
    openPositions.forEach(p => {
      const dateStr = new Date(p.openedAt || p.createdAt || Date.now()).toISOString().slice(0, 10);
      if (dateStr === todayStr) count++;
    });

    const localKey = `ht_trades_count_${userId}_${todayStr}`;
    const localVal = parseInt(typeof window !== 'undefined' ? localStorage.getItem(localKey) || '0' : '0', 10);

    return Math.max(count, localVal);
  }, [isAdmin, tradeHistory, positions, user?.id, user?.studentId, currentStudentId]);

  const openRechargeModal = useCallback(() => {
    setShowRechargeModal(true);
  }, []);

  function isOptionContract(symbol) {
    if (!symbol) return false;
    const s = String(symbol).trim().toUpperCase();
    return /\s+(CE|PE)$/i.test(s) || /\d+(CE|PE)$/i.test(s) || /[-_](CE|PE)$/i.test(s);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  const placeOrder = useCallback(async (orderData) => {
    if (isExpiredTrial && dailyFreeTradeCount >= 1) {
      setShowRechargeModal(true);
      return;
    }

    try {
      const isOption = isOptionContract(orderData.symbol);
      const resolved = resolvePrice ? resolvePrice(orderData.symbol) : null;
      const currentPrice = orderData.orderExecutionType === 'LIMIT'
        ? (orderData.limitPrice || orderData.price || orderData.entryPrice || resolved || 100)
        : (orderData.price || resolved || orderData.entryPrice || 100);

      const res = await apiClient.post('/trade/place', {
        symbol: orderData.symbol,
        productType: orderData.productType || 'INTRADAY',
        orderType: orderData.side || orderData.orderType || 'BUY',
        quantity: Number(orderData.quantity) || 1,
        entryPrice: Number(currentPrice),
        orderExecutionType: orderData.orderExecutionType || 'MARKET',
        limitPrice: orderData.limitPrice ? Number(orderData.limitPrice) : null,
        currentMarketPrice: Number(resolved || orderData.price || currentPrice),
        type: orderData.type || (isOption ? 'OPTION' : 'EQUITY')
      });
      
      // Increment persistent daily trade count for current user
      const todayStr = new Date().toISOString().slice(0, 10);
      const userId = user?.id || user?.studentId || currentStudentId || 'user';
      const localKey = `ht_trades_count_${userId}_${todayStr}`;
      if (typeof window !== 'undefined') {
        const nextVal = (dailyFreeTradeCount || 0) + 1;
        localStorage.setItem(localKey, String(nextVal));
      }

      alert('Order Placed Successfully!');
      fetchPositions();
      fetchFinancials();
      return res.data;
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to place order');
    }
  }, [resolvePrice, isExpiredTrial, dailyFreeTradeCount, user?.id, user?.studentId, currentStudentId, fetchPositions, fetchFinancials]);

  const closePosition = useCallback(async (tradeId) => {
    try {
      const trade = positions.find(p => p.id === tradeId);
      const resolved = resolvePrice ? resolvePrice(trade?.symbol, trade?.entryPrice) : null;
      const exitPrice = resolved || trade?.entryPrice || 100;
      await apiClient.post('/trade/close', { tradeId, exitPrice: Number(exitPrice) });
      alert('Position Closed Successfully!');
      fetchPositions();
      fetchFinancials();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close position');
    }
  }, [positions, resolvePrice, fetchPositions, fetchFinancials]);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await apiClient.get('/membership/plans');
      if (res.data?.plans && res.data.plans.length > 0) {
        setMembershipPlans(res.data.plans);
      } else {
        const cost = settings?.monthlyCost || 900;
        setMembershipPlans([{ id: 'PLAN-30', price: cost, durationDays: 30, name: 'Monthly Membership', description: 'Standard 30-Day Terminal Access' }]);
      }
    } catch (_) {
      const cost = settings?.monthlyCost || 900;
      setMembershipPlans([{ id: 'PLAN-30', price: cost, durationDays: 30, name: 'Monthly Membership', description: 'Standard 30-Day Terminal Access' }]);
    }
  }, [settings?.monthlyCost]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const purchaseSubscription = useCallback(async (planId) => {
    try {
      const res = await apiClient.post('/membership/activate', { planId });
      alert(`Membership Activated! Valid for ${res.data?.durationDays || 30} days.`);
      await fetchFinancials();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to activate membership');
    }
  }, [fetchFinancials]);

  const toggleStudentAutoRenew = useCallback(async () => {
    try {
      await apiClient.post('/membership/auto-renew', { autoRenew: !membership.autoRenew });
      await fetchFinancials();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle auto-renew');
    }
  }, [membership.autoRenew, fetchFinancials]);

  const submitSignupRequest = useCallback(async (name, email, phone, referralCode) => {
    try {
      const res = await apiClient.post('/auth/signup-request', { name, email, phone, referralCode });
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to submit signup request' };
    }
  }, []);

  // ─── Derived Values ────────────────────────────────────────────────────────
  const currentStudent = useMemo(() => ({
    id: currentStudentId,
    name: user?.name || 'Student',
    email: user?.email || '',
    phone: user?.phone || '',
    studentId: user?.studentId || '',
    role: user?.role || 'USER',
    subscriptionActive: membership.status === 'ACTIVE',
    subscriptionExpiry: membership.expiresAt,
    trialStartedAt: membership.trialStartedAt,
    trialDaysOverride: user?.trialDaysOverride,
    createdAt: user?.createdAt,
    autoRenew: membership.autoRenew
  }), [currentStudentId, user, membership]);

  // ── Central Live Option Quotes Background Poller for Open Positions ────────
  useEffect(() => {
    // Check if there are any open option positions
    const openOptionPositions = (positions || []).filter(p => isOptionContract(p.symbol) && p.status !== 'CLOSED');
    if (openOptionPositions.length === 0) return;

    // Extract unique underlying indices (e.g. 'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX')
    const underlyings = Array.from(new Set(openOptionPositions.map(p => {
      const match = String(p.symbol).trim().match(/^([A-Z]+)/);
      return match ? match[1].toUpperCase() : 'NIFTY';
    })));

    let isMounted = true;
    const pollOpenOptionQuotes = async () => {
      for (const und of underlyings) {
        if (!isMounted) break;
        try {
          // Fetch active expiries for this underlying
          const expRes = await apiClient.get(`/trade/option-chain/expiries?symbol=${encodeURIComponent(und)}`);
          const expiries = expRes.data?.expiries || [];
          const activeExpiry = expiries[0] || '';

          if (activeExpiry) {
            const chainRes = await apiClient.get(`/trade/option-chain?symbol=${encodeURIComponent(und)}&expiry=${encodeURIComponent(activeExpiry)}`);
            if (isMounted && chainRes.data?.success && Array.isArray(chainRes.data?.contracts)) {
              updateOptionQuotes?.(chainRes.data.contracts, und, activeExpiry);
            }
          }
        } catch (err) {
          // Silently retain existing quotes on transient network hiccup
          console.warn(`[BackgroundOptionPoller] ${und} quote sync notice:`, err.message);
        }
      }
    };

    // Immediate initial poll
    pollOpenOptionQuotes();

    // Poll every 3.5s
    const pollerTimer = setInterval(pollOpenOptionQuotes, 3500);

    return () => {
      isMounted = false;
      clearInterval(pollerTimer);
    };
  }, [positions, updateOptionQuotes]);

  const enrichedPositions = useMemo(() => (positions || []).map(p => {
    const quoteInfo = getQuoteInfo ? getQuoteInfo(p.symbol, p.entryPrice) : { price: p.entryPrice || 0, isStale: false };
    const currentPrice = typeof quoteInfo.price === 'number' && quoteInfo.price > 0 ? quoteInfo.price : (p.entryPrice || 0);
    const isStale = quoteInfo.isStale || false;

    const isBuy = p.orderType === 'BUY';
    const isOption = isOptionContract(p.symbol);
    const pnl = isBuy
      ? (currentPrice - (p.entryPrice || 0)) * (p.quantity || 0)
      : ((p.entryPrice || 0) - currentPrice) * (p.quantity || 0);
    const leverage = isOption && isBuy ? 1 : (p.productType === 'INTRADAY' ? 5 : 1);
    const margin = isOption && isBuy
      ? ((p.entryPrice || 0) * (p.quantity || 0))
      : (p.productType === 'INTRADAY' ? ((p.entryPrice || 0) * (p.quantity || 0)) / 5 : ((p.entryPrice || 0) * (p.quantity || 0)));
    return {
      ...p,
      display: p.symbol || '',
      side: p.orderType || '',
      currentPrice,
      isStale,
      leverage,
      pnl: Number(pnl.toFixed(2)),
      pnlPercent: margin > 0 ? ((pnl / margin) * 100).toFixed(2) : '0'
    };
  }), [positions, getQuoteInfo]);

  const enrichedHistory = useMemo(() => (tradeHistory || []).map(t => ({
    ...t,
    display: t.symbol || '',
    side: t.orderType || '',
    time: t.closedAt ? new Date(t.closedAt).toLocaleTimeString() : ''
  })), [tradeHistory]);

  const activePnlTotal = useMemo(() =>
    enrichedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0),
    [enrichedPositions]
  );

  const value = {
    isServerOnline,
    setIsServerOnline,
    initialized,
    initError,
    authLoading,
    setAuthLoading,
    currentStudentId,
    setCurrentStudentId,
    setUser,
    user: user || {},
    isAdmin,
    isTrialActive,
    isSubActive,
    isExpiredTrial,
    canUseProFeature,
    dailyFreeTradeCount,
    showRechargeModal,
    setShowRechargeModal,
    openRechargeModal,
    wallet: wallet || { tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] },
    balance: wallet?.tokenBalance || 0,
    paperBalance: wallet?.paperBalance || 0,
    membership: membership || { status: 'INACTIVE', expiresAt: null, autoRenew: false, trialStartedAt: null },
    settings: settings || { monthlyCost: 900, tokenPrice: 1, trialDays: 4 },
    monthlySubCost: settings?.monthlyCost || 900,
    tokenExchangeRate: settings?.tokenPrice || 1,
    currentStudent,
    activePnlTotal,

    // Admin config
    adminConfig: adminConfig || {},
    updateAdminConfig: (cfg) => setAdminConfig(prev => ({ ...prev, ...cfg })),

    // Membership plans
    membershipPlans,
    fetchPlans,

    // Actions
    purchaseSubscription,
    toggleStudentAutoRenew,
    submitSignupRequest,
    placeOrder,
    closePosition,
    fetchFinancials,
    fetchPositions,

    // No-op stubs — these operations are now done directly in AdminPortal via apiClient
    approveRechargeRequest: async () => {},
    rejectRechargeRequest: async () => {},
    approveReferral: async () => {},
    rejectReferral: async () => {},
    creditWallet: async () => {},
    debitWallet: async () => {},
    reverseTransaction: async () => {},
    setUserStatus: async () => {},
    resetUserDevice: async () => {},
    resetUserPassword: async () => {},
    submitRechargeRequest: async () => {},
    submitReferral: async () => {},
    setTokenExchangeRate: (rate) => setSettings(s => ({ ...s, tokenPrice: rate })),
    setMonthlySubCost: (cost) => setSettings(s => ({ ...s, monthlyCost: cost })),

    positions: enrichedPositions,
    tradeHistory: enrichedHistory,
  };

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  return useContext(TradingContext);
}
