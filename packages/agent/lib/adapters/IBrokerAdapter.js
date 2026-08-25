const axios = require('axios');
const { ProxyTransportFactory } = require('../network/ProxyTransportFactory');

class IBrokerAdapter {
  constructor(credentials = {}, options = {}) {
    this.credentials = credentials;
    this.options = options;
    this.isMock = !!options.isMock;
    this.brokerName = 'BASE';
    this.connected = false;
    this.session = null;
    this.proxyConfig = options.proxyConfig || {
      connectionType: options.connectionType || (options.staticIp ? 'DIRECT_IP' : 'DIRECT_IP'),
      ipAddress: options.staticIp || options.localAddress || null,
      proxyHost: options.proxyHost,
      proxyPort: options.proxyPort,
      proxyUsername: options.proxyUsername,
      proxyPassword: options.proxyPassword,
    };

    const { httpsAgent, httpAgent } = ProxyTransportFactory.createAgents(this.proxyConfig);
    this.httpsAgent = httpsAgent;
    this.httpAgent = httpAgent;
  }

  /**
   * Returns an Axios instance configured with client-specific proxy / direct IP transport
   */
  getHttpClient(customConfig = {}) {
    return axios.create({
      httpsAgent: this.httpsAgent,
      httpAgent: this.httpAgent,
      timeout: 10000,
      ...customConfig,
    });
  }

  /**
   * Connect / Authenticate with the broker API
   * @returns {Promise<{ success: boolean, message: string, session?: object }>}
   */
  async connect() {
    throw new Error('Method connect() must be implemented.');
  }

  /**
   * Disconnect / Invalidate session
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async disconnect() {
    throw new Error('Method disconnect() must be implemented.');
  }

  /**
   * Check connection health / API status
   * @returns {Promise<{ success: boolean, latencyMs?: number, profile?: object, message?: string }>}
   */
  async healthCheck() {
    throw new Error('Method healthCheck() must be implemented.');
  }

  /**
   * Place an order
   * @param {object} order - Normalized order request
   * @returns {Promise<{ success: boolean, orderId: string, status: string, filledQty?: number, avgPrice?: number, message: string, rawResponse?: object }>}
   */
  async placeOrder(order) {
    throw new Error('Method placeOrder() must be implemented.');
  }

  /**
   * Modify an existing order
   * @param {string} orderId
   * @param {object} modifications
   * @returns {Promise<{ success: boolean, message: string, rawResponse?: object }>}
   */
  async modifyOrder(orderId, modifications) {
    throw new Error('Method modifyOrder() must be implemented.');
  }

  /**
   * Cancel an open order
   * @param {string} orderId
   * @returns {Promise<{ success: boolean, message: string, rawResponse?: object }>}
   */
  async cancelOrder(orderId) {
    throw new Error('Method cancelOrder() must be implemented.');
  }

  /**
   * Get live order status
   * @param {string} orderId
   * @returns {Promise<{ success: boolean, status: string, filledQty: number, avgPrice: number, message?: string }>}
   */
  async getOrderStatus(orderId) {
    throw new Error('Method getOrderStatus() must be implemented.');
  }

  /**
   * Fetch open positions
   * @returns {Promise<{ success: boolean, positions: Array<object>, message?: string }>}
   */
  async getPositions() {
    throw new Error('Method getPositions() must be implemented.');
  }

  /**
   * Fetch account fund limits
   * @returns {Promise<{ success: boolean, availableCash: number, collateral: number, utilized: number }>}
   */
  async getFunds() {
    throw new Error('Method getFunds() must be implemented.');
  }

  /**
   * Fetch live quote / LTP
   * @param {string} symbol
   * @param {string} exchange
   * @returns {Promise<{ success: boolean, ltp: number, volume?: number, timestamp?: string }>}
   */
  async getQuote(symbol, exchange) {
    throw new Error('Method getQuote() must be implemented.');
  }

  /**
   * Logout from broker
   */
  async logout() {
    return this.disconnect();
  }
}

module.exports = IBrokerAdapter;
