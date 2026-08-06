/**
 * BreezeAdapter.js
 * ICICI Direct Breeze Connect — NSE/BSE real-time streaming
 * Docs: https://github.com/Idirect-Tech/Breeze-Python-SDK
 * Requires: BREEZE_API_KEY + BREEZE_API_SECRET + SESSION_TOKEN
 */

export class BreezeAdapter {
  constructor({ apiKey, apiSecret, sessionToken, onTick, onStatus }) {
    this.apiKey       = apiKey;
    this.apiSecret    = apiSecret;
    this.sessionToken = sessionToken;
    this.onTick       = onTick;
    this.onStatus     = onStatus;
    this.ws           = null;
    this.isDestroyed  = false;
    this.reconnectTimer = null;
  }

  isConfigured() {
    return !!(this.apiKey && this.apiSecret && this.sessionToken);
  }

  /** Breeze uses a Socket.IO-based streaming endpoint */
  connect() {
    if (!this.isConfigured()) {
      this.onStatus('MISSING_KEYS');
      return;
    }
    this.onStatus('CONNECTING');

    // Breeze WebSocket (Socket.IO compatible endpoint)
    const url = `wss://livefeeds.icicidirect.com/feeddata`;

    const open = () => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.onStatus('LIVE');
        // Authenticate
        this.ws.send(JSON.stringify({
          task: 'cn',
          channel: '',
          auth: this.sessionToken,
          acctid: this.apiKey
        }));
        // Subscribe NIFTY 50, BANKNIFTY
        const subs = ['4.1.NIFTY 50.NSE', '4.1.NIFTY BANK.NSE'];
        subs.forEach(ch => {
          this.ws.send(JSON.stringify({ task: 'msu', channel: ch }));
        });
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (!msg.strikerate) return;
          this.onTick({
            symbol:    msg.symbol || msg.stockname,
            display:   msg.stockname || msg.symbol,
            name:      msg.stockname,
            type:      'index',
            exchange:  'NSE',
            price:     parseFloat(msg.strikerate || 0),
            change:    parseFloat(msg.percentchange || 0),
            changeAmt: parseFloat(msg.change || 0),
            high:      parseFloat(msg.high || 0),
            low:       parseFloat(msg.low  || 0),
            volume:    '—',
            provider:  'BREEZE',
          });
        } catch (_) {}
      };

      this.ws.onerror = () => this.onStatus('ERROR');
      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        this.onStatus('RECONNECTING');
        this.reconnectTimer = setTimeout(open, 5000);
      };
    };

    open();
  }

  async fetchOptionChain(symbol, expiryDate) {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(
        `https://api.icicidirect.com/breezeapi/api/v1/optionchain?stock_code=${symbol}&expiry_date=${expiryDate}&product_type=options`,
        { headers: { 'X-SessionToken': this.sessionToken, 'apikey': this.apiKey } }
      );
      return res.json();
    } catch { return null; }
  }

  destroy() {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

/**
 * UpstoxAdapter.js
 * Upstox Developer API v3 — Real-time NSE data
 * Docs: https://upstox.com/developer/api-documentation/
 * Requires: UPSTOX_ACCESS_TOKEN (OAuth2)
 */
export class UpstoxAdapter {
  constructor({ accessToken, onTick, onStatus }) {
    this.accessToken  = accessToken;
    this.onTick       = onTick;
    this.onStatus     = onStatus;
    this.ws           = null;
    this.isDestroyed  = false;
    this.reconnectTimer = null;
  }

  isConfigured() {
    return !!this.accessToken;
  }

  connect() {
    if (!this.isConfigured()) {
      this.onStatus('MISSING_KEYS');
      return;
    }
    this.onStatus('CONNECTING');

    const url = 'wss://api.upstox.com/v2/feed/market-data-feed';

    const open = () => {
      this.ws = new WebSocket(url, [], {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });

      this.ws.onopen = () => {
        this.onStatus('LIVE');
        // Subscribe to NIFTY 50, BANKNIFTY indices
        this.ws.send(JSON.stringify({
          guid: 'hello-trader',
          method: 'sub',
          data: {
            mode: 'full',
            instrumentKeys: [
              'NSE_INDEX|Nifty 50',
              'NSE_INDEX|Nifty Bank',
              'NSE_INDEX|Nifty Fin Service'
            ]
          }
        }));
      };

      this.ws.onbinaryMessage = (data) => {
        // Upstox sends protobuf — decode if available
        // For now emit raw
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const feeds = msg.feeds || {};
          Object.entries(feeds).forEach(([key, feed]) => {
            const ltpc = feed?.fullFeed?.marketFF?.ltpc;
            if (!ltpc) return;
            this.onTick({
              symbol:   key,
              display:  key.split('|')[1] || key,
              name:     key.split('|')[1] || key,
              type:     'index',
              exchange: 'NSE',
              price:    ltpc.ltp || 0,
              change:   ltpc.cp  || 0,
              high:     feed?.fullFeed?.marketFF?.oh?.high || 0,
              low:      feed?.fullFeed?.marketFF?.oh?.low  || 0,
              volume:   '—',
              provider: 'UPSTOX',
            });
          });
        } catch (_) {}
      };

      this.ws.onerror = () => this.onStatus('ERROR');
      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        this.onStatus('RECONNECTING');
        this.reconnectTimer = setTimeout(open, 5000);
      };
    };

    open();
  }

  destroy() {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

/**
 * TrueDataAdapter.js
 * TrueData — Real-time NSE/BSE streaming at 1-second latency
 * Docs: https://truedata.in/api-docs
 * Requires: TRUEDATA_USERNAME + TRUEDATA_PASSWORD
 */
export class TrueDataAdapter {
  constructor({ username, password, onTick, onStatus }) {
    this.username    = username;
    this.password    = password;
    this.onTick      = onTick;
    this.onStatus    = onStatus;
    this.ws          = null;
    this.isDestroyed = false;
    this.reconnectTimer = null;
    this.authToken   = null;
  }

  isConfigured() {
    return !!(this.username && this.password);
  }

  async connect() {
    if (!this.isConfigured()) {
      this.onStatus('MISSING_KEYS');
      return;
    }
    this.onStatus('CONNECTING');

    try {
      // Step 1: Login to get token
      const loginRes = await fetch('https://feed.truedata.in/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password })
      });
      const loginData = await loginRes.json();
      this.authToken = loginData.token;
    } catch {
      this.onStatus('AUTH_FAILED');
      return;
    }

    const open = () => {
      // Step 2: Connect WebSocket with token
      this.ws = new WebSocket(`wss://feed.truedata.in/ws?token=${this.authToken}`);

      this.ws.onopen = () => {
        this.onStatus('LIVE');
        // Subscribe to NIFTY, BANKNIFTY
        this.ws.send(JSON.stringify({
          method: 'subscribe',
          symbols: ['NIFTY-I', 'BANKNIFTY-I', 'FINNIFTY-I']
        }));
      };

      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (!data.ltp) return;
          this.onTick({
            symbol:    data.symbol || data.sym,
            display:   data.symbol || data.sym,
            name:      data.symbol,
            type:      'index',
            exchange:  'NSE',
            price:     parseFloat(data.ltp || 0),
            change:    parseFloat(data.pc  || 0),
            changeAmt: parseFloat(data.chg || 0),
            high:      parseFloat(data.high || 0),
            low:       parseFloat(data.low  || 0),
            volume:    data.vol ? `${(data.vol / 1e7).toFixed(1)}Cr` : '—',
            oi:        data.oi || 0,
            provider:  'TRUEDATA',
          });
        } catch (_) {}
      };

      this.ws.onerror = () => this.onStatus('ERROR');
      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        this.onStatus('RECONNECTING');
        this.reconnectTimer = setTimeout(open, 5000);
      };
    };

    open();
  }

  destroy() {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}
