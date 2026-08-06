const fs = require('fs');

const adminPortalPath = 'src/components/AdminPortal.js';
let content = fs.readFileSync(adminPortalPath, 'utf8');

// The new deposits logic involves rendering the payments, checking UTRs, and showing a modal.
// We'll replace the entire DEPOSITS tab content with the new logic.

const depositsTabReplacement = `
      {adminTab === 'DEPOSITS' && (
        <AdminDepositsTab payments={payments} fetchData={fetchDashboard} />
      )}
`;

// Let's create the AdminDepositsTab component and inject it into the file.
const newComponent = `
function AdminDepositsTab({ payments, fetchData }) {
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalType, setModalType] = useState(null); // 'APPROVE' or 'REJECT'
  const [actualAmount, setActualAmount] = useState('');
  const [reason, setReason] = useState('');
  const [applyBonus, setApplyBonus] = useState(true);

  const pendingPayments = payments.filter(p => p.status === 'PENDING');

  const handleApprove = async () => {
    try {
      if (!actualAmount) {
        alert("Please enter actual amount received.");
        return;
      }
      await apiClient.post('/admin/approve-payment', {
        requestId: selectedPayment.id,
        actualAmountReceived: Number(actualAmount),
        applyBonus,
        reason
      });
      alert('Payment approved successfully! Tokens credited.');
      setModalType(null);
      setSelectedPayment(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Error approving payment.");
    }
  };

  const handleReject = async () => {
    try {
      await apiClient.post('/admin/reject-payment', {
        requestId: selectedPayment.id,
        reason
      });
      alert('Payment rejected.');
      setModalType(null);
      setSelectedPayment(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Error rejecting payment.");
    }
  };

  return (
    <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4">
      <h2 className="text-xs font-bold text-white border-b border-[#3c494e]/30 pb-2 flex items-center gap-1">
        <CreditCard className="w-4 h-4 text-amber-500" /> PENDING RECHARGE DEPOSITS
      </h2>

      {pendingPayments.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-xs">No pending deposit verification tickets in queue.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0b0e14] text-gray-400 font-bold border-b border-white/10">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Student Name</th>
                <th className="py-2.5 px-3">User Amount</th>
                <th className="py-2.5 px-3">Method & UTR</th>
                <th className="py-2.5 px-3">Screenshot</th>
                <th className="py-2.5 px-3 text-center">Receipt Verification & Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pendingPayments.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-3 text-gray-400">{new Date(r.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-3 font-bold text-white">{r.user?.name} <br/><span className="text-[10px] text-gray-500">{r.user?.phone}</span></td>
                  <td className="py-3 px-3 font-bold text-[#00FF41]">₹{r.amount.toLocaleString()}</td>
                  <td className="py-3 px-3">
                    <span className="font-bold">{r.method}</span>
                    <br/>
                    {r.utr && (
                      <span className="text-[10px] text-purple-400 font-mono">UTR: {r.utr} <Copy className="w-3 h-3 inline cursor-pointer" onClick={() => {navigator.clipboard.writeText(r.utr); alert('Copied UTR');}}/></span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {r.screenshotUrl ? (
                      <a href={r.screenshotUrl} target="_blank" className="text-[#00D4FF] text-[10px] underline">View Receipt</a>
                    ) : (
                      <span className="text-[10px] text-gray-500">None</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => { setSelectedPayment(r); setModalType('APPROVE'); setActualAmount(r.amount.toString()); }}
                        className="px-3 py-1.5 bg-[#00FF41]/20 hover:bg-[#00FF41] text-[#00FF41] hover:text-black font-extrabold rounded text-[10px] border border-[#00FF41]/40"
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => { setSelectedPayment(r); setModalType('REJECT'); }}
                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded text-[10px] border border-red-500/40"
                      >
                        REJECT
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval/Rejection Modal */}
      {modalType && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-sm p-6 text-white">
            <h3 className="font-bold text-lg mb-4 text-[#00D4FF]">{modalType === 'APPROVE' ? 'APPROVE PAYMENT' : 'REJECT PAYMENT'}</h3>
            
            {modalType === 'APPROVE' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-400 font-bold mb-1">AMOUNT ACTUALLY RECEIVED (INR)</label>
                  <input type="number" value={actualAmount} onChange={e => setActualAmount(e.target.value)} className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:border-[#00D4FF] font-bold text-sm outline-none"/>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={applyBonus} onChange={e => setApplyBonus(e.target.checked)} className="w-4 h-4 accent-[#00D4FF]"/>
                  <span className="text-[10px] font-bold">Apply Bonus Automatically</span>
                </div>
              </div>
            )}
            
            <div className="mt-4">
              <label className="block text-[10px] text-gray-400 font-bold mb-1">REASON (OPTIONAL)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Cleared via HDFC" className="w-full bg-[#0b0e14] border border-[#3c494e]/50 px-3 py-2 rounded focus:border-[#00D4FF] text-sm outline-none"/>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => { setModalType(null); setSelectedPayment(null); setReason(''); }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-bold text-xs">CANCEL</button>
              {modalType === 'APPROVE' ? (
                <button onClick={handleApprove} className="flex-1 py-2 bg-[#00FF41] text-black hover:bg-[#00e639] rounded font-bold text-xs">APPROVE</button>
              ) : (
                <button onClick={handleReject} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-bold text-xs">REJECT</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

// Inject into file
// First, check if AdminDepositsTab already exists
if (!content.includes('function AdminDepositsTab')) {
  // Add state for payments
  content = content.replace('const [adminDashboardStudents, setAdminDashboardStudents] = useState([]);', 
    'const [adminDashboardStudents, setAdminDashboardStudents] = useState([]);\\n  const [payments, setPayments] = useState([]);\\n  const [fetchTrigger, setFetchTrigger] = useState(0);\\n  const fetchDashboard = () => setFetchTrigger(prev => prev + 1);');
  
  // Modify fetchDashboard in useEffect
  content = content.replace(/const fetchDashboard = async \\(\\).*?fetchDashboard\\(\\);\\s*\\}/s, \`
      const fetchDashboardData = async () => {
        try {
          const res = await apiClient.get('/admin/dashboard');
          if (res.data) {
            setSignupRequests(res.data.signupRequests || []);
            setAdminDashboardStudents(res.data.students || []);
            setPayments(res.data.payments || []);
          }
        } catch (err) {
          console.error("Failed to load admin dashboard", err);
        }
      };
      fetchDashboardData();
  \`);
  
  // Update dependency array
  content = content.replace('}, [isAuthenticated, adminTab]);', '}, [isAuthenticated, adminTab, fetchTrigger]);');
  
  // Add CreditCard, Copy to imports if not there
  if (!content.includes('Copy')) {
      content = content.replace('ShieldCheck, Users, Activity,', 'ShieldCheck, Users, Activity, Copy,');
  }
  
  // Replace DEPOSITS tab
  const tabStartStr = "{adminTab === 'DEPOSITS' && (";
  const tabStart = content.indexOf(tabStartStr);
  const tabEndMarker = "{adminTab === 'REFERRALS' && (";
  if (tabStart !== -1 && content.indexOf(tabEndMarker) !== -1) {
    const tabEnd = content.indexOf(tabEndMarker);
    content = content.substring(0, tabStart) + depositsTabReplacement + content.substring(tabEnd);
  }
  
  content += '\\n' + newComponent;
  fs.writeFileSync(adminPortalPath, content);
  console.log('Patched AdminPortal.js successfully.');
} else {
  console.log('AdminPortal.js already patched.');
}
