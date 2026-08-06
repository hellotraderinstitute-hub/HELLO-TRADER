const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const runScheduler = async () => {
  console.log('[Scheduler] Running 1-minute cron check...');
  try {
    // Fetch global settings
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    if (!settings) return;

    // 1. Check expired active memberships
    const now = new Date();
    const expiredMemberships = await prisma.membership.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now }
      },
      include: { user: true }
    });

    for (const membership of expiredMemberships) {
      if (membership.autoRenew && settings.autoRenewal) {
        // Calculate Token Balance from Ledger
        const ledgers = await prisma.ledger.findMany({
          where: { userId: membership.userId, walletType: 'TOKEN' }
        });
        
        const balance = ledgers.reduce((acc, curr) => {
          return curr.type === 'CREDIT' ? acc + curr.amount : acc - curr.amount;
        }, 0);

        if (balance >= settings.monthlyCost) {
          // Deduct tokens via Ledger
          await prisma.ledger.create({
            data: {
              userId: membership.userId,
              walletType: 'TOKEN',
              amount: settings.monthlyCost,
              type: 'DEBIT',
              reason: 'MEMBERSHIP_AUTORENEW'
            }
          });

          // Extend membership
          await prisma.membership.update({
            where: { id: membership.id },
            data: { expiresAt: new Date(now.getTime() + settings.membershipDuration * 24 * 60 * 60 * 1000) }
          });
          console.log(`[Scheduler] Auto-renewed membership for user ${membership.userId}`);
        } else {
          // Expire membership
          await prisma.membership.update({
            where: { id: membership.id },
            data: { status: 'EXPIRED' }
          });
          console.log(`[Scheduler] Expired membership for user ${membership.userId} (Insufficient Funds)`);
        }
      } else {
        // Expire membership
        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: 'EXPIRED' }
        });
        console.log(`[Scheduler] Expired membership for user ${membership.userId} (Auto-Renew OFF)`);
      }
    }

  } catch (err) {
    console.error('[Scheduler] Error:', err);
  }
};

// Run every 1 minute
setInterval(runScheduler, 60 * 1000);
runScheduler(); // Run once on startup

console.log('[Scheduler] 1-minute background cron initialized.');
module.exports = { runScheduler };
