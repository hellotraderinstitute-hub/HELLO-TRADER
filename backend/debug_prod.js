const axios = require('axios');

async function debugProductionLive() {
  console.log('=== 1. CALLING LIVE RENDER BACKEND DIRECTLY ===');
  try {
    const res = await axios.post('https://hello-trader.onrender.com/api/ai-lab/chat', {
      userQuery: 'TCS',
      activeMode: 'ANALYSE'
    }, { timeout: 45000 });
    console.log('RENDER RESPONSE:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('RENDER ERROR:', err.message, err.response?.data || '');
  }

  console.log('\n=== 2. INSPECTING LIVE VERCEL FRONTEND BUNDLES ===');
  try {
    const pageRes = await axios.get('https://hello-trader-seven.vercel.app/ai-lab');
    console.log('VERCEL /ai-lab HTML STATUS:', pageRes.status);
    const html = pageRes.data;
    
    // Find all JS scripts
    const jsMatches = html.match(/src="(\/_next\/static\/chunks\/[^"]+)"/g) || [];
    console.log('Found Chunks count in Vercel HTML:', jsMatches.length);

    for (const match of jsMatches) {
      const scriptPath = match.replace('src="', '').replace('"', '');
      const scriptUrl = 'https://hello-trader-seven.vercel.app' + scriptPath;
      try {
        const scriptRes = await axios.get(scriptUrl);
        const code = scriptRes.data;
        if (code.includes('AI Research Insight') || code.includes('24,366') || code.includes('24302')) {
          console.log('🔴 FOUND LEGACY STRING IN DEPLOYED VERCEL CHUNK:', scriptUrl);
        } else {
          console.log('🟢 CLEAN CHUNK:', scriptPath);
        }
      } catch (e) {
        console.log('Chunk fetch error:', scriptUrl, e.message);
      }
    }
  } catch (e) {
    console.error('VERCEL FETCH ERROR:', e.message);
  }
}

debugProductionLive();
