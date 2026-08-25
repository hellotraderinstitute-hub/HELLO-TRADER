'use client';

import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { ShieldAlert, KeyRound, User, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import apiClient from '../lib/axios';

export default function UserSettings() {
  const { user, fetchFinancials, currentStudent } = useTrading();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Format Registration IST string
  const formatRegistrationDate = (createdAt) => {
    if (!createdAt) return '—';
    const createdDate = new Date(createdAt);
    const istDateStr = createdDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const istTimeStr = createdDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
    return `${istDateStr} at ${istTimeStr}`;
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setErrorMsg('All fields are required.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('New password must be at least 4 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/change-password', {
        oldPassword,
        newPassword,
        confirmPassword
      });

      if (res.data && res.data.success) {
        setSuccessMsg('Password changed successfully.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMsg(res.data?.error || 'Failed to change password.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to change password. Make sure old password is correct.');
    } finally {
      setLoading(false);
    }
  };

  const handleExitSupport = async () => {
    try {
      await apiClient.post('/auth/logout');
      window.location.href = '/';
    } catch (_) {
      window.location.href = '/';
    }
  };

  return (
    <div className="p-4 bg-[#0b0e14] text-white min-h-[calc(100vh-80px)] font-mono space-y-4">
      {/* Support Mode Alert */}
      {user?.adminSupportMode && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 shadow-xl flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <h2 className="font-extrabold text-sm text-amber-400 uppercase tracking-tight">
                ADMIN / SUPPORT MODE ACTIVE
              </h2>
              <p className="text-xs text-gray-300 mt-1">
                You are currently viewing this client's account in Support Mode. Actual account password cannot be altered without the client's current credentials.
              </p>
            </div>
          </div>
          <button
            onClick={handleExitSupport}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-extrabold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer"
          >
            EXIT SUPPORT MODE
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Details */}
        <div className="bg-[#161B22] p-6 rounded-xl border border-[#3c494e]/30 shadow-xl space-y-6">
          <div>
            <h2 className="text-base font-black text-[#00d4ff] flex items-center gap-2 uppercase tracking-tight">
              <User className="w-5 h-5 text-[#00d4ff]" />
              Account Details
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Your profile and registration metadata</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-gray-400">Full Name</span>
              <span className="text-xs font-bold text-white">{currentStudent?.name}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-gray-400">Client ID / Student ID</span>
              <span className="text-xs font-mono font-bold text-[#00d4ff]">{currentStudent?.studentId || '—'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-gray-400">Email Address</span>
              <span className="text-xs font-bold text-white">{currentStudent?.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-gray-400">Phone Number</span>
              <span className="text-xs font-bold text-white">{currentStudent?.phone || '—'}</span>
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-gray-400 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-500" />
                Registered (IST)
              </span>
              <span className="text-xs font-bold text-[#00FF41]">
                {formatRegistrationDate(currentStudent?.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Change Password Form */}
        <div className="bg-[#161B22] p-6 rounded-xl border border-[#3c494e]/30 shadow-xl space-y-6">
          <div>
            <h2 className="text-base font-black text-[#00d4ff] flex items-center gap-2 uppercase tracking-tight">
              <KeyRound className="w-5 h-5 text-[#00d4ff]" />
              Security Settings
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Manage and change your normal password</p>
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3.5 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] rounded-lg p-3.5 text-xs flex items-center gap-2 animate-pulse">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase font-bold">Old Password</label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white text-xs font-mono"
                placeholder="Enter current password"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase font-bold">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white text-xs font-mono"
                placeholder="Enter new password (min 4 chars)"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase font-bold">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00d4ff] text-white text-xs font-mono"
                placeholder="Verify new password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-gradient-to-r from-[#00d4ff] to-[#7000ff] text-black font-extrabold rounded-lg text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,212,255,0.3)] cursor-pointer"
            >
              {loading ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
