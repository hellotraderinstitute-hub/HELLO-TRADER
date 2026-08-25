'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../../context/TradingContext';
import AdminPortal from '../../components/AdminPortal';
import Sidebar from '../../components/Sidebar';
import apiClient from '../../lib/axios';
import { Lock } from 'lucide-react';

export default function StandaloneAdminPage() {
  const { user, setUser, setCurrentStudentId, authLoading, setAuthLoading } = useTrading();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiClient.get('/auth/me');
        if (res.data && res.data.user) {
          const u = res.data.user;
          setUser(u);
          setCurrentStudentId(u.id);
          setIsAuthenticated(true);
          if (String(u.role || '').trim().toLowerCase() === 'admin') {
            setIsAdmin(true);
          }
        }
      } catch (_) {
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [setUser, setCurrentStudentId, setAuthLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0e14] text-white flex flex-col items-center justify-center font-mono space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" />
        <div className="text-xs text-gray-400 font-bold uppercase tracking-widest">VERIFYING ADMIN AUTHENTICATION...</div>
      </div>
    );
  }

  if (!isAuthenticated || (!isAdmin && user?.role?.toLowerCase() !== 'admin')) {
    return (
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center font-mono text-xs text-white p-4">
        <div className="bg-[#10131a] border border-red-500/30 rounded-2xl w-full max-w-sm p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold uppercase tracking-wider">SUPERADMIN ACCESS REQUIRED</h2>
          <p className="text-[10px] text-gray-400">
            You must be logged in with an Admin account to access the Admin Portal.
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
          >
            RETURN TO TERMINAL LOGIN
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-white flex font-sans">
      <Sidebar activeTab="admin" setActiveTab={() => {}} isAdmin={true} />
      <div className="flex-1 ml-[240px] p-6 overflow-y-auto space-y-4">
        <AdminPortal />
      </div>
    </div>
  );
}
