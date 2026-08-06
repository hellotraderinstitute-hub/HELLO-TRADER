'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Users, Copy, Trophy, TrendingUp, Link as LinkIcon, Gift, ArrowRightLeft, CreditCard } from 'lucide-react';
import apiClient from '../lib/apiClient';

export default function ReferralDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [convertAmount, setConvertAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const res = await apiClient.get('/referral');
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const referralLink = useMemo(() => {
    if (!data?.referralCode) return '';
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      return `${origin}/register?ref=${data.referralCode}`;
    }
    return `https://hellotrader.in/register?ref=${data.referralCode}`;
  }, [data]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    alert('Referral link copied to clipboard!');
  };

  const handleConvert = async () => {
    try {
      if (!convertAmount || Number(convertAmount) <= 0) return alert('Invalid amount');
      await apiClient.post('/referral/convert', { amount: Number(convertAmount) });
      alert('Tokens converted to Trading Wallet!');
      setConvertAmount('');
      fetchReferralData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error converting tokens');
    }
  };

  const handleWithdraw = async () => {
    try {
      if (!withdrawAmount || Number(withdrawAmount) <= 0) return alert('Invalid amount');
      await apiClient.post('/referral/withdraw', { amount: Number(withdrawAmount) });
      alert('Withdrawal request submitted!');
      setWithdrawAmount('');
      fetchReferralData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error submitting withdrawal');
    }
  };

  const handleClaimBonus = async (rewardOption) => {
    try {
      await apiClient.post('/referral/claim-special-bonus', {
        rewardOption,
        referralIds: data.unclaimedBonusReferrals
      });
      alert(`Bonus Claimed: ${rewardOption === 'FREE_MONTH' ? '1 Month Free Membership' : '₹600 Cash'}!`);
      fetchReferralData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error claiming bonus');
    }
  };

  if (loading) return <div className="p-8 text-white">Loading Referral Dashboard...</div>;
  if (!data) return <div className="p-8 text-white">Error loading data.</div>;

  const { stats, referralBalance, canWithdraw, eligibleForSpecialBonus } = data;

  return (
    <div className="p-4 md:p-8 flex-1 overflow-y-auto bg-[#0b0e14] text-[#bbc9cf] font-mono text-sm space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[#3c494e]/30 pb-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 animate-pulse">
              <Users className="w-8 h-8 text-[#00d4ff]" />
              Enterprise Referral & Rewards
            </h1>
            <p className="text-[#859398] mt-1">Invite other traders. Earn 200 Tokens for each successful activation!</p>
          </div>
        </div>

        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Referral Link Card */}
          <div className="col-span-1 md:col-span-2 bg-[#10131a] border border-[#3c494e]/40 p-5 rounded-lg shadow-lg relative overflow-hidden">
            <h3 className="text-[#859398] font-bold text-xs mb-3 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-[#00d4ff]" />
              YOUR PERSONAL INVITATION LINK
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#0b0e14] border border-[#3c494e]/50 rounded p-2 text-white font-bold truncate text-xs select-all">
                {referralLink}
              </div>
              <button 
                onClick={copyToClipboard}
                className="bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 border border-[#00d4ff]/30 text-[#00d4ff] p-2 rounded transition-colors"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-[#10131a] border border-[#3c494e]/40 p-5 rounded-lg shadow-lg">
            <h3 className="text-[#859398] font-bold text-xs mb-2">REFERRAL BALANCE</h3>
            <div className="text-3xl font-extrabold text-[#00FF41] mt-1">
              ₹{referralBalance.toLocaleString()}
            </div>
            <div className="text-[#00e639] text-[10px] font-bold mt-2">
              Earned from Successful Invites
            </div>
          </div>

          <div className="bg-[#10131a] border border-[#3c494e]/40 p-5 rounded-lg shadow-lg">
            <h3 className="text-[#859398] font-bold text-xs mb-2">SUCCESS / TARGET (30D)</h3>
            <div className="text-3xl font-extrabold text-white mt-1">
              {stats.recentSuccessCount} / 3
            </div>
            <div className={`text-[10px] font-bold mt-2 ${canWithdraw ? 'text-[#00FF41]' : 'text-red-400'}`}>
              {canWithdraw ? '✓ Withdrawal Unlocked' : 'Requires 3 success in 30 days'}
            </div>
          </div>
        </div>

        {/* Action Panel: Convert / Withdraw / Special Bonus */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="bg-[#161B22] border border-white/10 p-5 rounded-lg">
            <h3 className="text-white font-bold text-xs mb-3 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-purple-400"/> CONVERT TO TRADING TOKENS</h3>
            <p className="text-[10px] text-gray-400 mb-3">Move your referral earnings to your trading wallet to pay for memberships.</p>
            <div className="flex gap-2">
              <input type="number" value={convertAmount} onChange={e => setConvertAmount(e.target.value)} placeholder="Amount" className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-2 py-1.5 rounded focus:border-purple-400 text-xs text-white outline-none"/>
              <button onClick={handleConvert} className="px-4 py-1.5 bg-purple-500 hover:bg-purple-600 text-white font-bold text-[10px] rounded">CONVERT</button>
            </div>
          </div>

          <div className="bg-[#161B22] border border-white/10 p-5 rounded-lg relative overflow-hidden">
            {!canWithdraw && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                <span className="text-red-400 font-bold text-[10px] bg-red-900/40 px-3 py-1 rounded-full border border-red-500/50">LOCKED (NEED 3 REFS)</span>
              </div>
            )}
            <h3 className="text-white font-bold text-xs mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#00FF41]"/> CASH WITHDRAWAL</h3>
            <p className="text-[10px] text-gray-400 mb-3">Withdraw directly to your bank. Requires 3 successful referrals in 30 days.</p>
            <div className="flex gap-2">
              <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Amount" className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-2 py-1.5 rounded focus:border-[#00FF41] text-xs text-white outline-none"/>
              <button onClick={handleWithdraw} className="px-4 py-1.5 bg-[#00FF41] text-black font-bold hover:bg-[#00e639] text-[10px] rounded">WITHDRAW</button>
            </div>
          </div>

          <div className="bg-[#161B22] border border-[#00d4ff]/30 p-5 rounded-lg relative overflow-hidden shadow-[0_0_15px_rgba(0,212,255,0.1)]">
            {!eligibleForSpecialBonus && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                <span className="text-gray-400 font-bold text-[10px] bg-gray-900/80 px-3 py-1 rounded-full border border-gray-600">PENDING TARGET</span>
              </div>
            )}
            <h3 className="text-[#00d4ff] font-bold text-xs mb-3 flex items-center gap-2"><Gift className="w-4 h-4"/> SPECIAL BONUS (3 REFS)</h3>
            <p className="text-[10px] text-gray-300 mb-4">Choose your reward for hitting 3 successful referrals!</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => handleClaimBonus('FREE_MONTH')} className="w-full py-1.5 border border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/10 font-bold text-[10px] rounded transition-colors">CLAIM 1 MONTH FREE MEMBERSHIP</button>
              <button onClick={() => handleClaimBonus('CASH_600')} className="w-full py-1.5 border border-[#00FF41] text-[#00FF41] hover:bg-[#00FF41]/10 font-bold text-[10px] rounded transition-colors">CLAIM ₹600 CASH REWARD</button>
            </div>
          </div>

        </div>

        {/* Stats Table */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#0b0e14] border border-[#3c494e]/30 p-4 rounded-lg text-center">
            <div className="text-2xl font-black text-gray-300">{stats.totalRegistrations}</div>
            <div className="text-[10px] text-gray-500 font-bold mt-1">TOTAL REGISTRATIONS</div>
          </div>
          <div className="bg-[#0b0e14] border border-[#3c494e]/30 p-4 rounded-lg text-center">
            <div className="text-2xl font-black text-amber-500">{stats.pending}</div>
            <div className="text-[10px] text-gray-500 font-bold mt-1">PENDING ACTIVATION</div>
          </div>
          <div className="bg-[#0b0e14] border border-[#3c494e]/30 p-4 rounded-lg text-center">
            <div className="text-2xl font-black text-[#00FF41]">{stats.success}</div>
            <div className="text-[10px] text-gray-500 font-bold mt-1">LIFETIME SUCCESS</div>
          </div>
          <div className="bg-[#0b0e14] border border-[#3c494e]/30 p-4 rounded-lg text-center">
            <div className="text-2xl font-black text-red-500">{stats.rejected}</div>
            <div className="text-[10px] text-gray-500 font-bold mt-1">INVALID / BLOCKED</div>
          </div>
        </div>
      </div>
    </div>
  );
}
