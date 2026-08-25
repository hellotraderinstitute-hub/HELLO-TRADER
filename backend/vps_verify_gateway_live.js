
    const http = require('http');

    function post(path, body, token) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4000,
          path: path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          }
        }, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (_) { resolve({ status: res.statusCode, raw }); }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    }

    function get(path, token) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4000,
          path: path,
          method: 'GET',
          headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        }, res => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
            catch (_) { resolve({ status: res.statusCode, raw }); }
          });
        });
        req.on('error', reject);
        req.end();
      });
    }

    async function runLiveVerification() {
      console.log('[LIVE TEST 1] Testing Unified Gateway Partner Login (PHT0036 + Mobile)...');
      const partnerLogin = await post('/api/auth/login', {
        emailOrPhone: 'PHT0036',
        phone: '9876543210',
        password: 'PartnerLivePass@2026'
      });
      console.log('   Status:', partnerLogin.status);
      console.log('   Role:', partnerLogin.body?.role);
      console.log('   Redirect:', partnerLogin.body?.redirectTo);
      if (partnerLogin.status !== 200 || partnerLogin.body?.role !== 'PARTNER') {
        throw new Error('Partner unified login failed!');
      }

      console.log('\n[LIVE TEST 2] Testing Partner Negative Login (Wrong Mobile)...');
      const wrongMobile = await post('/api/auth/login', {
        emailOrPhone: 'PHT0036',
        phone: '1111122222',
        password: 'PartnerLivePass@2026'
      });
      console.log('   Status:', wrongMobile.status);
      console.log('   Error Message:', wrongMobile.body?.error);
      if (wrongMobile.status !== 401) {
        throw new Error('Wrong mobile check failed!');
      }

      console.log('\n[LIVE TEST 3] Testing Partner Dashboard Access with Issued Token...');
      const partnerToken = partnerLogin.body.token;
      const dash = await get('/api/partner/dashboard', partnerToken);
      console.log('   Status:', dash.status);
      console.log('   Partner ID:', dash.body?.partner?.partnerId);
      console.log('   Total Referrals:', dash.body?.metrics?.totalReferrals);

      console.log('\n[LIVE TEST 4] Testing Partner Admin Access Block...');
      const adminBlock = await get('/api/admin/partners', partnerToken);
      console.log('   Status:', adminBlock.status, '(Expected: 403 Forbidden)');
      if (adminBlock.status !== 403) {
        throw new Error('Security Violation: Partner was able to access Admin Portal!');
      }

      console.log('\n================================================================');
      console.log('🎉 ALL LIVE PRODUCTION VERIFICATION TESTS PASSED SUCCESSFULLY!');
      console.log('================================================================');
    }

    runLiveVerification().catch(e => { console.error('Live Test Failed:', e); process.exit(1); });
  