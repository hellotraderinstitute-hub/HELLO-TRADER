'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useMarketProvider } from './MarketProviderContext';
import apiClient from '../lib/axios';

const TradingContext = createContext();
export let globalServerStatus = true;

export function TradingProvider({ children }) {
  const { tickers } = useMarketProvider();

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
      const [wRes, mRes] = await Promise.all([
        apiClient.get('/wallet').catch(() => ({ data: { tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] } })),
        apiClient.get('/membership').catch(() => ({ data: { membership: null, trialStartedAt: null } })),
      ]);

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
    return (Date.now() - startedAt) < (4 * 24 * 60 * 60 * 1000);
  }, [authLoading, user, isAdmin, trialStartedAt]);

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

  // ─── Actions ──────────────────────────────────────────────────────────────
  const placeOrder = useCallback(async (orderData) => {
    if (isExpiredTrial && dailyFreeTradeCount >= 1) {
      setShowRechargeModal(true);
      return;
    }

    try {
      const tickerPrice = (tickers || []).find(t => t.symbol === orderData.symbol)?.price;
      const currentPrice = orderData.price || tickerPrice || 100;
      const res = await apiClient.post('/trade/place', {
        symbol: orderData.symbol,
        productType: orderData.productType || 'INTRADAY',
        orderType: orderData.side || orderData.orderType || 'BUY',
        quantity: Number(orderData.quantity) || 1,
        entryPrice: Number(currentPrice)
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
  }, [tickers, isExpiredTrial, dailyFreeTradeCount, user?.id, user?.studentId, currentStudentId, fetchPositions, fetchFinancials]);

  const closePosition = useCallback(async (tradeId) => {
    try {
      const trade = positions.find(p => p.id === tradeId);
      const tickerPrice = (tickers || []).find(t => t.symbol === trade?.symbol)?.price;
      const exitPrice = tickerPrice || trade?.entryPrice || 100;
      await apiClient.post('/trade/close', { tradeId, exitPrice: Number(exitPrice) });
      alert('Position Closed Successfully!');
      fetchPositions();
      fetchFinancials();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close position');
    }
  }, [positions, tickers, fetchPositions, fetchFinancials]);

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
    autoRenew: membership.autoRenew
  }), [currentStudentId, user, membership]);

  const enrichedPositions = useMemo(() => (positions || []).map(p => {
    const currentPrice = (tickers || []).find(t => t.symbol === p.symbol)?.price || p.entryPrice || 0;
    const isBuy = p.orderType === 'BUY';
    const pnl = isBuy
      ? (currentPrice - (p.entryPrice || 0)) * (p.quantity || 0)
      : ((p.entryPrice || 0) - currentPrice) * (p.quantity || 0);
    const margin = p.productType === 'INTRADAY'
      ? ((p.entryPrice || 0) * (p.quantity || 0)) / 5
      : ((p.entryPrice || 0) * (p.quantity || 0));
    return {
      ...p,
      display: p.symbol || '',
      side: p.orderType || '',
      currentPrice,
      leverage: p.productType === 'INTRADAY' ? 5 : 1,
      pnl,
      pnlPercent: margin > 0 ? ((pnl / margin) * 100).toFixed(2) : '0'
    };
  }), [positions, tickers]);

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
