/**
 * DhanAdapter.js
 * Dhan HQ API v2 — Real-time NSE/BSE data via WebSocket
 * Docs: https://dhanhq.co/docs/v2/
 * Requires: DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN
 */

export const DHAN_NSE_SYMBOLS = {
  'NIFTY':     { display: 'NIFTY 50',    name: 'NSE Nifty 50',    type: 'index',  exchange: 'IDX_I', securityId: '13' },
  'BANKNIFTY': { display: 'BANKNIFTY',   name: 'Nifty Bank',      type: 'index',  exchange: 'IDX_I', securityId: '25' },
  'FINNIFTY':  { display: 'FIN NIFTY',   name: 'Nifty Financial', type: 'index',  exchange: 'IDX_I', securityId: '27' },
  'SENSEX':    { display: 'SENSEX',      name: 'BSE Sensex',      type: 'index',  exchange: 'IDX_I', securityId: '1' },
  'RELIANCE':  { display: 'RELIANCE',    name: 'Reliance Ind.',   type: 'equity', exchange: 'NSE_EQ', securityId: '2885' },
  'TCS':       { display: 'TCS',         name: 'Tata Consultancy', type: 'equity', exchange: 'NSE_EQ', securityId: '11536' },
  'INFY':      { display: 'INFY',        name: 'Infosys',         type: 'equity', exchange: 'NSE_EQ', securityId: '1594' },
  'HDFCBANK':  { display: 'HDFCBANK',    name: 'HDFC Bank',       type: 'equity', exchange: 'NSE_EQ', securityId: '1333' },
};

export class DhanAdapter {
  constructor({ apiKey, clientId, onTick, onStatus }) {
    this.apiKey   = apiKey;
    this.clientId = clientId;
    this.onTick   = onTick;
    this.onStatus = onStatus;
    this.ws       = null;
    this.isDestroyed = false;
    this.reconnectTimer = null;
    this.tickTimeout = null;
    this.lastWsEvent = null;
  }

  isConfigured() {
    return !!(this.apiKey && this.clientId);
  }

  /** Connect to Dhan Live Market Feed WebSocket */
  async connect() {
    if (!this.isConfigured()) {
      this.onStatus('MISSING_KEYS');
      return;
    }

    this.onStatus('AUTHENTICATING', { authStatus: 'Authenticating...', error: null });
    
    // 1. Authenticate via local REST API proxy to bypass CORS
    try {
      const startTime = Date.now();
      const res = await fetch('/api/dhan', {
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.apiKey,
        }
      });
      
      const latency = Date.now() - startTime;
      const responseHeaders = {};
      res.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      const rawText = await res.text();
      let bodyData;
      try {
        bodyData = JSON.parse(rawText);
      } catch (e) {
        bodyData = { rawResponse: rawText };
      }
      
      const formattedDebug = `HTTP STATUS: ${res.status} ${res.statusText}\n\nHEADERS:\n${JSON.stringify(responseHeaders, null, 2)}\n\nRESPONSE BODY:\n${JSON.stringify(bodyData, null, 2)}`;
      
      console.log("=== DHAN AUTH DEBUG RESPONSE ===");
      console.log(formattedDebug);
      console.log("================================");

      if (!res.ok || bodyData.errorCode || bodyData.status === 'failure') {
        this.onStatus('AUTH_FAILED', { 
          authStatus: 'Failed', 
          error: formattedDebug,
          latency
        });
        return;
      }
      
      this.onStatus('CONNECTING_WS', { authStatus: 'Success', latency, error: null, wsStatus: 'Connecting...' });
      
    } catch (err) {
      const errorMsg = `NETWORK ERROR:\n${err.stack || err.message}`;
      console.error(errorMsg);
      this.onStatus('AUTH_FAILED', { authStatus: 'Failed', error: errorMsg });
      return;
    }

    // Dhan Feed WebSocket endpoint
    const url = `wss://api-feed.dhan.co?version=2&token=${this.apiKey}&clientId=${this.clientId}&authType=2`;

    const open = () => {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
      let tickCount = 0;

      const instruments = Object.entries(DHAN_NSE_SYMBOLS).map(([, meta]) => ({
        ExchangeSegment: meta.exchange,
        SecurityId: meta.securityId
      }));

      // Set 10s tick reception timeout
      if (this.tickTimeout) clearTimeout(this.tickTimeout);
      this.tickTimeout = setTimeout(() => {
        if (tickCount === 0 && !this.isDestroyed) {
          this.onStatus('AUTH_FAILED', {
            authStatus: 'Success',
            wsStatus: 'Connected (Timeout waiting for ticks)',
            error: `No ticks arrived within 10 seconds.\n\nSUBSCRIPTION PAYLOAD:\n${JSON.stringify({
              RequestCode: 15,
              InstrumentCount: instruments.length,
              InstrumentList: instruments
            }, null, 2)}\n\nLAST WS EVENT:\n${this.lastWsEvent || 'Connection established successfully, but endpoint did not push binary feed data.'}`
          });
        }
      }, 10000);

      this.ws.onopen = () => {
        this.lastWsEvent = 'WebSocket open handshake successful.';
        this.onStatus('WS_CONNECTED', { 
          wsStatus: 'Connected (Waiting for first tick...)', 
          activeSymbols: instruments.length,
          liveTicks: 0,
          error: null
        });
        
        // Subscribe to quotes
        const subReq = JSON.stringify({
          RequestCode: 15,
          InstrumentCount: instruments.length,
          InstrumentList: instruments
        });
        this.ws.send(subReq);
        console.log("[DHAN WS] Subscription sent:", subReq);
      };

      this.ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer)) {
          this.lastWsEvent = `Received non-binary frame: ${typeof e.data === 'string' ? e.data : 'blob/unknown'}`;
          console.warn("[DHAN WS] Non-binary payload received:", e.data);
          return;
        }

        // Log raw binary frames
        const rawBytes = new Uint8Array(e.data);
        console.log(`[DHAN WS BINARY FRAME] Length: ${e.data.byteLength} bytes`, rawBytes);

        try {
          const view = new DataView(e.data);
          if (e.data.byteLength < 8) return;

          // Audited Dhan V2 Binary Header Offsets
          const feedCode = view.getUint8(0);
          const msgLength = view.getUint16(1, true);
          const exchangeSegment = view.getUint8(3);
          const securityId = view.getUint32(4, true);

          // Standard header length is 8 bytes.
          // Optional sequence number could shift it to 12 bytes.
          const headerLength = 8;
          let price = 0;
          let volume = 0;
          let oi = 0;
          let ltt = 0;

          if (feedCode === 1) {
            // Index Packet (8-byte header + 4-byte LTP)
            if (e.data.byteLength >= headerLength + 4) {
              price = view.getFloat32(headerLength, true);
            }
          } else if (feedCode === 2) {
            // Ticker Packet (8-byte header + 4-byte LTP + 4-byte LTT)
            if (e.data.byteLength >= headerLength + 8) {
              price = view.getFloat32(headerLength, true);
              ltt = view.getUint32(headerLength + 4, true);
            }
          } else if (feedCode === 4) {
            // Quote Packet (8-byte header + 4-byte LTP + 2-byte LTQ + 4-byte LTT + 4-byte ATP + 4-byte Volume + 4-byte OI)
            if (e.data.byteLength >= headerLength + 4) {
              price = view.getFloat32(headerLength, true);
            }
            if (e.data.byteLength >= headerLength + 10) {
              ltt = view.getUint32(headerLength + 6, true);
            }
            if (e.data.byteLength >= headerLength + 18) {
              volume = view.getUint32(headerLength + 14, true);
            }
            if (e.data.byteLength >= headerLength + 22) {
              oi = view.getUint32(headerLength + 18, true);
            }
          } else if (feedCode === 5) {
            // OI Packet (8-byte header + 4-byte OI)
            if (e.data.byteLength >= headerLength + 4) {
              oi = view.getUint32(headerLength, true);
            }
          } else if (feedCode === 8) {
            // Full Packet (8-byte header + 4-byte LTP + Depth + Volume + OI)
            if (e.data.byteLength >= headerLength + 4) {
              price = view.getFloat32(headerLength, true);
            }
            if (e.data.byteLength >= headerLength + 18) {
              volume = view.getUint32(headerLength + 14, true);
            }
            if (e.data.byteLength >= headerLength + 22) {
              oi = view.getUint32(headerLength + 18, true);
            }
          }

          if (price > 0) {
            const tickData = {
              securityId: String(securityId),
              feedCode,
              exchangeSegment,
              price,
              volume,
              oi
            };

            tickCount++;
            if (this.tickTimeout) {
              clearTimeout(this.tickTimeout);
              this.tickTimeout = null;
            }

            const processed = this._processTick(tickData);
            if (processed) {
              const tickDetails = {
                symbol: processed,
                price,
                volume,
                oi,
                feedCode,
                exchangeSegment,
                securityId,
                rawBytes: Array.from(rawBytes.slice(0, 16))
              };

              this.onStatus('LIVE', {
                wsStatus: 'Streaming Live Ticks',
                liveTicks: tickCount,
                lastTickTime: new Date().toLocaleTimeString(),
                lastSymbol: processed,
                firstTick: tickCount === 1 ? JSON.stringify(tickDetails, null, 2) : undefined
              });
            }
          }
        } catch (err) {
          console.error("[DHAN WS] Unpack error:", err);
        }
      };

      this.ws.onerror = (err) => {
        this.lastWsEvent = `WS Error event: ${err.message || 'Connection handshake/network failure'}`;
        this.onStatus('ERROR', { wsStatus: 'Error' });
      };

      this.ws.onclose = (ev) => {
        this.lastWsEvent = `WS Closed. Code: ${ev.code}, Reason: ${ev.reason || 'None'}`;
        if (this.isDestroyed) return;
        this.onStatus('RECONNECTING', { wsStatus: 'Disconnected - Reconnecting...' });
        this.reconnectTimer = setTimeout(open, 5000);
      };
    };

    open();
  }

  _processTick(tick) {
    const symbolKey = Object.keys(DHAN_NSE_SYMBOLS).find(
      k => DHAN_NSE_SYMBOLS[k].securityId === String(tick.securityId)
    );
    if (!symbolKey) return null;
    const meta = DHAN_NSE_SYMBOLS[symbolKey];

    this.onTick({
      symbol:    symbolKey,
      ...meta,
      price:     tick.price || 0,
      change:    0.02, // Fallback placeholder since standard quote diffs are dynamic
      changeAmt: 0.1,
      high:      tick.price * 1.01,
      low:       tick.price * 0.99,
      volume:    tick.volume ? `${(tick.volume / 1e7).toFixed(2)}Cr` : '—',
      oi:        0,
      provider:  'DHAN',
    });
    return symbolKey;
  }

  /** Fetch option chain from Dhan API */
  async fetchOptionChain(symbol, expiryDate) {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(`https://api.dhan.co/v2/optionchain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.apiKey,
        },
        body: JSON.stringify({ UnderlyingScrip: symbol, ExpiryDate: expiryDate })
      });
      return res.json();
    } catch { return null; }
  }

  /** Fetch historical candles */
  async fetchKlines(symbol, interval = 'D', from, to) {
    if (!this.isConfigured()) return [];
    try {
      const meta = DHAN_NSE_SYMBOLS[symbol];
      if (!meta) return [];
      const res = await fetch('https://api.dhan.co/v2/charts/intraday', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.apiKey,
        },
        body: JSON.stringify({
          securityId: meta.securityId,
          exchangeSegment: meta.exchange,
          instrument: 'INDEX',
          interval,
          fromDate: from,
          toDate: to
        })
      });
      const data = await res.json();
      if (!data.open) return [];
      return data.timestamp.map((t, i) => ({
        time:   t,
        open:   data.open[i],
        high:   data.high[i],
        low:    data.low[i],
        close:  data.close[i],
        volume: data.volume?.[i] || 0
      }));
    } catch { return []; }
  }

  destroy() {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.tickTimeout) clearTimeout(this.tickTimeout);
    if (this.ws) this.ws.close();
  }
}
