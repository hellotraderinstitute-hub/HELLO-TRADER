/**
 * BinanceAdapter.js
 * Real-time crypto data via Binance public WebSocket + REST API
 * No API key required.
 */

export const BINANCE_SYMBOLS = {
  'BTCUSDT':  { display: 'BTC/USDT',  name: 'Bitcoin',   type: 'crypto', exchange: 'BINANCE' },
  'ETHUSDT':  { display: 'ETH/USDT',  name: 'Ethereum',  type: 'crypto', exchange: 'BINANCE' },
  'SOLUSDT':  { display: 'SOL/USDT',  name: 'Solana',    type: 'crypto', exchange: 'BINANCE' },
  'BNBUSDT':  { display: 'BNB/USDT',  name: 'BNB',       type: 'crypto', exchange: 'BINANCE' },
  'XRPUSDT':  { display: 'XRP/USDT',  name: 'Ripple',    type: 'crypto', exchange: 'BINANCE' },
  'ADAUSDT':  { display: 'ADA/USDT',  name: 'Cardano',   type: 'crypto', exchange: 'BINANCE' },
  'DOGEUSDT': { display: 'DOGE/USDT', name: 'Dogecoin',  type: 'crypto', exchange: 'BINANCE' },
  'AVAXUSDT': { display: 'AVAX/USDT', name: 'Avalanche', type: 'crypto', exchange: 'BINANCE' },
};

export class BinanceAdapter {
  constructor({ onTick, onStatus }) {
    this.onTick = onTick;
    this.onStatus = onStatus;
    this.ws = null;
    this.reconnectTimer = null;
    this.isDestroyed = false;
  }

  /** Subscribe to multi-ticker stream */
  connect() {
    const streams = Object.keys(BINANCE_SYMBOLS)
      .map(s => `${s.toLowerCase()}@ticker`)
      .join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    this.onStatus('CONNECTING');

    const open = () => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.onStatus('LIVE');
      };

      this.ws.onmessage = (e) => {
        try {
          const { data: d } = JSON.parse(e.data);
          if (!d?.s) return;
          const meta = BINANCE_SYMBOLS[d.s];
          if (!meta) return;

          this.onTick({
            symbol: d.s,
            ...meta,
            price:     parseFloat(d.c),
            open:      parseFloat(d.o),
            change:    parseFloat(parseFloat(d.P).toFixed(2)),
            changeAmt: parseFloat((parseFloat(d.c) - parseFloat(d.o)).toFixed(4)),
            high:      parseFloat(d.h),
            low:       parseFloat(d.l),
            volume:    `${(parseFloat(d.v) * parseFloat(d.c) / 1e9).toFixed(2)}B`,
            bid:       parseFloat(d.b),
            ask:       parseFloat(d.a),
            provider:  'BINANCE',
          });
        } catch (_) {}
      };

      this.ws.onerror = () => this.onStatus('ERROR');

      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        this.onStatus('RECONNECTING');
        this.reconnectTimer = setTimeout(open, 3000);
      };
    };

    open();
  }

  /** Fetch historical OHLCV candles */
  async fetchKlines(symbol, interval = '5m', limit = 200) {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw.map(k => ({
      time:   Math.floor(k[0] / 1000),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /** Subscribe to live kline (candlestick) stream for a single symbol */
  subscribeKline(symbol, interval, onCandle) {
    const url = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(url);

    ws.onmessage = (e) => {
      try {
        const { k } = JSON.parse(e.data);
        if (!k) return;
        onCandle({
          time:   Math.floor(k.t / 1000),
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
          closed: k.x,
        });
      } catch (_) {}
    };

    return () => ws.readyState === WebSocket.OPEN && ws.close();
  }

  destroy() {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}
