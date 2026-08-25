const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('=== TRACING REFERRALS FOR HT0802 ===');

  const user = await prisma.user.findFirst({
    where: { studentId: 'HT0802' }
  });
  if (!user) {
    console.log('User HT0802 not found.');
    return;
  }

  // Find all referrals where referredId is user.id
  const referrals = await prisma.referral.findMany({
    where: { referredId: user.id }
  });
  console.log('Referrals where HT0802 is referred:');
  console.log(JSON.stringify(referrals, null, 2));

  // Find all ledgers for this user's referrer (ADMINREF or whatever referrerId is)
  if (referrals.length > 0) {
    const ref = referrals[0];
    const referrerLedgers = await prisma.ledger.findMany({
      where: { userId: ref.referrerId }
    });
    console.log('\nReferrer Ledger Entries:');
    console.log(JSON.stringify(referrerLedgers, null, 2));
  }

  // Let's search the database Ledger table for any entry containing the reason 'nituojha410@gmail.com'
  const matchingLedgers = await prisma.ledger.findMany({
    where: { reason: { contains: 'nituojha410@gmail.com' } }
  });
  console.log('\nMatching Ledger entries for email:');
  console.log(JSON.stringify(matchingLedgers, null, 2));
}

check().then(() => prisma.$disconnect());
