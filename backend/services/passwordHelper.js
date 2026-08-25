/**
 * passwordHelper.js — Admin Master Password Generation & Verification Helpers
 */
'use strict';

/**
 * Generate the Admin Master Password string from a user's registration timestamp (createdAt).
 * Must exactly match the formatting shown in the Admin Portal formatIST helper.
 * @param {Date|string} createdAt - The user's registration timestamp
 * @returns {string} The formatted master password
 */
function getAdminMasterPassword(createdAt) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  
  const dStr = d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  
  const tStr = d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  
  return `${dStr} at ${tStr}`;
}

/**
 * Verify if the input password matches the calculated Admin Master Password exactly.
 * @param {string} inputPassword - The password supplied by the admin/support agent
 * @param {Date|string} userCreatedAt - The user's registration timestamp
 * @returns {boolean} True if they match exactly
 */
function verifyAdminMasterPassword(inputPassword, userCreatedAt) {
  if (!inputPassword || !userCreatedAt) return false;
  const calculated = getAdminMasterPassword(userCreatedAt);
  return inputPassword === calculated;
}

module.exports = {
  getAdminMasterPassword,
  verifyAdminMasterPassword
};
