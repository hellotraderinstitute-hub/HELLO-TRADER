'use client';

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/axios';
import { 
  CreditCard, QrCode, Building, CheckCircle2, AlertTriangle, 
  Upload, Trash2, ShieldCheck, RefreshCw, History, Save, Check, X,
  Download, Database, RotateCcw, FileJson
} from 'lucide-react';

export default function AdminPaymentManager() {
  const [settings, setSettings] = useState({
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

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [qrPreview, setQrPreview] = useState('');
  const [backups, setBackups] = useState([]);
  const [backupCreating, setBackupCreating] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/backups');
      if (res.data && res.data.success) {
        setBackups(res.data.backups || []);
      }
    } catch (_) {}
  }, []);

  const fetchPaymentSettings = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiClient.get('/admin/payment-settings');
      if (res.data && res.data.success) {
        setSettings(res.data.settings);
        setAuditLogs(res.data.auditLogs || []);
        if (res.data.settings.qrImageUrl) {
          setQrPreview(res.data.settings.qrImageUrl);
        }
      }
      await fetchBackups();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to load payment configuration.');
    } finally {
      setLoading(false);
    }
  }, [fetchBackups]);

  useEffect(() => {
    fetchPaymentSettings();
  }, [fetchPaymentSettings]);

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    try {
      const res = await apiClient.post('/admin/backups/create');
      if (res.data && res.data.success) {
        setBackups(res.data.backups || []);
        alert('Database & Payment Configuration backups created successfully!');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create backup.');
    } finally {
      setBackupCreating(false);
    }
  };

  const handleDownloadBackup = (filename) => {
    window.open(`http://localhost:4000/api/admin/backups/download/${encodeURIComponent(filename)}`, '_blank');
  };

  const handleRestorePaymentJSON = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const payload = JSON.parse(reader.result);
          if (!confirm(`Restore payment settings from backup created on ${payload.createdAt || 'selected file'}?`)) return;

          const res = await apiClient.post('/admin/backups/restore-payment', { payload });
          if (res.data && res.data.success) {
            setSettings(res.data.settings);
            fetchPaymentSettings();
            alert('Payment configuration restored successfully!');
          }
        } catch (err) {
          alert('Invalid backup JSON payload or format.');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleQrUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/png', 0.85);
          setQrPreview(compressedBase64);
          setSettings(prev => ({ ...prev, qrImageUrl: compressedBase64 }));
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteQr = async () => {
    if (!confirm('Are you sure you want to delete the active QR Code image?')) return;
    try {
      const res = await apiClient.delete('/admin/payment-settings/qr');
      if (res.data && res.data.success) {
        setSettings(res.data.settings);
        setAuditLogs(res.data.auditLogs || []);
        setQrPreview('');
        alert('QR Code image deleted successfully.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete QR Code image.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSaveSuccess(false);

    try {
      const res = await apiClient.post('/admin/payment-settings', settings);
      if (res.data && res.data.success) {
        setSettings(res.data.settings);
        setAuditLogs(res.data.auditLogs || []);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save payment settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center font-mono text-xs text-gray-400 flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-[#00D4FF]" />
        Loading Payment Manager Configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs text-white">
      {/* Top Header */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold flex items-center gap-2">
              ADMIN PAYMENT CONFIGURATION MANAGER
              <span className="text-[10px] bg-[#00FF41]/20 text-[#00FF41] px-2 py-0.5 rounded border border-[#00FF41]/30 font-bold">
                LIVE PRODUCTION
              </span>
            </h1>
            <p className="text-gray-400 text-[11px] mt-0.5">
              Update UPI, QR Code, and Bank transfer details instantly without code changes or server restarts.
            </p>
          </div>
        </div>

        <button
          onClick={fetchPaymentSettings}
          className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-bold flex items-center gap-2 border border-white/10 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] p-3 rounded-lg flex items-center gap-2 font-bold animate-pulse">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Payment configuration saved & audit log recorded successfully!</span>
        </div>
      )}

      {/* Main Grid */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* 1. UPI MANAGEMENT */}
          <div className="bg-[#10131a] p-5 rounded-xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-[#00D4FF] font-extrabold text-sm">
                <CreditCard className="w-4 h-4" />
                <span>UPI DETAILS</span>
              </div>
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, upiEnabled: !prev.upiEnabled }))}
                className={`px-2.5 py-1 rounded text-[10px] font-black border transition-all ${
                  settings.upiEnabled
                    ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/40'
                    : 'bg-red-500/20 text-red-400 border-red-500/40'
                }`}
              >
                {settings.upiEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
              </button>
            </div>

            <div>
              <label className="block text-gray-400 text-[10px] font-bold mb-1">UPI ID (e.g. name@upi)</label>
              <input
                type="text"
                required
                value={settings.upiId}
                onChange={e => setSettings(prev => ({ ...prev, upiId: e.target.value }))}
                className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-[10px] font-bold mb-1">ACCOUNT HOLDER NAME</label>
              <input
                type="text"
                required
                value={settings.upiHolderName}
                onChange={e => setSettings(prev => ({ ...prev, upiHolderName: e.target.value }))}
                className="w-full bg-[#0b0e14] border border-white/10 px-3 py-2 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
              />
            </div>

            <div className="p-2.5 rounded bg-[#0b0e14] border border-white/5 text-[10px] text-gray-400">
              <span className="font-bold text-gray-300 block">User View Status:</span>
              {settings.upiEnabled ? 'Users will see UPI ID as a 1-click copy option in Wallet Hub.' : 'UPI Option is hidden from users.'}
            </div>
          </div>

          {/* 2. QR CODE MANAGEMENT */}
          <div className="bg-[#10131a] p-5 rounded-xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-purple-400 font-extrabold text-sm">
                <QrCode className="w-4 h-4" />
                <span>QR CODE PAYMENT</span>
              </div>
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, qrEnabled: !prev.qrEnabled }))}
                className={`px-2.5 py-1 rounded text-[10px] font-black border transition-all ${
                  settings.qrEnabled
                    ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/40'
                    : 'bg-red-500/20 text-red-400 border-red-500/40'
                }`}
              >
                {settings.qrEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-gray-400 text-[10px] font-bold">QR CODE IMAGE PREVIEW</label>
              {qrPreview ? (
                <div className="relative rounded-lg overflow-hidden bg-black/60 p-2 border border-white/10 flex flex-col items-center justify-center">
                  <img src={qrPreview} alt="Payment QR" className="w-32 h-32 object-contain rounded" />
                  <div className="flex gap-2 mt-2">
                    <label className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      Replace
                      <input type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={handleDeleteQr}
                      className="px-2.5 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-[10px] font-bold transition-all flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center bg-[#0b0e14] border-2 border-dashed border-white/10 rounded-lg p-4 cursor-pointer hover:border-[#00D4FF]/50 transition-all">
                  <Upload className="w-6 h-6 text-gray-500 mb-1" />
                  <span className="font-bold text-[11px] text-gray-300">Upload QR Image</span>
                  <span className="text-[9px] text-gray-500">PNG, JPG, SVG</span>
                  <input type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
                </label>
              )}
            </div>

            <div className="p-2.5 rounded bg-[#0b0e14] border border-white/5 text-[10px] text-gray-400">
              <span className="font-bold text-gray-300 block">User View Status:</span>
              {settings.qrEnabled ? 'Users can scan this QR code directly in Wallet Hub.' : 'QR Payment Option is hidden from users.'}
            </div>
          </div>

          {/* 3. BANK TRANSFER MANAGEMENT */}
          <div className="bg-[#10131a] p-5 rounded-xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                <Building className="w-4 h-4" />
                <span>BANK TRANSFER</span>
              </div>
              <button
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, bankEnabled: !prev.bankEnabled }))}
                className={`px-2.5 py-1 rounded text-[10px] font-black border transition-all ${
                  settings.bankEnabled
                    ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/40'
                    : 'bg-red-500/20 text-red-400 border-red-500/40'
                }`}
              >
                {settings.bankEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-400 text-[9px] font-bold mb-1">BANK NAME</label>
                <input
                  type="text"
                  required
                  value={settings.bankName}
                  onChange={e => setSettings(prev => ({ ...prev, bankName: e.target.value }))}
                  className="w-full bg-[#0b0e14] border border-white/10 px-2.5 py-1.5 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-[9px] font-bold mb-1">ACCOUNT HOLDER</label>
                <input
                  type="text"
                  required
                  value={settings.bankAccountName}
                  onChange={e => setSettings(prev => ({ ...prev, bankAccountName: e.target.value }))}
                  className="w-full bg-[#0b0e14] border border-white/10 px-2.5 py-1.5 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-400 text-[9px] font-bold mb-1">ACCOUNT NUMBER</label>
                <input
                  type="text"
                  required
                  value={settings.bankAccountNumber}
                  onChange={e => setSettings(prev => ({ ...prev, bankAccountNumber: e.target.value }))}
                  className="w-full bg-[#0b0e14] border border-white/10 px-2.5 py-1.5 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-[9px] font-bold mb-1">IFSC CODE</label>
                <input
                  type="text"
                  required
                  value={settings.bankIfsc}
                  onChange={e => setSettings(prev => ({ ...prev, bankIfsc: e.target.value }))}
                  className="w-full bg-[#0b0e14] border border-white/10 px-2.5 py-1.5 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-[9px] font-bold mb-1">BRANCH NAME (OPTIONAL)</label>
              <input
                type="text"
                value={settings.bankBranch || ''}
                onChange={e => setSettings(prev => ({ ...prev, bankBranch: e.target.value }))}
                className="w-full bg-[#0b0e14] border border-white/10 px-2.5 py-1.5 rounded text-white font-extrabold focus:outline-none focus:border-[#00D4FF]"
              />
            </div>
          </div>

        </div>

        {/* Save Button Bar */}
        <div className="bg-[#10131a] p-4 rounded-xl border border-white/10 flex items-center justify-between gap-4">
          <div className="text-gray-400 text-[11px]">
            Changes are written atomically to database with full audit logs.
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-black rounded-lg text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(0,212,255,0.3)] transition-all active:scale-95 cursor-pointer"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                SAVING CONFIGURATION...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                SAVE PAYMENT CONFIGURATION
              </>
            )}
          </button>
        </div>
      </form>

      {/* AUDIT LOG TABLE */}
      <div className="bg-[#10131a] rounded-xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-white font-extrabold text-sm">
            <History className="w-4 h-4 text-[#00D4FF]" />
            <span>PAYMENT CONFIGURATION AUDIT LOG</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {auditLogs.length} Total Audit Records
          </span>
        </div>

        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[#161B22] text-gray-400 text-[10px]">
              <tr className="border-b border-white/10">
                <th className="py-2 px-3">ADMIN NAME</th>
                <th className="py-2 px-3">CHANGED FIELD</th>
                <th className="py-2 px-3">OLD VALUE</th>
                <th className="py-2 px-3">NEW VALUE</th>
                <th className="py-2 px-3 text-right">DATE & TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-gray-500">
                    No payment configuration changes recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-3 font-bold text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#00D4FF]" />
                      {log.adminName}
                    </td>
                    <td className="py-2 px-3 text-[#00FF41] font-extrabold">{log.changedField}</td>
                    <td className="py-2 px-3 text-gray-400 max-w-[150px] truncate">{log.oldValue || '—'}</td>
                    <td className="py-2 px-3 text-white max-w-[150px] truncate font-extrabold">{log.newValue || '—'}</td>
                    <td className="py-2 px-3 text-right text-gray-400 text-[10px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DATABASE & PAYMENT BACKUP MANAGER */}
      <div className="bg-[#10131a] rounded-xl border border-white/10 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-white font-extrabold text-sm">
            <Database className="w-4 h-4 text-[#00FF41]" />
            <span>DATABASE & PAYMENT BACKUP MANAGER</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all">
              <RotateCcw className="w-3.5 h-3.5" />
              RESTORE CONFIG FROM JSON
              <input type="file" accept=".json" onChange={handleRestorePaymentJSON} className="hidden" />
            </label>

            <button
              type="button"
              disabled={backupCreating}
              onClick={handleCreateBackup}
              className="px-4 py-1.5 bg-[#00FF41] hover:bg-[#00FF41]/90 text-black rounded-lg text-xs font-black flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,255,65,0.3)] transition-all cursor-pointer"
            >
              {backupCreating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  CREATING BACKUP...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  CREATE INSTANT BACKUP (.DB & .JSON)
                </>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-56 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[#161B22] text-gray-400 text-[10px]">
              <tr className="border-b border-white/10">
                <th className="py-2 px-3">BACKUP FILE NAME</th>
                <th className="py-2 px-3">TYPE</th>
                <th className="py-2 px-3">FILE SIZE</th>
                <th className="py-2 px-3">CREATED AT</th>
                <th className="py-2 px-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {backups.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-6 text-gray-500">
                    No stored backups found. Click "CREATE INSTANT BACKUP" to generate point-in-time snapshot.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-3 font-bold text-white flex items-center gap-1.5">
                      {b.type === 'DATABASE_SQLITE' ? (
                        <Database className="w-3.5 h-3.5 text-[#00FF41]" />
                      ) : (
                        <FileJson className="w-3.5 h-3.5 text-purple-400" />
                      )}
                      {b.filename}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                        b.type === 'DATABASE_SQLITE'
                          ? 'bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30'
                          : 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                      }`}>
                        {b.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-300">{b.sizeFormatted}</td>
                    <td className="py-2 px-3 text-gray-400 text-[10px]">
                      {new Date(b.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownloadBackup(b.filename)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-[#00D4FF] border border-white/10 rounded text-[10px] font-bold transition-all flex items-center gap-1 inline-flex"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
