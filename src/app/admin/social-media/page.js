'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../../../context/TradingContext';
import SocialMediaManager from '../../../components/SocialMediaManager';
import Sidebar from '../../../components/Sidebar';
import apiClient from '../../../lib/axios';
import { Lock, ShieldCheck } from 'lucide-react';

export default function AdminSocialMediaPage() {
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
            You must be logged in with a Superadmin account to access /admin/social-media.
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
    <div className="flex h-screen bg-[#0b0e14] text-white overflow-hidden">
      <Sidebar activeTab="admin" setActiveTab={() => {}} isAdmin={true} />
      <div className="md:ml-[240px] ml-0 flex-1 flex flex-col overflow-hidden">
        <header className="fixed top-0 md:left-[240px] left-0 right-0 z-50 h-[52px] bg-[#10131a]/90 backdrop-blur-xl border-b border-[#3c494e]/30 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 font-mono text-xs">
            <ShieldCheck className="w-4 h-4 text-red-400" />
            <span className="font-extrabold text-white">HELLO TRADER ADMIN</span>
            <span className="text-gray-500">/</span>
            <span className="text-[#D4AF37] font-bold">SOCIAL MEDIA MANAGER</span>
          </div>
          <a href="/" className="text-xs text-gray-400 hover:text-white font-bold font-mono">
            ← Main Portal
          </a>
        </header>
        <div className="flex-1 mt-[52px] overflow-y-auto">
          <SocialMediaManager />
        </div>
      </div>
    </div>
  );
}
