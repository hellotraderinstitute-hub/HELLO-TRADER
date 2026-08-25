'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe, Shield, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Search, Plus, Check, Copy, Activity, Server, ArrowRight, Eye, Trash2, HelpCircle, Lock
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function AdminStaticIpManager() {
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  const [releasingId, setReleasingId] = useState(null);
  const [diagnosticData, setDiagnosticData] = useState(null);
  const [copiedIp, setCopiedIp] = useState(null);

  // Form State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [broker, setBroker] = useState('ALL');
  const [connectionType, setConnectionType] = useState('SOCKS5');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('1080');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/static-ip/assignments');
      if (res.data?.success) {
        setAssignments(res.data.assignments || []);
      }
    } catch (err) {
      console.error('Failed to fetch static IP assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await apiClient.get('/admin/dashboard');
      if (res.data?.students) {
        setStudents(res.data.students);
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    }
  };

  useEffect(() => {
    fetchAssignments();
    fetchStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    if (!userSearchQuery.trim()) return students.slice(0, 15);
    const q = userSearchQuery.toLowerCase();
    return students.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.studentId || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    ).slice(0, 15);
  }, [students, userSearchQuery]);

  const validateIpv4 = (ip) => {
    if (!ip) return false;
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
      if (!/^\d+$/.test(part)) return false;
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255 && (part === '0' || !part.startsWith('0'));
    });
  };

  const handleAssignAndVerify = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedUserId) {
      setFormError('Please select a client from the directory.');
      return;
    }

    if (connectionType === 'DIRECT_IP') {
      if (!ipAddress.trim() || !validateIpv4(ipAddress)) {
        setFormError('Please enter a valid static IPv4 address.');
        return;
      }
    } else {
      if (!proxyHost.trim()) {
        setFormError('Please enter the Proxy Host/IP provided by your infrastructure provider.');
        return;
      }
      const p = Number(proxyPort);
      if (!p || p < 1 || p > 65535) {
        setFormError('Please enter a valid Proxy Port (1-65535).');
        return;
      }
    }

    setAssigning(true);
    try {
      const res = await apiClient.post('/admin/static-ip/assign', {
        userId: selectedUserId,
        broker,
        connectionType,
        ipAddress: ipAddress.trim() || (validateIpv4(proxyHost) ? proxyHost.trim() : '0.0.0.0'),
        proxyHost: proxyHost.trim(),
        proxyPort: proxyPort ? Number(proxyPort) : null,
        proxyUsername: proxyUsername.trim(),
        proxyPassword: proxyPassword.trim(),
        notes: notes.trim(),
      });

      if (res.data?.success) {
        const newAssignment = res.data.assignment;
        setFormSuccess(res.data.message || 'Assigned successfully. Triggering verification probe...');
        
        // Immediate 1-Click Verification Trigger
        try {
          const verifyRes = await apiClient.post(`/admin/static-ip/${newAssignment.id}/verify`);
          if (verifyRes.data?.verified) {
            setFormSuccess(`🟢 Assigned & VERIFIED! Egress IP: ${verifyRes.data.observedIp}`);
          } else {
            setFormError(`⚠️ Assigned, but verification blocked: ${verifyRes.data.message}`);
          }
        } catch (vErr) {
          setFormError(`Assigned, but verification failed: ${vErr.response?.data?.message || vErr.message}`);
        }

        // Reset form
        setProxyHost('');
        setProxyUsername('');
        setProxyPassword('');
        setIpAddress('');
        setNotes('');
        setSelectedUserId('');
        setUserSearchQuery('');
        fetchAssignments();
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to assign proxy/IP.');
    } finally {
      setAssigning(false);
    }
  };

  const handleVerify = async (id) => {
    setVerifyingId(id);
    try {
      const res = await apiClient.post(`/admin/static-ip/${id}/verify`);
      alert(res.data?.message || 'Verification complete');
      fetchAssignments();
    } catch (err) {
      alert(err.response?.data?.message || 'Verification failed: Connection timed out or agent offline.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRelease = async (id, ipStr) => {
    if (!confirm(`Are you sure you want to release ${ipStr}? It will be unassigned and available for reallocation.`)) {
      return;
    }
    setReleasingId(id);
    try {
      const res = await apiClient.post(`/admin/static-ip/${id}/release`, {
        reason: 'Admin manual release from dashboard'
      });
      alert(res.data?.message || 'Released successfully');
      fetchAssignments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to release');
    } finally {
      setReleasingId(null);
    }
  };

  const handleDiagnostics = async (id) => {
    try {
      const res = await apiClient.get(`/admin/static-ip/diagnostics/${id}`);
      if (res.data?.success) {
        setDiagnosticData(res.data.diagnostics);
      }
    } catch (err) {
      alert('Failed to load diagnostics: ' + (err.response?.data?.message || err.message));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  return (
    <div className="space-y-6 font-mono text-xs text-[#bbc9cf]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161B22] p-4 rounded-xl border border-white/10">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#00d4ff]" />
            CLIENT STATIC IP & PROXY INFRASTRUCTURE FLEET
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Admin-controlled per-client Proxy (HTTP/HTTPS/SOCKS5) and Static IP management with automated egress verification.
          </p>
        </div>
        <button
          onClick={fetchAssignments}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg text-xs transition-colors self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          REFRESH
        </button>
      </div>

      {/* 1-Minute Rapid Onboarding Form */}
      <div className="bg-[#161B22] p-5 rounded-xl border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-[#3c494e]/30 pb-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#00d4ff]" />
            1-Click Client Proxy / Static IP Onboarding (Under 1 Minute)
          </h3>
          <span className="text-[10px] bg-[#00d4ff]/10 text-[#00d4ff] px-2 py-0.5 rounded border border-[#00d4ff]/30 font-bold">
            Zero Client Configuration
          </span>
        </div>

        {formError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {formSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg flex items-center gap-2 text-xs">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{formSuccess}</span>
          </div>
        )}

        <form onSubmit={handleAssignAndVerify} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Step 1: Select Client */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase">1. Select Client *</label>
              <input
                type="text"
                placeholder="Search Name / Student ID..."
                value={userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  setSelectedUserId('');
                }}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff] text-xs"
              />
              {userSearchQuery && !selectedUserId && (
                <div className="max-h-36 overflow-y-auto bg-[#0b0e14] border border-white/20 rounded mt-1 divide-y divide-white/5 shadow-xl z-20 absolute w-64">
                  {filteredStudents.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedUserId(s.id);
                        setUserSearchQuery(`${s.studentId || ''} - ${s.name}`);
                      }}
                      className="p-2 hover:bg-white/10 cursor-pointer text-[11px]"
                    >
                      <div className="font-bold text-white">{s.name}</div>
                      <div className="text-gray-400 text-[9px]">{s.studentId} | {s.phone}</div>
                    </div>
                  ))}
                  {filteredStudents.length === 0 && (
                    <div className="p-2 text-gray-500 text-[10px]">No matching clients found</div>
                  )}
                </div>
              )}
              {selectedUserId && (
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                  <Check className="w-3 h-3" /> Client Selected
                </div>
              )}
            </div>

            {/* Step 2: Select Broker */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase">2. Target Broker *</label>
              <select
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff] text-xs font-bold"
              >
                <option value="ALL">ALL BROKERS (Shared Proxy)</option>
                <option value="ANGELONE">ANGEL ONE (SmartAPI TOTP + Proxy)</option>
                <option value="DHAN">DHAN (24h JWT + Proxy)</option>
                <option value="GOPOCKET">GOPOCKET (Simulation Only)</option>
              </select>
            </div>

            {/* Step 3: Select Connection Type */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase">3. Connection Type *</label>
              <select
                value={connectionType}
                onChange={(e) => {
                  setConnectionType(e.target.value);
                  if (e.target.value === 'SOCKS5') setProxyPort('1080');
                  else if (e.target.value === 'HTTP_PROXY' || e.target.value === 'HTTPS_PROXY') setProxyPort('8080');
                }}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-cyan-300 focus:outline-none focus:border-[#00d4ff] text-xs font-bold"
              >
                <option value="SOCKS5">SOCKS5 PROXY (Recommended)</option>
                <option value="HTTP_PROXY">HTTP PROXY (CONNECT Tunnel)</option>
                <option value="HTTPS_PROXY">HTTPS PROXY</option>
                <option value="DIRECT_IP">DIRECT STATIC IP (Interface Egress)</option>
              </select>
            </div>

            {/* Step 4: Expected Public Egress IPv4 */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase">4. Expected Egress IPv4 *</label>
              <input
                type="text"
                placeholder="e.g. 142.93.120.45"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded text-white focus:outline-none focus:border-[#00d4ff] text-xs font-bold font-mono"
              />
            </div>
          </div>

          {/* Proxy Host, Port, and Encrypted Credentials */}
          {connectionType !== 'DIRECT_IP' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-3 bg-[#0b0e14] rounded-lg border border-white/5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Proxy Host / IP *</label>
                <input
                  type="text"
                  placeholder="e.g. 142.93.120.45"
                  value={proxyHost}
                  onChange={(e) => {
                    setProxyHost(e.target.value);
                    if (!ipAddress && validateIpv4(e.target.value)) {
                      setIpAddress(e.target.value);
                    }
                  }}
                  className="w-full bg-[#161B22] border border-[#3c494e]/50 px-3 py-1.5 rounded text-white text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Proxy Port *</label>
                <input
                  type="number"
                  placeholder="1080"
                  value={proxyPort}
                  onChange={(e) => setProxyPort(e.target.value)}
                  className="w-full bg-[#161B22] border border-[#3c494e]/50 px-3 py-1.5 rounded text-white text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Username (Optional)</label>
                <input
                  type="text"
                  placeholder="user (AES-256 encrypted)"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                  className="w-full bg-[#161B22] border border-[#3c494e]/50 px-3 py-1.5 rounded text-white text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Password (Optional)</label>
                <input
                  type="password"
                  placeholder="password (never logged)"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                  className="w-full bg-[#161B22] border border-[#3c494e]/50 px-3 py-1.5 rounded text-white text-xs font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={assigning || !selectedUserId || (connectionType !== 'DIRECT_IP' && !proxyHost)}
              className="px-6 py-2.5 bg-[#00d4ff] hover:bg-[#00b8e6] disabled:opacity-50 text-black font-extrabold rounded text-xs transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              {assigning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              ASSIGN & VERIFY PROXY
            </button>
          </div>
        </form>
      </div>

      {/* Fleet Assignments Table */}
      <div className="bg-[#161B22] rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4 text-[#00d4ff]" />
            Active Proxy & Static IP Fleet ({assignments.length} Mappings)
          </h3>
          <span className="text-[10px] text-gray-400">
            {assignments.filter(a => a.status === 'VERIFIED').length} Verified / {assignments.filter(a => a.status === 'ASSIGNED').length} Pending Probe
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-white/5">
            <thead className="bg-[#0b0e14] text-[10px] text-gray-400 uppercase font-bold tracking-wider">
              <tr>
                <th className="p-3">Client</th>
                <th className="p-3">Broker</th>
                <th className="p-3">Type</th>
                <th className="p-3">Proxy / Egress IP</th>
                <th className="p-3">Observed Egress</th>
                <th className="p-3">Status</th>
                <th className="p-3">Agent</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {assignments.map(a => {
                const isVerified = a.status === 'VERIFIED';
                const isBlocked = a.status === 'BLOCKED';
                const isReleased = a.status === 'RELEASED';

                return (
                  <tr key={a.id} className={`hover:bg-white/5 transition-colors ${isReleased ? 'opacity-50' : ''}`}>
                    <td className="p-3">
                      <div className="font-bold text-white">{a.user?.name || 'Unknown'}</div>
                      <div className="text-[10px] text-gray-400">{a.user?.studentId} | {a.user?.phone}</div>
                    </td>
                    <td className="p-3">
                      <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                        {a.broker}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                        {a.connectionType || 'DIRECT_IP'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                        <span>{a.proxyHost ? `${a.proxyHost}:${a.proxyPort}` : a.ipAddress}</span>
                        {a.hasProxyAuth && (
                          <span title="Authenticated Proxy (AES Encrypted)" className="text-amber-400">
                            <Lock className="w-3 h-3 inline" />
                          </span>
                        )}
                        <button
                          onClick={() => copyToClipboard(a.ipAddress)}
                          className="hover:text-white transition-colors"
                          title="Copy Egress IP"
                        >
                          {copiedIp === a.ipAddress ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="text-[9px] text-gray-500">Expected: {a.ipAddress}</div>
                    </td>
                    <td className="p-3">
                      <span className={`text-[11px] ${a.currentObservedOutboundIp ? 'text-gray-300' : 'text-gray-500 italic'}`}>
                        {a.currentObservedOutboundIp || a.lastObservedOutboundIp || 'Awaiting Probe'}
                      </span>
                    </td>
                    <td className="p-3">
                      {isVerified && (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 w-max">
                          <CheckCircle className="w-3 h-3" /> VERIFIED
                        </span>
                      )}
                      {isBlocked && (
                        <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 w-max">
                          <XCircle className="w-3 h-3" /> MISMATCH
                        </span>
                      )}
                      {!isVerified && !isBlocked && !isReleased && (
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 w-max">
                          <Activity className="w-3 h-3" /> ASSIGNED
                        </span>
                      )}
                      {isReleased && (
                        <span className="bg-gray-500/10 text-gray-400 border border-gray-500/30 px-2 py-0.5 rounded text-[9px] font-bold w-max">
                          RELEASED
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {a.isAgentOnline ? (
                        <span className="text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          ONLINE
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[10px]">OFFLINE</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isReleased && (
                          <>
                            <button
                              onClick={() => handleVerify(a.id)}
                              disabled={verifyingId === a.id}
                              className="px-2 py-1 bg-white/5 hover:bg-[#00d4ff]/20 text-[#00d4ff] border border-white/10 rounded text-[10px] font-bold transition-colors disabled:opacity-30 flex items-center gap-1"
                              title="Probe live outbound egress"
                            >
                              <RefreshCw className={`w-3 h-3 ${verifyingId === a.id ? 'animate-spin' : ''}`} />
                              VERIFY
                            </button>
                            <button
                              onClick={() => handleRelease(a.id, a.ipAddress)}
                              disabled={releasingId === a.id}
                              className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded text-[10px] font-bold transition-colors"
                              title="Release assignment"
                            >
                              RELEASE
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDiagnostics(a.id)}
                          className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded text-[10px]"
                          title="View routing diagnostics"
                        >
                          DIAGNOSTICS
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500">
                    No proxy or static IP assignments recorded yet. Use the form above to onboard a client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diagnostics Modal */}
      {diagnosticData && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-[#3c494e]/30 pb-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00d4ff]" />
                PROXY EGRESS & ROUTING DIAGNOSTICS
              </h3>
              <button
                onClick={() => setDiagnosticData(null)}
                className="text-gray-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-[#0b0e14] rounded border border-white/5">
                <span className="text-gray-400">Client:</span>
                <span className="font-bold text-white">{diagnosticData.client.name} ({diagnosticData.client.studentId})</span>
              </div>
              <div className="flex justify-between p-2 bg-[#0b0e14] rounded border border-white/5">
                <span className="text-gray-400">Transport Model:</span>
                <span className="font-bold text-cyan-300">{diagnosticData.connectionType}</span>
              </div>
              {diagnosticData.proxyHost && (
                <div className="flex justify-between p-2 bg-[#0b0e14] rounded border border-white/5">
                  <span className="text-gray-400">Proxy Endpoint:</span>
                  <span className="font-bold text-white">{diagnosticData.proxyHost}:{diagnosticData.proxyPort}</span>
                </div>
              )}
              <div className="flex justify-between p-2 bg-[#0b0e14] rounded border border-white/5">
                <span className="text-gray-400">Expected Public Egress IP:</span>
                <span className="font-bold text-cyan-300">{diagnosticData.configuredClientIp}</span>
              </div>
              <div className="flex justify-between p-2 bg-[#0b0e14] rounded border border-white/5">
                <span className="text-gray-400">Observed Public Egress IP:</span>
                <span className="font-bold text-yellow-300">{diagnosticData.agentObservedOutboundIp || 'NOT_PROBED'}</span>
              </div>
              <div className="flex justify-between p-2 bg-[#0b0e14] rounded border border-white/5">
                <span className="text-gray-400">Verification State:</span>
                <span className={`font-bold ${diagnosticData.status === 'VERIFIED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {diagnosticData.status} ({diagnosticData.verificationResult})
                </span>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded text-[11px] text-blue-300 space-y-1">
              <div className="font-bold">Routing Specification:</div>
              <div>{diagnosticData.routingInformation.notes}</div>
            </div>

            <button
              onClick={() => setDiagnosticData(null)}
              className="w-full py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded text-xs transition-colors"
            >
              CLOSE DIAGNOSTICS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
