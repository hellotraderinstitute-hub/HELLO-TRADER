/**
 * IVpsProvider.js — Abstract Base Class for Cloud / VPS Providers
 *
 * Defines standard cloud infrastructure contracts for provisioning, reserved static IP allocation,
 * assignment, lifecycle management, and safe retention.
 */

class IVpsProvider {
  /**
   * Provision a new virtual machine instance
   * @param {object} options - { name, region, size, image, userData, tags }
   * @returns {Promise<{ instanceId: string, name: string, status: string, privateIp: string, publicIp: string }>}
   */
  async createServer(options = {}) {
    throw new Error('Method "createServer" must be implemented by concrete VPS provider.');
  }

  /**
   * Allocate a new dedicated Floating / Reserved IPv4 address
   * @param {string} region - Datacenter region (e.g. "blr1", "bom1")
   * @returns {Promise<{ reservedIpId: string, ip: string, region: string }>}
   */
  async allocateReservedIp(region = 'blr1') {
    throw new Error('Method "allocateReservedIp" must be implemented by concrete VPS provider.');
  }

  /**
   * Assign a Reserved IPv4 address to a specific server instance
   * @param {string} ip - Reserved IPv4 address string
   * @param {string} instanceId - Compute instance ID
   * @returns {Promise<{ success: boolean, actionId: string, status: string }>}
   */
  async assignReservedIp(ip, instanceId) {
    throw new Error('Method "assignReservedIp" must be implemented by concrete VPS provider.');
  }

  /**
   * Retrieve server health, status, and network configuration
   * @param {string} instanceId
   * @returns {Promise<{ instanceId: string, status: string, memoryMb: number, vcpus: number, publicIp: string }>}
   */
  async getServerStatus(instanceId) {
    throw new Error('Method "getServerStatus" must be implemented by concrete VPS provider.');
  }

  /**
   * Reboot a compute instance (Must preserve attached Reserved IP)
   * @param {string} instanceId
   * @returns {Promise<{ success: boolean, actionId: string }>}
   */
  async rebootServer(instanceId) {
    throw new Error('Method "rebootServer" must be implemented by concrete VPS provider.');
  }

  /**
   * Delete compute instance (Must NOT delete unassigned Reserved IP)
   * @param {string} instanceId
   * @returns {Promise<{ success: boolean }>}
   */
  async deleteServer(instanceId) {
    throw new Error('Method "deleteServer" must be implemented by concrete VPS provider.');
  }

  /**
   * Release Reserved IPv4 back to cloud pool
   * (Strict: Gated by 7-day retention grace period & audit log)
   * @param {string} ip
   * @returns {Promise<{ success: boolean }>}
   */
  async releaseReservedIp(ip) {
    throw new Error('Method "releaseReservedIp" must be implemented by concrete VPS provider.');
  }
}

module.exports = {
  IVpsProvider,
};
