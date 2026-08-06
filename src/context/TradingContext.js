'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useMarketProvider } from './MarketProviderContext';
import apiClient from '../lib/axios';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const socket = io(API_URL.replace('/api', ''), { autoConnect: false });

const TradingContext = createContext();
export let globalServerStatus = true;

export function TradingProvider({ children }) {
  const { tickers } = useMarketProvider();

  const [isServerOnline, setIsServerOnline] = useState(true);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [user, setUser] = useState(null);
  
  // Financial State from Backend
  const [wallet, setWallet] = useState({ tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] });
  const [membership, setMembership] = useState({ status: 'INACTIVE', expiresAt: null, autoRenew: false, trialStartedAt: null });
  const [settings, setSettings] = useState({ monthlyCost: 900, tokenPrice: 1, trialDays: 4 });
  
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);

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

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsServerOnline(globalServerStatus);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchFinancials = useCallback(async () => {
    if (!currentStudentId) return;
    try {
      const [wRes, mRes] = await Promise.all([
        apiClient.get('/wallet'),
        apiClient.get('/membership')
      ]);
      setWallet(wRes.data);
      if (mRes.data.membership) {
        setMembership({
          status: mRes.data.membership.status,
          expiresAt: mRes.data.membership.expiresAt,
          autoRenew: mRes.data.membership.autoRenew,
          trialStartedAt: mRes.data.trialStartedAt
        });
      } else {
        setMembership(prev => ({ ...prev, trialStartedAt: mRes.data.trialStartedAt }));
      }
      if (mRes.data.settings) setSettings(mRes.data.settings);
    } catch (error) {
      console.error("Failed to load financials", error);
    }
  }, [currentStudentId]);

  useEffect(() => {
    fetchFinancials();
    const interval = setInterval(fetchFinancials, 15000);
    return () => clearInterval(interval);
  }, [fetchFinancials]);

  // Derived values for compatibility with old components
  const balance = wallet.tokenBalance;
  const paperBalance = wallet.paperBalance;
  const activePnlTotal = 0; // Simplified for now
  const monthlySubCost = settings.monthlyCost;
  
  // Dummy methods to prevent crashes in unmigrated components
  const purchaseSubscription = async (planId) => {
    await apiClient.post('/membership/activate');
    fetchFinancials();
  };
  const submitRechargeRequest = () => {};
  const submitReferral = () => {};
  const toggleStudentAutoRenew = async () => {
    await apiClient.post('/membership/auto-renew', { autoRenew: !membership.autoRenew });
    fetchFinancials();
  };
  const resetUserPassword = () => {};
  const submitSignupRequest = () => ({ success: true });

  const placeOrder = async (orderData) => {
    try {
      const res = await apiClient.post('/trade/place', {
        symbol: orderData.symbol,
        productType: orderData.productType,
        orderType: orderData.side,
        quantity: orderData.quantity,
        entryPrice: tickers.find(t => t.symbol === orderData.symbol)?.price || 0
      });
      alert('Order Placed Successfully!');
      fetchPositions();
      fetchFinancials();
      return res.data;
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to place order');
    }
  };

  const closePosition = async (tradeId) => {
    try {
      const trade = positions.find(p => p.id === tradeId);
      const exitPrice = tickers.find(t => t.symbol === trade?.symbol)?.price || 0;
      await apiClient.post('/trade/close', { tradeId, exitPrice });
      alert('Position Closed Successfully!');
      fetchPositions();
      fetchFinancials();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close position');
    }
  };
  
  const currentStudent = useMemo(() => {
    return {
      id: currentStudentId,
      name: user?.name || 'Student',
      subscriptionActive: membership.status === 'ACTIVE',
      subscriptionExpiry: membership.expiresAt,
      trialStartedAt: membership.trialStartedAt,
      autoRenew: membership.autoRenew
    };
  }, [currentStudentId, user, membership]);

  const value = {
    isServerOnline,
    setIsServerOnline,
    currentStudentId,
    setCurrentStudentId,
    setUser,
    user,
    wallet,
    balance,
    paperBalance,
    membership,
    settings,
    monthlySubCost,
    currentStudent,
    purchaseSubscription,
    submitRechargeRequest,
    submitReferral,
    toggleStudentAutoRenew,
    resetUserPassword,
    submitSignupRequest,
    placeOrder,
    closePosition,
    positions: positions.map(p => {
      const currentPrice = tickers.find(t => t.symbol === p.symbol)?.price || p.entryPrice;
      const isBuy = p.orderType === 'BUY';
      const pnl = isBuy ? (currentPrice - p.entryPrice) * p.quantity : (p.entryPrice - currentPrice) * p.quantity;
      const margin = p.productType === 'INTRADAY' ? (p.entryPrice * p.quantity) / 5 : (p.entryPrice * p.quantity);
      return {
        ...p,
        display: p.symbol,
        side: p.orderType,
        currentPrice,
        leverage: p.productType === 'INTRADAY' ? 5 : 1,
        pnl,
        pnlPercent: margin > 0 ? ((pnl / margin) * 100).toFixed(2) : 0
      };
    }),
    tradeHistory: tradeHistory.map(t => ({
      ...t,
      display: t.symbol,
      side: t.orderType,
      time: new Date(t.closedAt).toLocaleTimeString()
    })),
    activePnlTotal,
    students: [currentStudent],
    membershipPlans: [{ id: 'PLAN-30', price: settings.monthlyCost, durationDays: 30, name: 'Monthly Membership' }]
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
