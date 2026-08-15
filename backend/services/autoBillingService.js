const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { N } = require('./notifier');

/**
 * Atomic & Idempotent Auto-Billing Engine:
 * Checks user's token balance against current SystemSettings.monthlyCost.
 * If balance >= monthlyCost AND (membership expired OR inactive),
 * automatically deducts exact monthlyCost ONCE, activates premium for 30 days,
 * and unlocks all premium features seamlessly.
 */
async function autoBillUserIfEligible(userId) {
  if (!userId) return { billed: false, reason: 'NO_USER_ID' };

  try {
    // 1. Fetch system configuration (Dynamic Single Source of Truth for monthly cost)
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: { id: 'CONFIG' } });
    }
    const monthlyCost = Number(settings?.monthlyCost || 900);

    // 2. Fetch User & latest membership
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { billed: false, reason: 'USER_NOT_FOUND' };

    // Admin accounts are always active and never billed
    if (user.role === 'ADMIN' || user.email === 'hellotraderinstitute@gmail.com') {
      return { billed: false, reason: 'ADMIN_UNRESTRICTED' };
    }

    const now = new Date();

    // Fetch existing active membership
    const activeMembership = await prisma.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: now }
      },
      orderBy: { expiresAt: 'desc' }
    });

    // If user already has an active membership valid in the future, no immediate billing is needed
    if (activeMembership) {
      return { billed: false, reason: 'MEMBERSHIP_ALREADY_ACTIVE', expiresAt: activeMembership.expiresAt };
    }

    // 3. Perform Atomic Transaction to check token balance and bill idempotently
    const billingResult = await prisma.$transaction(async (tx) => {
      // Calculate token balance inside atomic transaction from Ledger
      const ledgers = await tx.ledger.findMany({
        where: {
          userId,
          walletType: { in: ['TOKEN', 'RECHARGE', 'BONUS'] }
        }
      });
      const tokenBalance = ledgers.reduce((acc, curr) => curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount, 0);

      // Check if user has sufficient tokens for monthly premium cost
      if (tokenBalance < monthlyCost) {
        // Ensure expired membership status is updated in DB if past expiry
        await tx.membership.updateMany({
          where: { userId, status: 'ACTIVE', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' }
        });
        return { billed: false, reason: 'INSUFFICIENT_FUNDS', balance: tokenBalance, required: monthlyCost };
      }

      // Idempotency check: Ensure we haven't already billed for this activation window in the last 60 seconds
      const recentDebit = await tx.ledger.findFirst({
        where: {
          userId,
          walletType: 'TOKEN',
          type: 'DEBIT',
          OR: [
            { reason: { startsWith: 'MEMBERSHIP_AUTO_BILLING' } },
            { reason: { in: ['MEMBERSHIP_ACTIVATION_30_DAYS', 'MEMBERSHIP_AUTORENEW'] } }
          ],
          timestamp: { gte: new Date(Date.now() - 60 * 1000) }
        }
      });

      if (recentDebit) {
        const latestMem = await tx.membership.findFirst({ where: { userId, status: 'ACTIVE' } });
        return { billed: false, reason: 'RECENTLY_BILLED_IDEMPOTENT', expiresAt: latestMem?.expiresAt };
      }

      // Record Atomic Ledger DEBIT Entry for monthly premium cost ONLY
      await tx.ledger.create({
        data: {
          userId,
          walletType: 'TOKEN',
          amount: monthlyCost,
          type: 'DEBIT',
          reason: `MEMBERSHIP_AUTO_BILLING_${monthlyCost}_TOKENS`
        }
      });

      // Activate or Extend Membership for 30 days
      const newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const existingMemRecord = await tx.membership.findFirst({
        where: { userId },
        orderBy: { expiresAt: 'desc' }
      });

      let updatedMem;
      if (existingMemRecord) {
        updatedMem = await tx.membership.update({
          where: { id: existingMemRecord.id },
          data: {
            expiresAt: newExpiry,
            status: 'ACTIVE',
            autoRenew: true
          }
        });
      } else {
        updatedMem = await tx.membership.create({
          data: {
            userId,
            expiresAt: newExpiry,
            status: 'ACTIVE',
            autoRenew: true
          }
        });
      }

      // Update any pending referral if this is first activation
      const pendingReferral = await tx.referral.findFirst({
        where: { referredId: userId, status: 'PENDING' }
      });

      if (pendingReferral) {
        const existingReward = await tx.ledger.findFirst({
          where: {
            userId: pendingReferral.referrerId,
            walletType: 'REFERRAL',
            type: 'CREDIT',
            reason: { contains: userId }
          }
        });

        if (!existingReward) {
          await tx.referral.update({
            where: { id: pendingReferral.id },
            data: { status: 'SUCCESS', successAt: now }
          });

          await tx.ledger.create({
            data: {
              userId: pendingReferral.referrerId,
              walletType: 'REFERRAL',
              amount: settings?.referralReward || 200,
              type: 'CREDIT',
              reason: `REFERRAL_REWARD_${userId}`
            }
          });
        }
      }

      return {
        billed: true,
        cost: monthlyCost,
        newBalance: tokenBalance - monthlyCost,
        expiresAt: newExpiry,
        membership: updatedMem
      };
    });

    if (billingResult.billed) {
      console.log(`[AutoBilling] Successfully auto-billed user ${userId} for ₹${monthlyCost} tokens. Premium active until ${billingResult.expiresAt}`);
      N.membershipActivated({
        studentName: user.name || 'Student',
        studentId: user.studentId || userId,
        durationDays: 30,
        expiresAt: billingResult.expiresAt
      });
    }

    return billingResult;
  } catch (err) {
    console.error(`[AutoBilling Error] User ${userId}:`, err.message);
    return { billed: false, error: err.message };
  }
}

module.exports = { autoBillUserIfEligible };
