/**
 * partnerService.js — Hello Trader Partner Management & Benefit Engine
 * 
 * Source of Truth:
 * - Partner IDs start sequentially from PHT0036 without duplicates.
 * - ₹200 fixed benefit for every referred client who successfully purchases a qualifying Terminal subscription.
 * - Referral click/signup alone = ₹0 benefit (attribution status PENDING).
 * - Automatic calculation: successful qualifying subscriptions × ₹200.
 * - Partner Dashboard is strictly read-only for figures.
 * - Deactivated partners cannot access portal or receive new attributions, but historical benefits remain permanently recorded.
 * - Client privacy: Partners see Client ID (Student ID) only.
 */

'use strict';

const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const defaultPrisma = new PrismaClient();

/**
 * Safely generate the next sequential Partner ID starting from PHT0036.
 * Format: PHT0036, PHT0037, PHT0038, ...
 * @param {Object} [customPrisma]
 * @returns {Promise<string>}
 */
async function getNextPartnerId(customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;

  const partners = await prisma.partner.findMany({
    select: { partnerId: true }
  });

  let maxNum = 35; // Default so that first partner becomes PHT0036 (35 + 1)
  const regex = /^PHT(\d+)$/i;

  partners.forEach(p => {
    const match = regex.exec(p.partnerId);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  let nextNum = maxNum + 1;
  let candidateId = `PHT${String(nextNum).padStart(4, '0')}`;

  // Collision safety guard
  let exists = await prisma.partner.findUnique({ where: { partnerId: candidateId } });
  while (exists) {
    nextNum++;
    candidateId = `PHT${String(nextNum).padStart(4, '0')}`;
    exists = await prisma.partner.findUnique({ where: { partnerId: candidateId } });
  }

  return candidateId;
}

/**
 * Admin creates a new partner with auto-generated PHT0036+ ID.
 */
async function createPartner(data, adminUser = null, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;
  const { name, email, phone, password, referralCode } = data;

  if (!name || !email || !phone) {
    throw new Error('Partner Name, Gmail ID, and Mobile Number are required.');
  }

  // Check unique email and phone
  const existingEmail = await prisma.partner.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existingEmail) throw new Error('A partner with this Gmail ID already exists.');

  const existingPhone = await prisma.partner.findUnique({ where: { phone: phone.trim() } });
  if (existingPhone) throw new Error('A partner with this Mobile Number already exists.');

  const partnerId = await getNextPartnerId(prisma);
  const effectiveRefCode = (referralCode || partnerId).trim().toUpperCase();

  // Check unique referralCode across Partners and Users
  const existingRefPartner = await prisma.partner.findUnique({ where: { referralCode: effectiveRefCode } });
  if (existingRefPartner) throw new Error(`Referral code '${effectiveRefCode}' is already in use by another partner.`);

  const existingRefUser = await prisma.user.findUnique({ where: { referralCode: effectiveRefCode } });
  if (existingRefUser) throw new Error(`Referral code '${effectiveRefCode}' is already in use by an existing student.`);

  const effectivePassword = password || `PHT@${Math.floor(1000 + Math.random() * 9000)}`;
  const passwordHash = await bcrypt.hash(effectivePassword, 10);

  const newPartner = await prisma.partner.create({
    data: {
      partnerId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password: passwordHash,
      referralCode: effectiveRefCode,
      status: 'ACTIVE'
    }
  });

  // Log Immutable Audit History
  await prisma.partnerAuditLog.create({
    data: {
      partnerId: newPartner.id,
      adminId: adminUser?.id || 'SUPER_ADMIN',
      action: 'PARTNER_CREATED',
      newValue: JSON.stringify({ partnerId: newPartner.partnerId, name: newPartner.name, email: newPartner.email }),
      detail: `Partner created with ID ${newPartner.partnerId} and referral code ${newPartner.referralCode}`
    }
  });

  return {
    partner: newPartner,
    tempPassword: effectivePassword
  };
}

/**
 * Admin updates partner status (ACTIVE, INACTIVE, SUSPENDED).
 */
async function updatePartnerStatus(partnerId, newStatus, reason = '', adminUser = null, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;
  const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status '${newStatus}'. Must be one of: ${validStatuses.join(', ')}`);
  }

  const partner = await prisma.partner.findFirst({
    where: { OR: [{ id: partnerId }, { partnerId }] }
  });

  if (!partner) throw new Error('Partner not found.');

  const oldStatus = partner.status;
  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: { status: newStatus }
  });

  await prisma.partnerAuditLog.create({
    data: {
      partnerId: partner.id,
      adminId: adminUser?.id || 'SUPER_ADMIN',
      action: 'STATUS_CHANGED',
      oldValue: oldStatus,
      newValue: newStatus,
      detail: reason || `Partner status changed from ${oldStatus} to ${newStatus}`
    }
  });

  return updated;
}

/**
 * Records a client attribution at signup approval if referral code belongs to an ACTIVE partner.
 * Benefit awarded at this stage is strictly ₹0 (status = PENDING).
 */
async function recordPartnerAttribution({ userId, studentId, referralCode }, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;
  if (!referralCode) return null;

  const partner = await prisma.partner.findFirst({
    where: { referralCode: referralCode.trim().toUpperCase() }
  });

  if (!partner) return null; // Not a partner referral code

  // Deactivated partner guard: cannot receive new attribution
  if (partner.status !== 'ACTIVE') {
    await prisma.partnerAuditLog.create({
      data: {
        partnerId: partner.id,
        action: 'ATTRIBUTION_REJECTED_INACTIVE',
        detail: `Signup attribution attempt for Client ${studentId} rejected because partner status is ${partner.status}`
      }
    });
    return null;
  }

  // Create PENDING attribution (₹0 benefit until qualifying subscription)
  const attribution = await prisma.partnerClientAttribution.create({
    data: {
      partnerId: partner.id,
      userId,
      studentId,
      referralCode: partner.referralCode,
      status: 'PENDING'
    }
  });

  return attribution;
}

/**
 * Qualifies a ₹200 fixed benefit when an attributed client's recharge/subscription is approved.
 */
async function qualifyPartnerBenefit({ userId, paymentReqId }, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;

  const attribution = await prisma.partnerClientAttribution.findUnique({
    where: { userId },
    include: { partner: true }
  });

  if (!attribution || attribution.status === 'SUCCESS') {
    return null; // No attribution or already qualified
  }

  // Mark Attribution as SUCCESS
  const updatedAttribution = await prisma.partnerClientAttribution.update({
    where: { id: attribution.id },
    data: {
      status: 'SUCCESS',
      successAt: new Date()
    }
  });

  // Create Fixed ₹200 Benefit Ledger Entry
  const benefitLedger = await prisma.partnerBenefitLedger.create({
    data: {
      partnerId: attribution.partnerId,
      attributionId: attribution.id,
      clientStudentId: attribution.studentId,
      paymentReqId: paymentReqId || null,
      amount: 200, // Fixed ₹200 benefit
      payoutStatus: 'PENDING'
    }
  });

  // Log Immutable Audit Trail
  await prisma.partnerAuditLog.create({
    data: {
      partnerId: attribution.partnerId,
      action: 'BENEFIT_EARNED',
      newValue: JSON.stringify({ amount: 200, clientStudentId: attribution.studentId }),
      detail: `₹200 fixed benefit earned for qualifying subscription by Client ${attribution.studentId}`
    }
  });

  return { attribution: updatedAttribution, benefitLedger };
}

/**
 * Reverses a partner benefit if an approved recharge payment is reversed by Admin.
 */
async function reversePartnerBenefit({ userId, paymentReqId }, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;

  const attribution = await prisma.partnerClientAttribution.findUnique({
    where: { userId }
  });

  if (!attribution || attribution.status !== 'SUCCESS') return null;

  // Revert attribution status back to PENDING
  await prisma.partnerClientAttribution.update({
    where: { id: attribution.id },
    data: { status: 'PENDING' }
  });

  // Revert or delete benefit ledger entry
  await prisma.partnerBenefitLedger.deleteMany({
    where: {
      attributionId: attribution.id,
      payoutStatus: 'PENDING'
    }
  });

  await prisma.partnerAuditLog.create({
    data: {
      partnerId: attribution.partnerId,
      action: 'BENEFIT_REVERSED',
      detail: `Benefit reversed for Client ${attribution.studentId} due to payment reversal`
    }
  });

  return true;
}

/**
 * Fetches comprehensive Partner Dashboard analytics with strict client privacy.
 */
async function getPartnerDashboardStats(partnerIdOrUuid, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;

  const partner = await prisma.partner.findFirst({
    where: { OR: [{ id: partnerIdOrUuid }, { partnerId: partnerIdOrUuid }] },
    include: {
      attributions: {
        orderBy: { createdAt: 'desc' }
      },
      benefitLedgers: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!partner) throw new Error('Partner not found');

  const totalReferrals = partner.attributions.length;
  const successfulSubscriptions = partner.attributions.filter(a => a.status === 'SUCCESS').length;
  const pendingReferrals = partner.attributions.filter(a => a.status === 'PENDING').length;

  const totalBenefit = successfulSubscriptions * 200;
  const paidBenefit = partner.benefitLedgers
    .filter(b => b.payoutStatus === 'PAID')
    .reduce((acc, b) => acc + b.amount, 0);
  const pendingBenefit = Math.max(0, totalBenefit - paidBenefit);

  // Time-based calculations (This Month vs Last Month)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const startOfThisMonth = new Date(currentYear, currentMonth, 1);
  const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
  const endOfLastMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  const thisMonthSubscriptions = partner.attributions.filter(a =>
    a.status === 'SUCCESS' && a.successAt && new Date(a.successAt) >= startOfThisMonth
  ).length;
  const thisMonthBenefit = thisMonthSubscriptions * 200;

  const lastMonthSubscriptions = partner.attributions.filter(a =>
    a.status === 'SUCCESS' && a.successAt &&
    new Date(a.successAt) >= startOfLastMonth && new Date(a.successAt) <= endOfLastMonth
  ).length;
  const lastMonthBenefit = lastMonthSubscriptions * 200;

  // Month-Wise Aggregated Business Breakdown
  const monthMap = {};
  partner.attributions.forEach(a => {
    const d = new Date(a.createdAt);
    const mKey = `${d.toLocaleString('en-IN', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
    if (!monthMap[mKey]) {
      monthMap[mKey] = { month: mKey, date: new Date(d.getFullYear(), d.getMonth(), 1), referrals: 0, successfulSubscriptions: 0, benefit: 0 };
    }
    monthMap[mKey].referrals += 1;
  });

  partner.attributions.filter(a => a.status === 'SUCCESS').forEach(a => {
    const d = new Date(a.successAt || a.createdAt);
    const mKey = `${d.toLocaleString('en-IN', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
    if (!monthMap[mKey]) {
      monthMap[mKey] = { month: mKey, date: new Date(d.getFullYear(), d.getMonth(), 1), referrals: 0, successfulSubscriptions: 0, benefit: 0 };
    }
    monthMap[mKey].successfulSubscriptions += 1;
    monthMap[mKey].benefit += 200;
  });

  const monthWiseReport = Object.values(monthMap)
    .sort((a, b) => b.date - a.date)
    .map(({ date, ...rest }) => rest);

  // Client Referral List (PRIVACY PROTECTED: Client ID / Student ID Only)
  const referredClients = partner.attributions.map(a => {
    const ledgerEntry = partner.benefitLedgers.find(b => b.attributionId === a.id);
    return {
      id: a.id,
      clientId: a.studentId, // Snapshot of Student ID (e.g. HT0786)
      signupDate: a.createdAt,
      subscriptionDate: a.successAt || null,
      subscriptionStatus: a.status === 'SUCCESS' ? 'ACTIVE' : 'PENDING',
      benefitAmount: a.status === 'SUCCESS' ? 200 : 0,
      benefitStatus: a.status === 'SUCCESS' ? (ledgerEntry?.payoutStatus === 'PAID' ? 'PAID' : 'EARNED') : 'PENDING',
      payoutStatus: ledgerEntry?.payoutStatus || 'PENDING'
    };
  });

  return {
    partner: {
      id: partner.id,
      partnerId: partner.partnerId,
      name: partner.name,
      email: partner.email,
      phone: partner.phone,
      referralCode: partner.referralCode,
      status: partner.status,
      createdAt: partner.createdAt
    },
    metrics: {
      totalReferrals,
      successfulSubscriptions,
      pendingReferrals,
      thisMonthBenefit,
      thisMonthSubscriptions,
      lastMonthBenefit,
      lastMonthSubscriptions,
      totalBenefit,
      pendingBenefit,
      paidBenefit
    },
    monthWiseReport,
    referredClients
  };
}

/**
 * Admin view of all partners with comprehensive metrics and payout controls.
 */
async function getAdminPartnersOverview(customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;

  const partners = await prisma.partner.findMany({
    include: {
      attributions: true,
      benefitLedgers: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const partnerList = partners.map(p => {
    const totalReferrals = p.attributions.length;
    const successfulSubscriptions = p.attributions.filter(a => a.status === 'SUCCESS').length;
    const pendingReferrals = p.attributions.filter(a => a.status === 'PENDING').length;
    const totalBenefit = successfulSubscriptions * 200;
    const paidBenefit = p.benefitLedgers.filter(b => b.payoutStatus === 'PAID').reduce((acc, b) => acc + b.amount, 0);
    const pendingBenefit = Math.max(0, totalBenefit - paidBenefit);

    return {
      id: p.id,
      partnerId: p.partnerId,
      name: p.name,
      email: p.email,
      phone: p.phone,
      referralCode: p.referralCode,
      status: p.status,
      createdAt: p.createdAt,
      totalReferrals,
      successfulSubscriptions,
      pendingReferrals,
      totalBenefit,
      paidBenefit,
      pendingBenefit
    };
  });

  const totals = {
    totalPartners: partnerList.length,
    activePartners: partnerList.filter(p => p.status === 'ACTIVE').length,
    inactivePartners: partnerList.filter(p => p.status !== 'ACTIVE').length,
    totalSubscriptions: partnerList.reduce((acc, p) => acc + p.successfulSubscriptions, 0),
    totalBenefitEarned: partnerList.reduce((acc, p) => acc + p.totalBenefit, 0),
    totalBenefitPaid: partnerList.reduce((acc, p) => acc + p.paidBenefit, 0),
    totalBenefitPending: partnerList.reduce((acc, p) => acc + p.pendingBenefit, 0)
  };

  return { totals, partners: partnerList };
}

/**
 * Admin marks partner benefits as PAID with UTR / bank reference.
 */
async function markPartnerBenefitsPaid({ partnerId, benefitIds, payoutReference }, adminUser = null, customPrisma = null) {
  const prisma = customPrisma || defaultPrisma;

  const whereClause = {
    partnerId,
    payoutStatus: 'PENDING'
  };

  if (benefitIds && Array.isArray(benefitIds) && benefitIds.length > 0) {
    whereClause.id = { in: benefitIds };
  }

  const updated = await prisma.partnerBenefitLedger.updateMany({
    where: whereClause,
    data: {
      payoutStatus: 'PAID',
      paidAt: new Date(),
      payoutReference: payoutReference || 'Admin Payout',
      payoutAdminId: adminUser?.id || 'SUPER_ADMIN'
    }
  });

  await prisma.partnerAuditLog.create({
    data: {
      partnerId,
      adminId: adminUser?.id || 'SUPER_ADMIN',
      action: 'BENEFIT_PAID',
      detail: `Marked ${updated.count} benefit records as PAID with reference '${payoutReference || 'Admin Payout'}'`
    }
  });

  return updated;
}

module.exports = {
  getNextPartnerId,
  createPartner,
  updatePartnerStatus,
  recordPartnerAttribution,
  qualifyPartnerBenefit,
  reversePartnerBenefit,
  getPartnerDashboardStats,
  getAdminPartnersOverview,
  markPartnerBenefitsPaid
};
