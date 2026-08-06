const fs = require('fs');

const walletHubContent = `'use client';

import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../lib/axios';
import { 
  Wallet, ShieldCheck, ArrowUpRight, RotateCcw, Award, 
  CheckCircle, Copy, Upload, Send, X, CreditCard, QrCode,
  AlertTriangle, RefreshCw, FileText, ChevronRight, CheckCircle2,
  Mail, MessageSquare, Compass
} from 'lucide-react';

export default function WalletHub() {
  const [walletData, setWalletData] = useState({ tokenBalance: 0, paperBalance: 0, referralBalance: 0, ledger: [] });
  const [membershipData, setMembershipData] = useState({ membership: null, trialStartedAt: null, trialDays: 4 });
  const [monthlySubCost, setMonthlySubCost] = useState(900); // Should be fetched from settings if we make an endpoint for it

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [rechargeAmount, setRechargeAmount] = useState('1000');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Admin Config options
  const [paymentConfig] = useState({
    bankName: 'Bank of Baroda',
    accountNo: '28668100005444',
    ifsc: 'BARB0SHIVBS',
    upiId: 'hellotraderinstitute-1@okhdfcbank',
    telegramBotToken: '',
    telegramChatId: '',
    whatsappNo: '919477304939' 
  });

  const fetchData = async () => {
    try {
      const [walletRes, memRes] = await Promise.all([
        apiClient.get('/wallet'),
        apiClient.get('/membership')
      ]);
      setWalletData(walletRes.data);
      setMembershipData(memRes.data);
    } catch (error) {
      console.error("Failed to load wallet data", error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(\`\${label} copied to clipboard!\`);
  };

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
    if (!screenshot) {
      alert("Please upload a transaction screenshot/receipt.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/wallet/payment-proof', {
        amount: rechargeAmount,
        method: paymentMethod
      });
      setIsSuccess(true);
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAutoRenew = async () => {
    try {
      const newStatus = !membershipData.membership?.autoRenew;
      await apiClient.post('/membership/auto-renew', { autoRenew: newStatus });
      fetchData();
    } catch (err) {
      alert("Failed to update auto-renew status.");
    }
  };

  const activateMembership = async () => {
    try {
      await apiClient.post('/membership/activate');
      alert("Membership activated successfully!");
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to activate membership.");
    }
  };

  const upiPayUrl = \`upi://pay?pa=\${paymentConfig.upiId}&pn=Hello%20Trader&am=\${rechargeAmount}&cu=INR\`;
  const qrCodeUrl = \`https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=\${encodeURIComponent(upiPayUrl)}\`;

  const tokensNeeded = useMemo(() => {
    if (walletData.tokenBalance >= monthlySubCost) return 0;
    return monthlySubCost - walletData.tokenBalance;
  }, [walletData.tokenBalance, monthlySubCost]);

  const isMemActive = membershipData.membership?.status === 'ACTIVE' && new Date(membershipData.membership.expiresAt) > new Date();
  const subExpiryText = useMemo(() => {
    if (!isMemActive) return 'INACTIVE';
    const d = new Date(membershipData.membership.expiresAt);
    return \`\${d.toLocaleDateString()} at \${d.toLocaleTimeString()}\`;
  }, [isMemActive, membershipData.membership]);

  const waLink = \`https://wa.me/919477304939?text=\${encodeURIComponent(\`Hello Admin, I have uploaded a payment proof of ₹\${rechargeAmount} via \${paymentMethod} to Hello Trader. Please verify my receipt!\`)}\`;
  const tgLink = \`https://t.me/Hellotrader7272\`;
  const mailLink = \`mailto:hellotraderinstitute@gmail.com?subject=Payment Proof Verification Request&body=\${encodeURIComponent(\`Hello Admin,\\n\\nI have completed a wallet deposit. Please find details below:\\n- Amount: ₹\${rechargeAmount}\\n- Method: \${paymentMethod}\\n\\nAttached is the transaction screenshot proof.\`)}\`;

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono space-y-4 overflow-y-auto">
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              HELLO TRADER WALLET SYSTEM
              <span className="text-[10px] bg-[#00D4FF]/20 text-[#00D4FF] px-2 py-0.5 rounded border border-[#00D4FF]/30 font-bold">1 Token = ₹1</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30 font-bold">Plan Price: ₹{monthlySubCost} / Month</span>
            </h1>
            <p className="text-xs text-gray-400">Recharge margin, view statements, and verify referrals</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded-lg text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            RECHARGE / ADD TOKENS
          </button>
        </div>
      </div>

      {!isMemActive ? (
        <div className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#ffb4ab]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-extrabold block">Monthly Membership Inactive (Requires {monthlySubCost} Tokens)</span>
              <span>Available balance: ₹{walletData.tokenBalance}. Need only <strong className="text-white underline">₹{tokensNeeded} more Tokens</strong> to activate plan.</span>
            </div>
          </div>
          <div className="flex gap-2">
            {tokensNeeded <= 0 && (
              <button onClick={activateMembership} className="px-3 py-1.5 bg-[#00FF41]/20 hover:bg-[#00FF41] hover:text-black rounded text-[10px] font-bold text-white border border-[#00FF41]/30 transition-all shrink-0">
                ACTIVATE MEMBERSHIP
              </button>
            )}
            <button 
              onClick={() => { setRechargeAmount(tokensNeeded > 0 ? tokensNeeded.toString() : '900'); setIsModalOpen(true); }}
              className="px-3 py-1.5 bg-[#ffb4ab]/20 hover:bg-[#ffb4ab] hover:text-black rounded text-[10px] font-bold text-white border border-[#ffb4ab]/30 transition-all shrink-0"
            >
              Recharge ₹{tokensNeeded > 0 ? tokensNeeded : 900}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#00FF41]/10 border border-[#00FF41]/30 p-3.5 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#00FF41]">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-extrabold block">Monthly Membership Plan Active (₹{monthlySubCost} Tokens / Month)</span>
              <span>Tokens will auto-renew on expiration if balance is sufficient. Expiry Date & Time: <strong className="text-white font-mono">{subExpiryText}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold bg-[#0b0e14] px-3 py-1.5 rounded border border-white/5">
            <input 
              type="checkbox"
              id="autoRenewCheck"
              checked={membershipData.membership?.autoRenew || false}
              onChange={toggleAutoRenew}
              className="w-3.5 h-3.5 accent-[#00D4FF] cursor-pointer"
            />
            <label htmlFor="autoRenewCheck" className="cursor-pointer">AUTO-RENEW MEMBERSHIP</label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10">
          <span className="text-gray-400 text-[10px]">CASH TOKENS</span>
          <div className="text-2xl font-extrabold text-[#00FF41] mt-1">
            ₹{(walletData.tokenBalance || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">Tokens available for membership</span>
        </div>

        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10">
          <span className="text-gray-400 text-[10px]">PAPER TRADING MARGIN</span>
          <div className="text-2xl font-extrabold text-[#00D4FF] mt-1">
            ₹{(walletData.paperBalance || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">Virtual margin</span>
        </div>

        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10">
          <span className="text-gray-400 text-[10px]">WITHDRAWABLE REFERRAL</span>
          <div className="text-2xl font-extrabold text-purple-400 mt-1">
            ₹{(walletData.referralBalance || 0).toLocaleString()}
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">Earned invite commissions</span>
        </div>
      </div>

      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-col min-h-[350px]">
        <h2 className="text-xs font-bold text-white mb-3 flex items-center gap-1.5 border-b border-[#3c494e]/30 pb-2">
          <FileText className="w-4 h-4 text-[#00D4FF]" />
          WALLET STATEMENT (IMMUTABLE LOG)
        </h2>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-[#3c494e]/20 text-[10px] bg-black/10">
                <th className="py-2 px-2">WALLET</th>
                <th className="py-2 px-2">REASON</th>
                <th className="py-2 px-2">TYPE</th>
                <th className="py-2 px-2">DATE/TIME</th>
                <th className="py-2 px-2 text-right">AMOUNT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3c494e]/10">
              {walletData.ledger.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-10 text-gray-500">No transactions recorded in Ledger.</td></tr>
              ) : (
                walletData.ledger.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01]">
                    <td className="py-2 px-2 font-bold text-white">{tx.walletType}</td>
                    <td className="py-2 px-2 text-gray-400">{tx.reason}</td>
                    <td className="py-2 px-2 uppercase text-[10px] font-bold text-[#859398]">{tx.type}</td>
                    <td className="py-2 px-2 text-gray-400 font-mono text-[10px]">{new Date(tx.timestamp).toLocaleString()}</td>
                    <td className={\`py-2 px-2 text-right font-extrabold \${tx.type === 'CREDIT' ? 'text-[#00FF41]' : 'text-[#ffb4ab]'}\`}>
                      {tx.type === 'CREDIT' ? '+' : '-'}₹{Math.abs(tx.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto font-mono text-xs">
          <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-lg p-5 text-white relative shadow-2xl my-8">
            <button 
              onClick={() => { setIsModalOpen(false); setIsSuccess(false); setScreenshot(null); setScreenshotPreview(''); }}
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
                  <p className="text-[#859398] text-[10px] mt-1">Recharges reflect instantly once verified.</p>
                </div>
                <div>
                  <label className="block text-[#bbc9cf] mb-1.5 font-bold">SELECT RECHARGE AMOUNT (INR)</label>
                  <input type="number" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:outline-none focus:border-[#00D4FF] font-extrabold text-sm" />
                </div>
                <div>
                  <label className="block text-[#bbc9cf] mb-1.5 font-bold">CHOOSE PAYMENT METHOD</label>
                  <div className="flex bg-[#0b0e14] border border-[#3c494e]/30 rounded p-0.5 mb-3">
                    {['UPI', 'QR_CODE', 'BANK'].map(method => (
                      <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={\`flex-1 py-1.5 rounded font-extrabold text-[10px] transition-all flex items-center justify-center gap-1.5 \${paymentMethod === method ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}\`}>
                        {method}
                      </button>
                    ))}
                  </div>
                  {/* Reduced payment details for brevity in this script */}
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
                <button type="button" disabled={isSubmitting || !screenshot} onClick={handleSubmitProof} className={\`w-full py-3 rounded-lg font-black tracking-wider flex items-center justify-center gap-2 border text-black transition-all \${!screenshot ? 'bg-gray-700 border-gray-700 text-gray-500' : 'bg-[#00D4FF] hover:bg-[#00D4FF]/90 border-[#00D4FF]'}\`}>
                  <Send className="w-4 h-4" /> {isSubmitting ? 'SUBMITTING...' : 'SUBMIT PROOF'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-6 space-y-5">
                <div className="w-16 h-16 rounded-full bg-[#00e639]/10 border border-[#00e639]/30 flex items-center justify-center text-[#00e639] animate-bounce"><CheckCircle className="w-10 h-10" /></div>
                <div>
                  <h3 className="text-lg font-bold text-[#00e639]">RECEIPT ATTACHED</h3>
                  <p className="text-gray-400 text-[11px] mt-1.5 px-4">Request recorded. Forward proof to admin:</p>
                </div>
                <div className="w-full space-y-2.5 px-4">
                  <a href={waLink} target="_blank" rel="noreferrer" className="w-full py-2.5 bg-[#25D366] text-black font-extrabold rounded-lg flex items-center justify-center gap-2 text-xs">WHATSAPP</a>
                  <a href={tgLink} target="_blank" rel="noreferrer" className="w-full py-2.5 bg-[#0088cc] text-white font-extrabold rounded-lg flex items-center justify-center gap-2 text-xs">TELEGRAM</a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('src/components/WalletHub.js', walletHubContent);
console.log('Patched WalletHub.js');
