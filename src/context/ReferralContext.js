'use client';

import React, { createContext, useContext } from 'react';

const ReferralContext = createContext(null);

// ReferralProvider is now a no-op wrapper.
// All referral data is fetched directly from the backend API in Referral.js
export function ReferralProvider({ children }) {
  return (
    <ReferralContext.Provider value={{ initialized: true, loading: false, error: null }}>
      {children}
    </ReferralContext.Provider>
  );
}

export function useReferral() {
  const ctx = useContext(ReferralContext);
  if (!ctx) throw new Error('useReferral must be used within ReferralProvider');
  return ctx;
}

export function useReferralContext() {
  return useReferral();
}
