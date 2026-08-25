const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const ledgers = await prisma.ledger.findMany({
    where: { reason: { contains: 'REFERRAL_REWARD' } }
  });
  console.log('=== ALL REFERRAL REWARDS IN LEDGER ===');
  console.log(JSON.stringify(ledgers, null, 2));

  const referrals = await prisma.referral.findMany();
  console.log('\n=== ALL REFERRAL RECORDS ===');
  console.log(JSON.stringify(referrals, null, 2));
}

check().then(() => prisma.$disconnect());
