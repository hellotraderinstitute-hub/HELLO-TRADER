'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ReferralContext = createContext(null);

export function ReferralProvider({ children }) {
  const [userRefCode, setUserRefCode] = useState('HT-839XQ'); // Mock static code for now
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [referrals, setReferrals] = useState([
    // Mock data for display
    { id: '1', user: 'trader_x', date: '2026-08-01', volumeTraded: 450000, commissionEarned: 125.50, status: 'Active' },
    { id: '2', user: 'bull_runner', date: '2026-08-03', volumeTraded: 120000, commissionEarned: 45.20, status: 'Active' },
    { id: '3', user: 'crypto_whale', date: '2026-08-05', volumeTraded: 890000, commissionEarned: 310.80, status: 'Active' },
  ]);
  const [leaderboard, setLeaderboard] = useState([
    { rank: 1, user: 'AlphaTrader', totalCommission: 12500, refs: 145 },
    { rank: 2, user: 'OptionKing', totalCommission: 9800, refs: 89 },
    { rank: 3, user: 'HT-839XQ', totalCommission: 481.50, refs: 3 }, // User
    { rank: 4, user: 'DeltaNeutral', totalCommission: 410, refs: 12 },
    { rank: 5, user: 'Scalper247', totalCommission: 290, refs: 8 },
  ]);

  useEffect(() => {
    const earnings = referrals.reduce((sum, r) => sum + r.commissionEarned, 0);
    setTotalEarnings(earnings);
  }, [referrals]);

  // Simulate a new referral joining
  const simulateNewReferral = useCallback(() => {
    const newRef = {
      id: Date.now().toString(),
      user: `user_${Math.floor(Math.random() * 1000)}`,
      date: new Date().toISOString().split('T')[0],
      volumeTraded: 0,
      commissionEarned: 0,
      status: 'Pending Verification'
    };
    setReferrals(prev => [newRef, ...prev]);
  }, []);

  return (
    <ReferralContext.Provider value={{
      userRefCode,
      totalEarnings,
      referrals,
      leaderboard,
      simulateNewReferral
    }}>
      {children}
    </ReferralContext.Provider>
  );
}

export function useReferral() {
  const ctx = useContext(ReferralContext);
  if (!ctx) throw new Error('useReferral must be used within ReferralProvider');
  return ctx;
}
