const fs = require('fs');

let adminCode = fs.readFileSync('src/components/AdminPortal.js', 'utf8');

// 1. Import apiClient
if (!adminCode.includes("import apiClient")) {
  adminCode = adminCode.replace("import ProviderSettings from './ProviderSettings';", "import ProviderSettings from './ProviderSettings';\nimport apiClient from '../lib/axios';");
}

// 2. Remove context variables that we are migrating
adminCode = adminCode.replace(/signupRequests,\s*/, '');
adminCode = adminCode.replace(/approveSignupRequest, rejectSignupRequest,\s*/, '');

// 3. Add local state for signupRequests and students
const stateInit = `
  const [signupRequests, setSignupRequests] = useState([]);
  const [adminDashboardStudents, setAdminDashboardStudents] = useState([]);

  // Fetch admin dashboard data
  useEffect(() => {
    if (isAuthenticated) {
      const fetchDashboard = async () => {
        try {
          const res = await apiClient.get('/admin/dashboard');
          if (res.data) {
            setSignupRequests(res.data.signupRequests || []);
            setAdminDashboardStudents(res.data.students || []);
          }
        } catch (err) {
          console.error("Failed to load admin dashboard", err);
        }
      };
      fetchDashboard();
    }
  }, [isAuthenticated, adminTab]);

  const approveSignupRequest = async (requestId, tempPassword) => {
    try {
      await apiClient.post('/admin/approve-signup', { requestId, tempPassword });
      setSignupRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error(err);
    }
  };

  const rejectSignupRequest = async (requestId) => {
    try {
      await apiClient.post('/admin/reject-signup', { requestId });
      setSignupRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error(err);
    }
  };
`;
adminCode = adminCode.replace(/const \[adminEmailInput, setAdminEmailInput\] = useState\(''\);/, stateInit + '\n  const [adminEmailInput, setAdminEmailInput] = useState(\'\');');

fs.writeFileSync('src/components/AdminPortal.js', adminCode);
console.log('patched AdminPortal.js');

let contextCode = fs.readFileSync('src/context/TradingContext.js', 'utf8');
contextCode = contextCode.replace(/const \[signupRequests, setSignupRequests\] = useState\(\(\) => \{[\s\S]*?return DEFAULT_STUDENTS;\s*\}\);/g, ''); // Wait, I stripped this earlier, let's just do simple replace
contextCode = contextCode.replace(/const \[signupRequests, setSignupRequests\] = useState\(\[\]\);/, '');
contextCode = contextCode.replace(/const approveSignupRequest =[\s\S]*?\}]\);\s*\};\s*\}, \[\]\);/, '');
contextCode = contextCode.replace(/const rejectSignupRequest =[\s\S]*?\}]\);\s*\};\s*\}, \[\]\);/, '');
contextCode = contextCode.replace(/signupRequests,/, '');
contextCode = contextCode.replace(/approveSignupRequest, rejectSignupRequest,/, '');
fs.writeFileSync('src/context/TradingContext.js', contextCode);
console.log('patched TradingContext.js');
