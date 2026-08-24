let agentLib;
try {
  agentLib = require('../../../packages/agent/lib/compliance/ControlledLivePilotGate');
} catch (_) {
  try {
    agentLib = require('../../packages/agent/lib/compliance/ControlledLivePilotGate');
  } catch (e) {
    agentLib = require('../../../../packages/agent/lib/compliance/ControlledLivePilotGate');
  }
}

const { LOT_SIZES, PILOT_AUTHORIZED_CLIENT, ControlledLivePilotGate, UserTradingGate } = agentLib;

module.exports = {
  ControlledLivePilotGate,
  UserTradingGate: UserTradingGate || ControlledLivePilotGate,
  PILOT_AUTHORIZED_CLIENT,
  LOT_SIZES,
};
