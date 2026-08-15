'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Edit3, Trash2, CheckCircle2, XCircle, 
  Award, TrendingUp, IndianRupee, Phone, Mail, Calendar, 
  Briefcase, Percent, RefreshCw, ShieldAlert, Sparkles, Lock, Unlock, Shield
} from 'lucide-react';
import apiClient from '../lib/axios';

export default function EmployeeManager() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Modals & Credential Details State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [accessModalEmployee, setAccessModalEmployee] = useState(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialsData, setCredentialsData] = useState(null);

  // Add Form
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    phone: '',
    designation: 'SALES_EXEC',
    department: 'SALES',
    baseSalary: '',
    commissionRate: '',
    crmAccess: true,
    hireDate: '',
    employeeCodeInput: ''
  });

  // Edit Form
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    designation: 'SALES_EXEC',
    department: 'SALES',
    baseSalary: '',
    commissionRate: '',
    status: 'ACTIVE',
    crmAccess: true
  });

  useEffect(() => {
    fetchEmployees();
  }, [statusFilter]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/crm/employees', {
        params: { status: statusFilter }
      });
      if (res.data?.success) {
        setEmployees(res.data.employees);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/crm/employees', addForm);
      if (res.data?.success) {
        setShowAddModal(false);
        setAddForm({
          name: '', email: '', phone: '', designation: 'SALES_EXEC',
          department: 'SALES', baseSalary: '', commissionRate: '', crmAccess: true, hireDate: '', employeeCodeInput: ''
        });
        fetchEmployees();

        if (res.data.credentials) {
          setCredentialsData({
            title: 'EMPLOYEE CREATED SUCCESSFULLY',
            ...res.data.credentials
          });
          setShowCredentialsModal(true);
        }
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add employee');
    }
  };

  const handleShowAccessDetails = (emp) => {
    setCredentialsData({
      title: 'EMPLOYEE ACCESS DETAILS',
      employeeCode: emp.employeeCode,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      tempPassword: null,
      designation: emp.designation,
      crmAccess: emp.crmAccess,
      loginUrl: typeof window !== 'undefined' ? window.location.origin : 'https://hellotraderinstitute.com'
    });
    setShowCredentialsModal(true);
  };

  const handleResetPassword = async (emp) => {
    if (!confirm(`Generate a new temporary password for ${emp.name} (${emp.employeeCode})?`)) return;
    try {
      const res = await apiClient.post(`/crm/employees/${emp.id}/reset-password`);
      if (res.data?.success && res.data.credentials) {
        setCredentialsData({
          title: 'PASSWORD RESET SUCCESSFUL',
          ...res.data.credentials
        });
        setShowCredentialsModal(true);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleStartEdit = (emp) => {
    setEditingEmployee(emp);
    setEditForm({
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      designation: emp.designation,
      department: emp.department,
      baseSalary: String(emp.baseSalary || 0),
      commissionRate: String(emp.commissionRate || 0),
      status: emp.status,
      crmAccess: emp.crmAccess ?? true
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;
    try {
      const res = await apiClient.patch(`/crm/employees/${editingEmployee.id}`, editForm);
      if (res.data?.success) {
        setEditingEmployee(null);
        fetchEmployees();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update employee');
    }
  };

  const handleToggleAccess = async (emp) => {
    const newAccess = !emp.crmAccess;
    try {
      const endpoint = newAccess ? `/crm/employees/${emp.id}/restore-access` : `/crm/employees/${emp.id}/revoke-access`;
      const res = await apiClient.post(endpoint);
      if (res.data?.success) {
        setAccessModalEmployee(null);
        fetchEmployees();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to change CRM access');
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'ADMIN': return <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[9px] font-black px-2 py-0.5 rounded-full">🛡️ ADMIN</span>;
      case 'SALES_EXEC': return <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">💼 SALES EXECUTIVE</span>;
      case 'TELECALLER': return <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">📞 TELECALLER</span>;
      case 'ACCOUNTANT': return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">💵 ACCOUNTANT</span>;
      default: return <span className="bg-gray-500/20 text-gray-300 border border-gray-500/40 text-[9px] font-bold px-2 py-0.5 rounded-full">{role}</span>;
    }
  };

  return (
    <div className="space-y-6 text-white font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161B22] p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              Staff Directory & Access Management
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full font-bold">
                {employees.length} Total Staff
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Manage Employee IDs (EMP001), roles, CRM login access ON/OFF, and performance tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-black px-4 py-2 rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-1.5 transform hover:scale-105 active:scale-95 transition-all"
          >
            <UserPlus className="w-4 h-4" /> + Add New Employee
          </button>
        </div>
      </div>

      {/* 📋 Clean Admin Employee Access Management Table */}
      <div className="bg-[#161B22] rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" /> Employee Access Control Table
          </h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
            Loading Employee Access Directory...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B0E14] text-gray-400 font-bold border-b border-white/10">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-center">CRM Access</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">
                      <div className="text-sm font-black text-white">{emp.name}</div>
                      <div className="text-[10px] font-mono text-purple-400">{emp.employeeCode} • {emp.phone}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      {getRoleBadge(emp.designation)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {emp.crmAccess ? (
                        <span className="bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 text-[10px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                          🟢 ACCESS ON
                        </span>
                      ) : (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                          🔴 ACCESS OFF
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        emp.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400'
                      }`}>
                        {emp.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleShowAccessDetails(emp)}
                        className="px-2.5 py-1 bg-[#0B0E14] hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-lg text-[11px] font-bold transition-all"
                        title="View Login Identifier & URL"
                      >
                        🔑 DETAILS
                      </button>

                      <button
                        onClick={() => handleResetPassword(emp)}
                        className="px-2.5 py-1 bg-[#0B0E14] hover:bg-pink-600/30 text-pink-300 border border-pink-500/30 rounded-lg text-[11px] font-bold transition-all"
                        title="Reset Temporary Password"
                      >
                        🔒 RESET
                      </button>

                      <button
                        onClick={() => handleStartEdit(emp)}
                        className="px-2.5 py-1 bg-[#0B0E14] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-[11px] font-bold transition-all"
                      >
                        EDIT
                      </button>

                      <button
                        onClick={() => setAccessModalEmployee(emp)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                          emp.crmAccess
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        }`}
                      >
                        {emp.crmAccess ? 'REMOVE ACCESS' : 'RESTORE ACCESS'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🔑 Modal: Employee Credentials / Access Details / Password Reset */}
      {showCredentialsModal && credentialsData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-emerald-500/40 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-emerald-400 flex items-center gap-2">
                <span>🔑</span> {credentialsData.title || 'EMPLOYEE LOGIN ACCESS GENERATED'}
              </h3>
              <button onClick={() => setShowCredentialsModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="bg-[#0B0E14] border border-white/10 rounded-xl p-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400 font-sans font-bold">Employee Name:</span>
                <span className="text-white font-bold">{credentialsData.name}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400 font-sans font-bold">Employee ID:</span>
                <span className="text-purple-400 font-bold">{credentialsData.employeeCode}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400 font-sans font-bold">Login Username / Email:</span>
                <span className="text-cyan-300 font-bold">{credentialsData.email}</span>
              </div>
              {credentialsData.tempPassword && (
                <div className="flex justify-between border-b border-white/5 pb-1.5 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                  <span className="text-amber-300 font-sans font-bold">Temporary Password:</span>
                  <span className="text-amber-300 font-black text-sm">{credentialsData.tempPassword}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400 font-sans font-bold">Assigned Role:</span>
                <span className="text-pink-300 font-bold">{credentialsData.designation}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400 font-sans font-bold">CRM Access Status:</span>
                <span className={credentialsData.crmAccess ? 'text-[#00FF41] font-bold' : 'text-red-400 font-bold'}>
                  {credentialsData.crmAccess ? '🟢 ON' : '🔴 OFF'}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-gray-400 font-sans font-bold">Login Portal URL:</span>
                <a href={credentialsData.loginUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline font-bold truncate max-w-[200px]">
                  {credentialsData.loginUrl}
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 text-xs font-bold">
              <button
                onClick={() => {
                  const detailsText = `EMPLOYEE CRM LOGIN DETAILS\nName: ${credentialsData.name}\nEmployee ID: ${credentialsData.employeeCode}\nEmail: ${credentialsData.email}\nTemp Password: ${credentialsData.tempPassword || '***'}\nRole: ${credentialsData.designation}\nLogin URL: ${credentialsData.loginUrl}`;
                  navigator.clipboard.writeText(detailsText);
                  alert('📋 Login details copied to clipboard!');
                }}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg"
              >
                📋 COPY LOGIN DETAILS
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(credentialsData.loginUrl);
                  alert('🔗 Login link copied to clipboard!');
                }}
                className="w-full bg-[#0B0E14] hover:bg-white/10 text-cyan-300 border border-cyan-500/30 py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                🔗 COPY LOGIN LINK
              </button>

              <button
                onClick={() => setShowCredentialsModal(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl mt-1 font-black"
              >
                ✅ DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ➕ Modal: Add Employee */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-purple-500/30 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>👤</span> Add New Staff Member
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Employee ID (e.g. EMP001)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={addForm.employeeCodeInput}
                    onChange={e => setAddForm({ ...addForm, employeeCodeInput: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amit Sharma"
                    value={addForm.name}
                    onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={addForm.phone}
                    onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="amit@hellotrader.in"
                    value={addForm.email}
                    onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Access Role *</label>
                  <select
                    value={addForm.designation}
                    onChange={e => setAddForm({ ...addForm, designation: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-bold"
                  >
                    <option value="ADMIN">ADMIN (Full Access)</option>
                    <option value="SALES_EXEC">SALES EXECUTIVE (Own Leads)</option>
                    <option value="TELECALLER">TELECALLER (Calling & Demos)</option>
                    <option value="ACCOUNTANT">ACCOUNTANT (Financial Ops)</option>
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">CRM Access Toggle</label>
                  <select
                    value={addForm.crmAccess ? 'true' : 'false'}
                    onChange={e => setAddForm({ ...addForm, crmAccess: e.target.value === 'true' })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-bold"
                  >
                    <option value="true">🟢 CRM ACCESS ON</option>
                    <option value="false">🔴 CRM ACCESS OFF</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2 rounded-xl">Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ Modal: Edit Employee */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-purple-500/30 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  ✏️ Edit Employee — {editingEmployee.employeeCode}
                </h3>
                <p className="text-[10px] text-purple-300">
                  Editing employee details. Permanent ID ({editingEmployee.employeeCode}) retains 100% of historical records.
                </p>
              </div>
              <button onClick={() => setEditingEmployee(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Employee Full Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">Access Role *</label>
                  <select
                    value={editForm.designation}
                    onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-bold"
                  >
                    <option value="ADMIN">ADMIN (Full Access)</option>
                    <option value="SALES_EXEC">SALES EXECUTIVE (Own Leads)</option>
                    <option value="TELECALLER">TELECALLER (Calling & Demos)</option>
                    <option value="ACCOUNTANT">ACCOUNTANT (Financial Ops)</option>
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-bold block mb-1 uppercase text-[10px]">CRM Access</label>
                  <select
                    value={editForm.crmAccess ? 'true' : 'false'}
                    onChange={e => setEditForm({ ...editForm, crmAccess: e.target.value === 'true' })}
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-purple-500 outline-none font-bold"
                  >
                    <option value="true">🟢 ACCESS ON</option>
                    <option value="false">🔴 ACCESS OFF</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setEditingEmployee(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2 rounded-xl">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔒 Modal: Remove / Restore Access Confirmation */}
      {accessModalEmployee && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-amber-500/40 rounded-2xl w-full max-w-md p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-300">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                {accessModalEmployee.crmAccess ? `Remove CRM Access for ${accessModalEmployee.name}?` : `Restore CRM Access for ${accessModalEmployee.name}?`}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {accessModalEmployee.crmAccess
                  ? `Login will be disabled immediately. Historical leads, admissions, sales, and commissions attached to ${accessModalEmployee.employeeCode} will be 100% PRESERVED.`
                  : `Login access will be re-enabled for ${accessModalEmployee.name} (${accessModalEmployee.employeeCode}).`}
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setAccessModalEmployee(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleAccess(accessModalEmployee)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-xl shadow-lg"
              >
                {accessModalEmployee.crmAccess ? 'Confirm Remove Access' : 'Confirm Restore Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
