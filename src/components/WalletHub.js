'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../lib/axios';
import { useTrading } from '../context/TradingContext';
import { 
  Wallet, ShieldCheck, ArrowUpRight, RotateCcw, Award, 
  CheckCircle, Copy, Upload, Send, X, CreditCard, QrCode,
  AlertTriangle, RefreshCw, FileText, ChevronRight, CheckCircle2,
  Mail, MessageSquare, Compass, Info
} from 'lucide-react';

export default function WalletHub() {
  const { tokenExchangeRate: contextTokenRate } = useTrading();

  // 1. Component State
  const [walletData, setWalletData] = useState({ tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [], paymentHistory: [] });
  const [membershipData, setMembershipData] = useState({ membership: null, trialStartedAt: null, trialDays: 4 });
  const [paymentConfig, setPaymentConfig] = useState({
    upiEnabled: true,
    upiId: '7665977937@ybl',
    upiHolderName: 'Hello Trader Institute',
    qrEnabled: true,
    qrImageUrl: '/images/payment_qr.png',
    bankEnabled: true,
    bankName: 'Bank of Baroda',
    bankAccountName: 'Hello Trader Institute',
    bankAccountNumber: '28668100005444',
    bankIfsc: 'BARB0SHIVBS',
    bankBranch: 'Main Branch'
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // 2. Derived Values (strict temporal order: no variable referenced before declaration)
  const tokenExchangeRate = walletData?.tokenPrice || paymentConfig?.tokenPrice || contextTokenRate || 1;

  const monthlySubCost = Number(
    paymentConfig?.monthlyCost ??
    membershipData?.membership?.price ??
    900
  );

  const availableTokens = Math.max(0, walletData?.tokenBalance || 0);

  const tokensNeeded = useMemo(() => {
    if (availableTokens >= monthlySubCost) return 0;
    return monthlySubCost - availableTokens;
  }, [availableTokens, monthlySubCost]);

  const isMemActive = membershipData?.membership?.status === 'ACTIVE' && new Date(membershipData.membership.expiresAt) > new Date();

  const subExpiryText = useMemo(() => {
    if (!isMemActive) return 'INACTIVE';
    const d = new Date(membershipData.membership.expiresAt);
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString()}`;
  }, [isMemActive, membershipData?.membership]);

  const availableMethods = useMemo(() => {
    const list = [];
    if (paymentConfig?.upiEnabled) list.push({ id: 'UPI', name: 'UPI ID' });
    if (paymentConfig?.qrEnabled) list.push({ id: 'QR_CODE', name: 'QR CODE' });
    if (paymentConfig?.bankEnabled) list.push({ id: 'BANK', name: 'BANK TRANSFER' });
    return list;
  }, [paymentConfig]);

  // 3. API Fetch & Effects
  const fetchData = useCallback(async () => {
    try {
      const [walletRes, memRes, configRes] = await Promise.all([
        apiClient.get('/wallet').catch(err => ({ data: null, error: err })),
        apiClient.get('/membership').catch(err => ({ data: null, error: err })),
        apiClient.get('/wallet/payment-config').catch(err => ({ data: null, error: err }))
      ]);

      if (walletRes.data) {
        setWalletData(walletRes.data);
      }
      if (memRes.data) {
        setMembershipData(memRes.data);
      }
      if (configRes.data && configRes.data.success) {
        setPaymentConfig(configRes.data);
      }
    } catch (error) {
      console.error("Failed to load wallet data", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (monthlySubCost && !rechargeAmount) {
      setRechargeAmount(monthlySubCost.toString());
    }
  }, [monthlySubCost, rechargeAmount]);

  // 4. Handlers
  const handleScreenshotChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setScreenshot(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitProof = async () => {
    if (!screenshot && !utr.trim()) {
      alert("Please upload a screenshot or enter a valid UTR Number.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/wallet/payment-proof', {
        amount: rechargeAmount,
        method: paymentMethod,
        utr: utr.trim() || undefined,
        screenshotUrl: screenshotPreview
      });
      setIsSuccess(true);
      fetchData();
    } catch (err) {
      console.error("Submission error:", err);
      alert(err.response?.data?.error || "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activateMembership = async () => {
    try {
      await apiClient.post('/membership/activate', { price: monthlySubCost, durationDays: 30 });
      alert("Membership activated successfully!");
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to activate membership.");
    }
  };

  const waLink = `https://wa.me/919477304939?text=${encodeURIComponent(`Hello Admin, I have uploaded a payment proof of ₹${rechargeAmount} via ${paymentMethod} to Hello Trader. Please verify my receipt!`)}`;
  const tgLink = `https://t.me/Hellotrader7272`;

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono space-y-4 overflow-y-auto">
      {/* Top Banner */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              HELLO TRADER WALLET SYSTEM
              <span className="text-[10px] bg-[#00D4FF]/20 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/30 font-bold">1 Token = ₹{tokenExchangeRate || 1} INR</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30 font-bold">Plan Price: {monthlySubCost} Tokens (₹{(monthlySubCost * (tokenExchangeRate || 1)).toLocaleString()}) / Month</span>
            </h1>
            <p className="text-xs text-gray-400">Recharge margin, view statements, and verify referrals</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRechargeAmount(tokensNeeded > 0 ? tokensNeeded.toString() : monthlySubCost.toString());
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded-lg text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            RECHARGE / ADD TOKENS
          </button>
        </div>
      </div>

      {/* Subscription Banner */}
      {!isMemActive ? (
        <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#ffb4ab]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-extrabold block text-sm text-red-400">Monthly Membership Inactive (Requires {monthlySubCost} Tokens / Approx ₹{(monthlySubCost * (tokenExchangeRate || 1)).toLocaleString()} INR)</span>
              <span className="text-gray-300">
                Available Token Balance: <strong className="text-[#00FF41]">🪙 {availableTokens.toLocaleString()} Tokens (Approx ₹{(availableTokens * (tokenExchangeRate || 1)).toLocaleString()} INR)</strong>. 
                {tokensNeeded > 0 ? (
                  <> Need only <strong className="text-white underline">🪙 {tokensNeeded.toLocaleString()} more Tokens (Approx ₹{(tokensNeeded * (tokenExchangeRate || 1)).toLocaleString()} INR)</strong> to activate plan.</>
                ) : (
                  <> You have sufficient tokens to activate plan right now!</>
                )}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {availableTokens >= monthlySubCost ? (
              <div className="px-4 py-2 bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/40 rounded-lg text-xs font-black flex items-center gap-1.5 animate-pulse">
                ⚡ AUTO-ACTIVATING ({monthlySubCost} TOKENS)
              </div>
            ) : (
              <button 
                onClick={() => { setRechargeAmount(tokensNeeded.toString()); setIsModalOpen(true); }}
                className="px-4 py-2 bg-[#ffb4ab]/20 hover:bg-[#ffb4ab] hover:text-black rounded-lg text-xs font-black text-white border border-[#ffb4ab]/40 transition-all shrink-0 cursor-pointer"
              >
                RECHARGE {tokensNeeded.toLocaleString()} TOKENS
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#00FF41]/10 border border-[#00FF41]/30 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#00FF41]">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-extrabold block text-sm">Monthly Membership Plan Active ({monthlySubCost} Tokens / Approx ₹{(monthlySubCost * (tokenExchangeRate || 1)).toLocaleString()} INR / Month)</span>
              <span className="text-gray-300">
                Tokens will auto-renew on expiration if balance is sufficient. Expiry Date & Time: <strong className="text-white font-mono">{subExpiryText}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#00D4FF] font-bold bg-[#0b0e14] px-3 py-1.5 rounded border border-[#00D4FF]/30">
            ⚡ AUTO-RENEW ACTIVE (AUTOMATIC {monthlySubCost} TOKEN DEDUCTION ON EXPIRY)
          </div>
        </div>
      )}

      {/* Wallet Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10">
          <span className="text-gray-400 text-[10px] font-bold">CASH TOKENS</span>
          <div className="text-2xl font-extrabold text-[#00FF41] mt-1">
            🪙 {availableTokens.toLocaleString()} <span className="text-xs font-bold text-gray-400">Tokens</span>
          </div>
          <span className="text-[10px] text-[#00FF41] mt-1 font-bold block">Equivalent Value: ₹{(availableTokens * (tokenExchangeRate || 1)).toLocaleString()} INR (Rate: 1 Token = ₹{tokenExchangeRate || 1} INR)</span>
        </div>

        {/* RECHARGE BONUS / CURRENT OFFER CARD */}
        <div className="bg-[#161B22] p-4 rounded-xl border border-[#00D4FF]/30">
          <div className="flex justify-between items-center">
            <span className="text-[#00D4FF] text-[10px] font-extrabold tracking-wider">RECHARGE BONUS OFFER</span>
            <span className="text-[9px] bg-[#00D4FF]/20 text-[#00D4FF] px-1.5 py-0.5 rounded font-black">LIVE SLABS</span>
          </div>
          <div className="text-xs font-bold text-white mt-1.5 space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-400">&lt; ₹2,000:</span>
              <span className="text-gray-300">0% Bonus</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-400">₹2,000 – ₹4,999:</span>
              <span className="text-[#00FF41]">2% Bonus Tokens</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-400">≥ ₹5,000:</span>
              <span className="text-[#00D4FF]">5% Bonus Tokens</span>
            </div>
          </div>
          <span className="text-[9px] text-amber-300 font-bold mt-1.5 block">⚡ Bonus tokens calculated automatically on Admin Approval</span>
        </div>

        <div className="bg-[#161B22] p-4 rounded-xl border border-[#00FF41]/30">
          <span className="text-[#00FF41] text-[10px] font-bold">WITHDRAWABLE REFERRAL (CASH INR)</span>
          <div className="text-2xl font-extrabold text-[#00FF41] mt-1">
            ₹{(walletData.referralBalance || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">Earned invite cash (Withdrawable when Refs &gt; 3)</span>
        </div>
      </div>

      {/* Terms & Conditions Notice Box */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-[#00D4FF]/20 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-[#00D4FF] font-extrabold text-xs">
          <Info className="w-4 h-4" />
          MEMBERSHIP & REFERRAL TERMS & CONDITIONS
        </div>
        <ul className="list-disc list-inside space-y-1 text-gray-300 text-[11px] leading-relaxed">
          <li><strong>Auto-Renewal Policy:</strong> If sufficient tokens exist in your wallet, {monthlySubCost} tokens will automatically deduct on your expiry date to maintain continuous live trading access.</li>
          <li><strong>Partial Balance Policy:</strong> If your token balance is less than {monthlySubCost} Tokens (e.g., {Math.round(monthlySubCost * 0.55)} Tokens), referral/bonus tokens automatically apply to reduce your recharge gap so you only pay the exact remaining difference.</li>
          <li><strong>Same Calendar Month 3-Referrals Offer:</strong> Completing 3 successful active student referrals in the SAME calendar month awards you <strong>1 Month Free Membership Access</strong>.</li>
          <li><strong>Cash Withdrawal Policy:</strong> Cash INR withdrawal (`₹`) is available when you hold an Active Subscription and have completed at least 3 successful referrals (used towards initial recharge). All additional referrals beyond 3 (4th, 5th, etc.) can be withdrawn 100% in INR (`₹`) directly to your Bank / UPI!</li>
        </ul>
      </div>

      {/* Statement Log */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-col min-h-[400px] shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3c494e]/30 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#00D4FF]" />
            <h2 className="text-xs font-bold text-white flex items-center gap-2">
              WALLET STATEMENT (IMMUTABLE LOG)
              <span className="text-[10px] bg-[#00D4FF]/10 text-[#00D4FF] px-2 py-0.5 rounded font-bold border border-[#00D4FF]/30">
                {walletData.ledger.length} Total Transactions Logged
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => {
                if (walletData.ledger.length === 0) return alert('No ledger history to export.');
                const csv = ['WALLET,REASON,TYPE,TIMESTAMP,AMOUNT'];
                walletData.ledger.forEach(l => {
                  csv.push(`${l.walletType},${l.reason},${l.type},${new Date(l.timestamp).toLocaleString().replace(/,/g, '')},${l.amount}`);
                });
                const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wallet_statement_${new Date().getTime()}.csv`;
                a.click();
              }}
              className="px-3 py-1 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] rounded text-[10px] font-bold border border-[#00D4FF]/30 transition-all flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3 h-3 rotate-180" />
              DOWNLOAD FULL STATEMENT (CSV)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[500px] flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-[#10131a]">
              <tr className="text-gray-400 border-b border-[#3c494e]/30 text-[10px] bg-[#10131a]">
                <th className="py-2.5 px-3">WALLET CATEGORY</th>
                <th className="py-2.5 px-3">TRANSACTION REASON</th>
                <th className="py-2.5 px-3">ACTION TYPE</th>
                <th className="py-2.5 px-3">DATE & TIME</th>
                <th className="py-2.5 px-3 text-right">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3c494e]/10 font-mono">
              {walletData.ledger.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-14 text-gray-500">No transactions recorded in immutable ledger yet.</td></tr>
              ) : (
                walletData.ledger.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-2.5 px-3 font-extrabold text-white">
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${
                        tx.walletType === 'TOKEN' || tx.walletType === 'RECHARGE'
                          ? 'bg-[#00FF41]/10 border-[#00FF41]/30 text-[#00FF41]'
                          : tx.walletType === 'REFERRAL'
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                          : 'bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF]'
                      }`}>
                        {tx.walletType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-300 font-medium">{tx.reason}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                        tx.type === 'CREDIT' ? 'bg-[#00FF41]/20 text-[#00FF41]' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-400 font-mono text-[10px]">{new Date(tx.timestamp).toLocaleString()}</td>
                    <td className={`py-2.5 px-3 text-right font-extrabold text-sm ${tx.type === 'CREDIT' ? 'text-[#00FF41]' : 'text-[#ffb4ab]'}`}>
                      {tx.type === 'CREDIT' ? '+' : '-'}{['TOKEN', 'RECHARGE', 'BONUS'].includes(tx.walletType) ? `🪙 ${Math.abs(tx.amount)} Tokens` : `₹${Math.abs(tx.amount).toLocaleString('en-IN')}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal logic */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto font-mono text-xs">
          <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-lg p-5 text-white relative shadow-2xl my-8">
            <button 
              onClick={() => { setIsModalOpen(false); setIsSuccess(false); setScreenshot(null); setScreenshotPreview(''); setUtr(''); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!isSuccess ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-[#00D4FF] flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    RECHARGE WALLET / ADD TOKENS
                  </h2>
                  <p className="text-[#859398] text-[10px] mt-1">Recharges reflect instantly once verified by admin.</p>
                </div>
                <div>
                  <label className="block text-[#bbc9cf] mb-1.5 font-bold">RECHARGE AMOUNT IN TOKENS (Rate: 1 Token = ₹{tokenExchangeRate || 1} INR)</label>
                  <input type="number" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00D4FF] font-extrabold text-sm text-[#00FF41]" />
                  <div className="mt-1.5 text-[11px] text-gray-300 font-mono bg-white/5 p-2 rounded border border-white/10 flex justify-between items-center">
                    <span>Payable INR Amount:</span>
                    <strong className="text-[#00FF41] font-bold text-xs">₹{(Number(rechargeAmount || 0) * (tokenExchangeRate || 1)).toLocaleString()} INR</strong>
                  </div>
                </div>
                <div>
                  <label className="block text-[#bbc9cf] mb-1.5 font-bold">CHOOSE PAYMENT METHOD</label>
                  <div className="flex bg-[#0b0e14] border border-[#3c494e]/30 rounded p-0.5 mb-3">
                    {availableMethods.map(m => (
                      <button 
                        key={m.id} 
                        type="button" 
                        onClick={() => setPaymentMethod(m.id)} 
                        className={`flex-1 py-1.5 rounded font-extrabold text-[10px] transition-all flex items-center justify-center gap-1.5 ${paymentMethod === m.id ? 'bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 shadow-sm' : 'text-gray-400 hover:text-white'}`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>

                  {/* PAYMENT METHOD DETAILS CARD */}
                  <div className="bg-[#0b0e14] border border-[#00D4FF]/30 p-3.5 rounded-xl space-y-3 mb-3">
                    {paymentMethod === 'UPI' && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-gray-400 font-bold uppercase">UPI ID</span>
                          <span className="text-[#00FF41] font-extrabold font-mono bg-white/5 px-2 py-1 rounded border border-white/10">{paymentConfig.upiId}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-gray-400 font-bold uppercase">Account Holder</span>
                          <span className="text-white font-bold">{paymentConfig.upiHolderName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(paymentConfig.upiId);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="w-full py-1.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copied ? <CheckCircle className="w-3.5 h-3.5 text-[#00FF41]" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'UPI ID COPIED TO CLIPBOARD' : 'COPY UPI ID'}
                        </button>
                      </div>
                    )}

                    {paymentMethod === 'QR_CODE' && (
                      <div className="text-center space-y-2 py-1">
                        {paymentConfig.qrImageUrl ? (
                          <div className="bg-white p-2.5 rounded-lg inline-block mx-auto border-2 border-[#00D4FF]">
                            <img 
                              src={paymentConfig.qrImageUrl} 
                              alt="Payment QR Code" 
                              className="w-48 h-48 object-contain mx-auto" 
                            />
                          </div>
                        ) : (
                          <div className="py-6 text-gray-500 text-xs">No QR Code Image configured by admin.</div>
                        )}
                        <p className="text-[10px] text-gray-400 font-bold">
                          Scan QR Code using PhonePe, Google Pay, or Paytm to pay ₹{rechargeAmount || monthlySubCost}
                        </p>
                      </div>
                    )}

                    {paymentMethod === 'BANK' && (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">Bank Name</span>
                          <span className="text-white font-extrabold">{paymentConfig.bankName}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">Account Holder</span>
                          <span className="text-white font-bold">{paymentConfig.bankAccountName}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">Account Number</span>
                          <span className="text-[#00FF41] font-mono font-extrabold bg-white/5 px-2 py-0.5 rounded border border-white/10">{paymentConfig.bankAccountNumber}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">IFSC Code</span>
                          <span className="text-[#00D4FF] font-mono font-extrabold">{paymentConfig.bankIfsc}</span>
                        </div>
                        {paymentConfig.bankBranch && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400 font-bold uppercase text-[10px]">Branch</span>
                            <span className="text-gray-300">{paymentConfig.bankBranch}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const bankText = `Bank: ${paymentConfig.bankName}\nAccount Name: ${paymentConfig.bankAccountName}\nAccount Number: ${paymentConfig.bankAccountNumber}\nIFSC: ${paymentConfig.bankIfsc}`;
                            navigator.clipboard.writeText(bankText);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="w-full py-1.5 mt-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copied ? <CheckCircle className="w-3.5 h-3.5 text-[#00FF41]" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'BANK DETAILS COPIED TO CLIPBOARD' : 'COPY BANK DETAILS'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[#bbc9cf] mb-1.5 font-bold">UTR / REFERENCE NUMBER</label>
                  <input type="text" placeholder="12-digit UTR" value={utr} onChange={(e) => setUtr(e.target.value)} className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00D4FF] text-sm" />
                </div>
                <div>
                  <label className="block text-[#bbc9cf] mb-1.5 font-bold">UPLOAD TRANSACTION RECEIPT / SCREENSHOT</label>
                  {!screenshotPreview ? (
                    <label className="flex flex-col items-center justify-center bg-[#0b0e14] border-2 border-dashed border-[#3c494e]/50 rounded-lg p-5 cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-500 mb-2" />
                      <span className="font-bold">Choose Image File</span>
                      <input type="file" accept="image/*" onChange={handleScreenshotChange} className="hidden" />
                    </label>
                  ) : (
                    <div className="relative rounded-lg overflow-hidden bg-black/40">
                      <img src={screenshotPreview} className="w-full h-32 object-contain p-2" />
                      <button onClick={() => { setScreenshot(null); setScreenshotPreview(''); }} className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
                <button type="button" disabled={isSubmitting || (!screenshot && !utr)} onClick={handleSubmitProof} className={`w-full py-3 rounded-lg font-black tracking-wider flex items-center justify-center gap-2 border text-black transition-all ${(!screenshot && !utr) ? 'bg-gray-700 border-gray-700 text-gray-500' : 'bg-[#00D4FF] hover:bg-[#00D4FF]/90 border-[#00D4FF]'}`}>
                  <Send className="w-4 h-4" /> {isSubmitting ? 'SUBMITTING...' : 'SUBMIT PROOF'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-6 space-y-4 font-mono">
                <div className="w-14 h-14 rounded-full bg-[#00FF41]/10 border border-[#00FF41]/30 flex items-center justify-center text-[#00FF41] mx-auto shadow-[0_0_20px_rgba(0,255,65,0.2)]">
                  <CheckCircle className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-black text-[#00FF41] tracking-wider uppercase">PAYMENT / REQUEST SUBMITTED</h3>
                  <p className="text-xs font-bold text-white leading-relaxed">
                    Your request has been submitted successfully.
                  </p>
                  <div className="bg-[#1d2026] p-3 rounded-xl border border-[#00D4FF]/30 text-[11px] text-gray-300 space-y-1.5">
                    <p className="text-[#00D4FF] font-bold">Please wait up to 30 minutes for Admin verification.</p>
                    <p className="text-gray-400 text-[10px]">Once approved, your account/premium access will be activated automatically.</p>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 px-2 pt-1">
                  If it is not processed within 30 minutes, please contact us:
                </p>

                <div className="w-full grid grid-cols-2 gap-2 pt-1">
                  <a href={waLink} target="_blank" rel="noreferrer" className="py-2.5 bg-[#25D366] hover:brightness-110 text-black font-black rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer">
                    WHATSAPP
                  </a>
                  <a href={tgLink} target="_blank" rel="noreferrer" className="py-2.5 bg-[#0088cc] hover:brightness-110 text-white font-black rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer">
                    TELEGRAM
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
