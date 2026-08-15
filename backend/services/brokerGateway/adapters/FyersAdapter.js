/**
 * FyersAdapter — Hello Trader Broker Adapter for Fyers
 * API Docs: https://myapi.fyers.in/docsv3
 * OAuth2 based. Access token is pre-obtained.
 * Implements IBrokerAdapter
 */

const axios = require('axios');
const IBrokerAdapter = require('../IBrokerAdapter');

const FYERS_BASE_URL = 'https://api-t1.fyers.in/api/v3';
const FYERS_DATA_URL = 'https://api-t2.fyers.in/data';

class FyersAdapter extends IBrokerAdapter {
  constructor(credentials) {
    super(credentials);
    this.brokerName = 'FYERS';
    this.appId = credentials.apiKey;        // Fyers App ID
    this.accessToken = credentials.accessToken; // format: "AppId:Token"
    this.clientId = credentials.clientId;
  }

  _authToken() {
    // Fyers uses AppId:AccessToken format
    if (this.accessToken && !this.accessToken.includes(':')) {
      return `${this.appId}:${this.accessToken}`;
    }
    return this.accessToken;
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': this._authToken(),
    };
  }

  async authenticate() {
    if (this.accessToken) return { success: true, message: 'Fyers uses OAuth2 pre-issued access tokens' };
    return { success: false, message: 'Fyers requires OAuth2 authorization. Please reconnect.' };
  }

  async testConnection() {
    try {
      const res = await axios.get(`${FYERS_BASE_URL}/profile`, {
        headers: this._headers(), timeout: 8000
      });
      if (res.data?.code === 200 && res.data?.s === 'ok') {
        return {
          success: true,
          message: 'Fyers connection successful',
          profile: {
            name: res.data.data?.name,
            fyersId: res.data.data?.fy_id,
            email: res.data.data?.email_id,
          }
        };
      }
      return { success: false, message: res.data?.message || 'Fyers profile failed', profile: null };
    } catch (err) {
      return { success: false, message: `Fyers test failed: ${err.response?.data?.message || err.message}`, profile: null };
    }
  }

  async placeOrder(order) {
    try {
      const sideMap = { BUY: 1, SELL: -1 };
      const typeMap = { MARKET: 2, LIMIT: 1, SL: 4, 'SL-M': 3 };
      const prodMap = { MIS: 'INTRADAY', NRML: 'MARGIN', CNC: 'CNC' };

      const body = {
        symbol: `${order.exchange}:${order.symbol}-EQ`,
        qty: order.quantity,
        type: typeMap[order.orderType] || 2,
        side: sideMap[order.side] || 1,
        productType: prodMap[order.productType] || 'INTRADAY',
        limitPrice: order.price || 0,
        stopPrice: order.triggerPrice || 0,
        validity: 'DAY',
        disclosedQty: 0,
        offlineOrder: false,
      };

      const res = await axios.post(`${FYERS_BASE_URL}/orders/sync`, body, {
        headers: this._headers(), timeout: 10000
      });

      return {
        success: res.data?.s === 'ok',
        orderId: res.data?.id || null,
        message: res.data?.message || 'Fyers order placed',
        rawResponse: res.data,
      };
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      return { success: false, orderId: null, message: `Fyers order failed: ${msg}`, rawResponse: err.response?.data || {} };
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      const typeMap = { MARKET: 2, LIMIT: 1, SL: 4, 'SL-M': 3 };
      const body = {
        id: orderId,
        type: typeMap[modifications.orderType] || 1,
        qty: modifications.quantity,
        limitPrice: modifications.price || 0,
        stopPrice: modifications.triggerPrice || 0,
      };
      const res = await axios.patch(`${FYERS_BASE_URL}/orders/sync`, body, {
        headers: this._headers(), timeout: 10000
      });
      return { success: res.data?.s === 'ok', message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message, rawResponse: {} };
    }
  }

  async cancelOrder(orderId) {
    try {
      const res = await axios.delete(`${FYERS_BASE_URL}/orders/sync`, {
        headers: this._headers(), data: { id: orderId }, timeout: 10000
      });
      return { success: res.data?.s === 'ok', message: res.data?.message, rawResponse: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message, rawResponse: {} };
    }
  }

  async getOrderStatus(orderId) {
    try {
      const res = await axios.get(`${FYERS_BASE_URL}/orders?id=${orderId}`, {
        headers: this._headers(), timeout: 8000
      });
      const d = res.data?.orderBook?.[0];
      const statusMap = { 2: 'EXECUTED', 5: 'REJECTED', 6: 'CANCELLED', 1: 'TRANSIT' };
      return {
        status: statusMap[d?.status] || 'PENDING',
        filledQty: d?.filledQty || 0,
        avgPrice: d?.tradedPrice || 0,
        rawResponse: d,
      };
    } catch (err) {
      return { status: 'ERROR', filledQty: 0, avgPrice: 0, rawResponse: {} };
    }
  }

  async getPositions() {
    try {
      const res = await axios.get(`${FYERS_BASE_URL}/positions`, {
        headers: this._headers(), timeout: 8000
      });
      return (res.data?.netPositions || []).map(p => ({
        symbol: p.symbol,
        side: (p.netQty || 0) > 0 ? 'BUY' : 'SELL',
        qty: Math.abs(p.netQty || 0),
        avgPrice: p.netAvg || 0,
        ltp: p.ltp || 0,
        pnl: p.unrealizedProfit || 0,
        raw: p,
      }));
    } catch (err) { return []; }
  }

  async getHoldings() {
    try {
      const res = await axios.get(`${FYERS_BASE_URL}/holdings`, {
        headers: this._headers(), timeout: 8000
      });
      return (res.data?.holdings || []).map(h => ({
        symbol: h.symbol,
        qty: h.quantity || 0,
        avgPrice: h.costPrice || 0,
        currentValue: (h.ltp || 0) * (h.quantity || 0),
        pnl: h.pl || 0,
        raw: h,
      }));
    } catch (err) { return []; }
  }

  async getLTP(symbol, exchange) {
    try {
      const fyersSymbol = `${exchange}:${symbol}-EQ`;
      const res = await axios.get(`${FYERS_DATA_URL}/quotes?symbols=${encodeURIComponent(fyersSymbol)}`, {
        headers: this._headers(), timeout: 8000
      });
      const ltp = res.data?.d?.[0]?.v?.lp || 0;
      return { ltp, symbol };
    } catch (err) { return { ltp: 0, symbol }; }
  }

  async getFunds() {
    try {
      const res = await axios.get(`${FYERS_BASE_URL}/funds`, {
        headers: this._headers(), timeout: 8000
      });
      const equity = (res.data?.fund_limit || []).find(f => f.title === 'Total Balance');
      return {
        available: equity?.equityAmount || 0,
        used: 0,
        total: equity?.equityAmount || 0,
      };
    } catch (err) { return { available: 0, used: 0, total: 0 }; }
  }
}

module.exports = FyersAdapter;
