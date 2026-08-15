/**
 * ShoonyaAdapter — Hello Trader Broker Adapter for Shoonya (Finvasia)
 * API Docs: https://shoonya.com/api-documentation
 * WebSocket + REST. Uses TOTP-based login.
 * Implements IBrokerAdapter
 */

const axios = require('axios');
const crypto = require('crypto');
const IBrokerAdapter = require('../IBrokerAdapter');

const SHOONYA_BASE_URL = 'https://api.shoonya.com/NorenWClientTP';

class ShoonyaAdapter extends IBrokerAdapter {
  constructor(credentials) {
    super(credentials);
    this.brokerName = 'SHOONYA';
    this.userId = credentials.clientId;
    this.password = credentials.password;
    this.totp = credentials.totpSecret;
    this.vendorCode = credentials.vendorCode;
    this.apiSecret = credentials.apiSecret;
    this.imei = credentials.imei || '000000000000000';
    this.sessionToken = credentials.accessToken || null;
    this.accountId = null;
  }

  _hashPassword(pwd) {
    return crypto.createHash('sha256').update(pwd).digest('hex');
  }

  _generateTOTP() {
    try {
      const totp = require('node-totp-generator');
      return totp(this.totp);
    } catch (e) {
      return this.credentials.totp || '000000';
    }
  }

  async authenticate() {
    try {
      const hashedPwd = this._hashPassword(this.password);
      const totp = this._generateTOTP();

      const params = new URLSearchParams();
      params.append('jData', JSON.stringify({
        apkversion: 'js:1.0.0',
        uid: this.userId,
        pwd: hashedPwd,
        factor2: totp,
        vc: this.vendorCode,
        appkey: crypto.createHash('sha256').update(`${this.userId}|${this.apiSecret}`).digest('hex'),
        imei: this.imei,
        source: 'API',
      }));

      const res = await axios.post(`${SHOONYA_BASE_URL}/QuickAuth`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });

      if (res.data?.stat === 'Ok') {
        this.sessionToken = res.data.susertoken;
        this.accountId = res.data.actid;
        return { success: true, message: 'Shoonya authenticated', sessionToken: this.sessionToken };
      }
      return { success: false, message: res.data?.emsg || 'Shoonya auth failed' };
    } catch (err) {
      return { success: false, message: `Shoonya auth error: ${err.message}` };
    }
  }

  async _post(endpoint, data) {
    if (!this.sessionToken) {
      const auth = await this.authenticate();
      if (!auth.success) throw new Error(auth.message);
    }
    const params = new URLSearchParams();
    params.append('jData', JSON.stringify({ ...data, uid: this.userId, actid: this.accountId }));
    params.append('jKey', this.sessionToken);
    const res = await axios.post(`${SHOONYA_BASE_URL}/${endpoint}`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });
    return res.data;
  }

  async testConnection() {
    try {
      if (!this.sessionToken) {
        const auth = await this.authenticate();
        if (!auth.success) return { success: false, message: auth.message, profile: null };
      }
      const data = await this._post('UserDetails', {});
      return {
        success: data?.stat === 'Ok',
        message: data?.stat === 'Ok' ? 'Shoonya connection successful' : data?.emsg,
        profile: { userId: this.userId, name: data?.uname || '', accountId: this.accountId },
      };
    } catch (err) {
      return { success: false, message: `Shoonya test failed: ${err.message}`, profile: null };
    }
  }

  async placeOrder(order) {
    try {
      const exchMap = { NSE: 'NSE', BSE: 'BSE', NFO: 'NFO', MCX: 'MCX' };
      const prdMap = { MIS: 'I', NRML: 'M', CNC: 'C' };
      const prcMap = { MARKET: 'MKT', LIMIT: 'LMT', SL: 'SL', 'SL-M': 'SL-MKT' };

      const data = await this._post('PlaceOrder', {
        exch: exchMap[order.exchange] || 'NSE',
        tsym: order.symbol,
        qty: String(order.quantity),
        prc: String(order.price || 0),
        trgprc: String(order.triggerPrice || 0),
        dscqty: '0',
        prd: prdMap[order.productType] || 'I',
        trantype: order.side === 'BUY' ? 'B' : 'S',
        prctyp: prcMap[order.orderType] || 'MKT',
        ret: 'DAY',
        remarks: 'HelloTrader',
      });

      return {
        success: data?.stat === 'Ok',
        orderId: data?.norenordno || null,
        message: data?.stat === 'Ok' ? 'Shoonya order placed' : data?.emsg,
        rawResponse: data,
      };
    } catch (err) {
      return { success: false, orderId: null, message: `Shoonya order failed: ${err.message}`, rawResponse: {} };
    }
  }

  async cancelOrder(orderId) {
    try {
      const data = await this._post('CancelOrder', { norenordno: orderId });
      return { success: data?.stat === 'Ok', message: data?.result || data?.emsg, rawResponse: data };
    } catch (err) {
      return { success: false, message: err.message, rawResponse: {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      const data = await this._post('ModifyOrder', {
        norenordno: orderId,
        prctyp: modifications.orderType || 'LMT',
        prc: String(modifications.price || 0),
        qty: String(modifications.quantity || 0),
        trgprc: String(modifications.triggerPrice || 0),
        ret: 'DAY',
        exch: modifications.exchange || 'NSE',
        tsym: modifications.symbol || '',
      });
      return { success: data?.stat === 'Ok', message: data?.result || data?.emsg, rawResponse: data };
    } catch (err) {
      return { success: false, message: err.message, rawResponse: {} };
    }
  }

  async getOrderStatus(orderId) {
    try {
      const data = await this._post('SingleOrdHist', { norenordno: orderId });
      const last = Array.isArray(data) ? data[data.length - 1] : {};
      return {
        status: last?.status || 'UNKNOWN',
        filledQty: parseInt(last?.fillshares || 0),
        avgPrice: parseFloat(last?.avgprc || 0),
        rawResponse: data,
      };
    } catch (err) {
      return { status: 'ERROR', filledQty: 0, avgPrice: 0, rawResponse: {} };
    }
  }

  async getPositions() {
    try {
      const data = await this._post('PositionBook', {});
      if (!Array.isArray(data)) return [];
      return data.map(p => ({
        symbol: p.tsym,
        side: parseInt(p.netqty) > 0 ? 'BUY' : 'SELL',
        qty: Math.abs(parseInt(p.netqty || 0)),
        avgPrice: parseFloat(p.netavgprc || 0),
        ltp: parseFloat(p.lp || 0),
        pnl: parseFloat(p.urmtom || 0),
        raw: p,
      }));
    } catch (err) { return []; }
  }

  async getHoldings() {
    try {
      const data = await this._post('Holdings', { prd: 'C' });
      if (!Array.isArray(data)) return [];
      return data.map(h => ({
        symbol: h.tsym,
        qty: parseInt(h.holdqty || 0),
        avgPrice: parseFloat(h.upldprc || 0),
        currentValue: parseFloat(h.lp || 0) * parseInt(h.holdqty || 0),
        pnl: parseFloat(h.pnl || 0),
        raw: h,
      }));
    } catch (err) { return []; }
  }

  async getLTP(symbol, exchange) {
    try {
      const data = await this._post('GetQuotes', { exch: exchange, token: symbol });
      return { ltp: parseFloat(data?.lp || 0), symbol };
    } catch (err) { return { ltp: 0, symbol }; }
  }

  async getFunds() {
    try {
      const data = await this._post('Limits', { prd: 'ALL', seg: 'ALL', exch: 'ALL' });
      return {
        available: parseFloat(data?.cash || 0),
        used: parseFloat(data?.marginused || 0),
        total: parseFloat(data?.net || 0),
      };
    } catch (err) { return { available: 0, used: 0, total: 0 }; }
  }
}

module.exports = ShoonyaAdapter;
