const fs = require('fs');
let code = fs.readFileSync('src/context/TradingContext.js', 'utf8');

// 1. Strip all standalone useEffects that save to localStorage
code = code.replace(/useEffect\(\(\) => \{\s+if \(typeof window !== 'undefined'\) \{\s+localStorage\.setItem\('[^']+', JSON\.stringify\([^\)]+\)\);\s+\}\s+\}, \[[^\]]+\]\);/g, '');

// 2. Simplify useState initialization
const stateVars = [
  { name: 'students', default: 'DEFAULT_STUDENTS' },
  { name: 'monthlySubCost', default: '900' },
  { name: 'pendingRecharges', default: '[]' },
  { name: 'pendingReferrals', default: '[]' },
  { name: 'signupRequests', default: '[]' },
  { name: 'auditLogs', default: "[{ id: 'AUD-0', action: 'System Initialized Wallet Ledger Infrastructure', timestamp: new Date().toLocaleString() }]" },
  { name: 'positions', default: '[]' },
  { name: 'adminConfig', default: "{\n      name: 'Santosh Kumar',\n      email: 'hellotraderinstitute@gmail.com',\n      phone: '9211501914',\n      password: 'Maa@2003',\n      isLocked: false\n    }" },
  { name: 'tradeHistory', default: '[]' },
  { name: 'membershipPlans', default: "[\n      { id: 'PLAN-1', name: 'Basic Monthly', tokens: 1000, inrCost: 900, popularity: 'Most Popular' },\n      { id: 'PLAN-2', name: 'Pro Quarterly', tokens: 3500, inrCost: 2500, popularity: '' },\n      { id: 'PLAN-3', name: 'Elite Yearly', tokens: 15000, inrCost: 9000, popularity: 'Best Value' }\n    ]" },
  { name: 'tokenExchangeRate', default: '1' }
];

stateVars.forEach(v => {
  const blockRegex = new RegExp(`const \\\\[${v.name}, set${v.name.charAt(0).toUpperCase() + v.name.slice(1)}\\\\] = useState\\\\(\\\\(\\\\) => \\\\{[\\\\s\\\\S]*?\\\\}\\\\);`);
  code = code.replace(blockRegex, `const [${v.name}, set${v.name.charAt(0).toUpperCase() + v.name.slice(1)}] = useState(${v.default});`);
});

// 3. Remove localStorage fallback from submitSignupRequest
code = code.replace(/catch \(error\) \{[\s\S]*?\/\/ Fallback to legacy local state[\s\S]*?addAuditLog\(`New SignUp submission: \$\{name\} \(Phone: \$\{phone\}\)`\);\s*return \{ success: true \};\s*\}/, `catch (error) {\n      console.error("Backend error, strictly enforced", error);\n      return { success: false, error: 'Server offline. Cannot process signup.' };\n    }`);

// 4. Add isServerOnline to exports
code = code.replace(/balance, paperBalance, totalEquity/, 'isServerOnline, balance, paperBalance, totalEquity');

// 5. Add isServerOnline state tracking
code = code.replace(/const TradingContext = createContext\(\);/, `const TradingContext = createContext();\nexport let globalServerStatus = true;`);
code = code.replace(/const \[currentStudentId, setCurrentStudentId\] = useState\('STU-001'\);/, `const [currentStudentId, setCurrentStudentId] = useState('STU-001');\n  const [isServerOnline, setIsServerOnline] = useState(true);\n\n  useEffect(() => {\n    const interval = setInterval(() => {\n      setIsServerOnline(globalServerStatus);\n    }, 1000);\n    return () => clearInterval(interval);\n  }, []);`);

fs.writeFileSync('src/context/TradingContext.js', code);
console.log('Context refactored!');
