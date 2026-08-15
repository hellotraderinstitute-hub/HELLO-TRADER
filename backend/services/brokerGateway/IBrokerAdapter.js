/**
 * IBrokerAdapter — Abstract Broker Interface
 * All broker adapters MUST implement this interface.
 * This is the contract between the Hello Trader Order Engine and any broker.
 */

class IBrokerAdapter {
  constructor(credentials) {
    if (new.target === IBrokerAdapter) {
      throw new Error('IBrokerAdapter is abstract. Instantiate a concrete adapter.');
    }
    this.credentials = credentials;
    this.brokerName = 'UNKNOWN';
  }

  /**
   * Authenticate with the broker using stored credentials.
   * Must set this.accessToken internally.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async authenticate() {
    throw new Error(`${this.brokerName}.authenticate() not implemented`);
  }

  /**
   * Place a new order.
   * @param {Object} order
   * @param {string} order.symbol       - e.g. "NIFTY25AUG24400CE"
   * @param {string} order.exchange     - e.g. "NSE", "BSE", "NFO"
   * @param {string} order.side         - "BUY" | "SELL"
   * @param {number} order.quantity     - Number of lots/shares
   * @param {string} order.orderType    - "MARKET" | "LIMIT" | "SL" | "SL-M"
   * @param {number} [order.price]      - Required for LIMIT orders
   * @param {number} [order.triggerPrice] - Required for SL/SL-M
   * @param {string} order.productType  - "MIS" | "NRML" | "CNC"
   * @returns {Promise<{success: boolean, orderId: string|null, message: string, rawResponse: Object}>}
   */
  async placeOrder(order) {
    throw new Error(`${this.brokerName}.placeOrder() not implemented`);
  }

  /**
   * Modify an existing order.
   * @param {string} orderId
   * @param {Object} modifications - Partial order fields to update
   * @returns {Promise<{success: boolean, message: string, rawResponse: Object}>}
   */
  async modifyOrder(orderId, modifications) {
    throw new Error(`${this.brokerName}.modifyOrder() not implemented`);
  }

  /**
   * Cancel a pending order.
   * @param {string} orderId
   * @returns {Promise<{success: boolean, message: string, rawResponse: Object}>}
   */
  async cancelOrder(orderId) {
    throw new Error(`${this.brokerName}.cancelOrder() not implemented`);
  }

  /**
   * Get order status.
   * @param {string} orderId
   * @returns {Promise<{status: string, filledQty: number, avgPrice: number, rawResponse: Object}>}
   */
  async getOrderStatus(orderId) {
    throw new Error(`${this.brokerName}.getOrderStatus() not implemented`);
  }

  /**
   * Get all open positions.
   * @returns {Promise<Array<{symbol, side, qty, avgPrice, ltp, pnl}>>}
   */
  async getPositions() {
    throw new Error(`${this.brokerName}.getPositions() not implemented`);
  }

  /**
   * Get all holdings.
   * @returns {Promise<Array<{symbol, qty, avgPrice, currentValue, pnl}>>}
   */
  async getHoldings() {
    throw new Error(`${this.brokerName}.getHoldings() not implemented`);
  }

  /**
   * Get live LTP for a symbol.
   * @param {string} symbol
   * @param {string} exchange
   * @returns {Promise<{ltp: number, symbol: string}>}
   */
  async getLTP(symbol, exchange) {
    throw new Error(`${this.brokerName}.getLTP() not implemented`);
  }

  /**
   * Get account funds/margins.
   * @returns {Promise<{available: number, used: number, total: number}>}
   */
  async getFunds() {
    throw new Error(`${this.brokerName}.getFunds() not implemented`);
  }

  /**
   * Verify connectivity and credentials are valid.
   * @returns {Promise<{success: boolean, message: string, profile: Object}>}
   */
  async testConnection() {
    throw new Error(`${this.brokerName}.testConnection() not implemented`);
  }

  /**
   * Get today's order book from the broker.
   * Used by MasterOrderPoller for Copy Trading source-of-truth detection.
   *
   * @returns {Promise<Array<{
   *   orderId: string,
   *   symbol: string,
   *   exchange: string,
   *   side: string,          // 'BUY' | 'SELL'
   *   totalQty: number,
   *   filledQty: number,
   *   avgPrice: number,
   *   status: string,        // 'PENDING'|'PARTIALLY_FILLED'|'FILLED'|'CANCELLED'|'REJECTED'
   *   productType: string,   // 'MIS'|'NRML'|'CNC'
   *   orderType: string,     // 'MARKET'|'LIMIT'|'SL'|'SL-M'
   *   placedAt: string,      // ISO timestamp
   *   raw: Object            // Full raw broker response
   * }>>}
   */
  async getOrders() {
    // Default stub — brokers that don't implement this return empty array
    // Copy Trading will only work for brokers with a real implementation
    return [];
  }
}

module.exports = IBrokerAdapter;
