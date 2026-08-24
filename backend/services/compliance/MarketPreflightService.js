let preflightLib;
try {
  preflightLib = require('../../../packages/agent/lib/compliance/MarketPreflightService');
} catch (_) {
  try {
    preflightLib = require('../../packages/agent/lib/compliance/MarketPreflightService');
  } catch (e) {
    preflightLib = require('../../../../packages/agent/lib/compliance/MarketPreflightService');
  }
}

const {
  MarketPreflightService,
  getISTDateString,
  isISTWeekend,
  preflightCache,
} = preflightLib;

module.exports = {
  MarketPreflightService,
  getISTDateString,
  isISTWeekend,
  preflightCache,
};
