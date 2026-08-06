const fs = require('fs');
let code = fs.readFileSync('src/app/page.js', 'utf8');

// 1. Import apiClient
code = code.replace(/import \{ Bell, /, "import apiClient from '../lib/axios';\nimport { Bell, ");

// 2. Remove all sessionStorage usages
code = code.replace(/const cachedAdmin = sessionStorage\.getItem\('admin_authenticated'\);/g, '');
code = code.replace(/if \(cachedAdmin\) \{[\s\S]*?\}/, '');
code = code.replace(/const cachedStudentId = sessionStorage\.getItem\('logged_in_student_id'\);/g, '');
code = code.replace(/if \(cachedStudentId\) \{[\s\S]*?\}/, '');
code = code.replace(/sessionStorage\.removeItem\('[^']+'\);/g, '');
code = code.replace(/sessionStorage\.setItem\('[^']+', '[^']+'\);/g, '');
code = code.replace(/sessionStorage\.setItem\('logged_in_student_id', student\.id\);/g, '');

// 3. Add global check on mount to fetch /auth/me
const authCheckCode = `
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiClient.get('/auth/me');
        if (res.data && res.data.user) {
          setIsAuthenticated(true);
          if (res.data.user.role === 'ADMIN') {
            setIsAdmin(true);
            setActiveTab('admin');
          } else {
            setCurrentStudentId(res.data.user.id);
            setActiveTab('desk');
          }
        }
      } catch (err) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);
`;
code = code.replace(/useEffect\(\(\) => \{[\s\S]*?\}, \[students, setCurrentStudentId\]\);/, authCheckCode);

// 4. Rewrite handleLogin
const newHandleLogin = `
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput || !passwordInput) return;
    try {
      const res = await apiClient.post('/auth/login', {
        emailOrPhone: studentIdInput.trim(),
        password: passwordInput
      });
      if (res.data && res.data.user) {
        setIsAdmin(false);
        setCurrentStudentId(res.data.user.id);
        setIsAuthenticated(true);
        setLoginError('');
        setActiveTab('desk');
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Invalid credentials.');
    }
  };
`;
code = code.replace(/const handleLogin = \(e\) => \{[\s\S]*?sessionStorage\.setItem\('logged_in_student_id', student\.id\);[\s\S]*?\};/, newHandleLogin);

// 5. Rewrite handleAdminLogin
const newHandleAdminLogin = `
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/auth/login', {
        emailOrPhone: adminEmailInput.trim(),
        password: adminPasswordInput
      });
      if (res.data && res.data.user && res.data.user.role === 'ADMIN') {
        setIsAdmin(true);
        setIsAuthenticated(true);
        setAdminLoginError('');
        setActiveTab('admin');
        setShowAdminLogin(false);
      } else {
        setAdminLoginError('Access Denied. Not an admin.');
      }
    } catch (err) {
      setAdminLoginError('Invalid Admin Email, Phone, or Password.');
    }
  };
`;
code = code.replace(/const handleAdminLogin = \(e\) => \{[\s\S]*?setShowAdminLogin\(false\);\s*\} else \{\s*setAdminLoginError\('Invalid Admin Email, Phone, or Password\.'\);\s*\}\s*\};/, newHandleAdminLogin);

// 6. Rewrite handleLogout
const newHandleLogout = `
  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (e) {}
    setIsAuthenticated(false);
    setIsAdmin(false);
    setStudentIdInput('');
    setPasswordInput('');
    setActiveTab('desk');
  };
`;
code = code.replace(/const handleLogout = \(\) => \{[\s\S]*?setActiveTab\('desk'\);\s*\};/, newHandleLogout);

fs.writeFileSync('src/app/page.js', code);
console.log('page.js refactored!');
