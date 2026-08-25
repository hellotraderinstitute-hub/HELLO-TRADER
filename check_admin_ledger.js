const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const admin = await prisma.user.findFirst({
    where: { email: 'hellotraderinstitute@gmail.com' }
  });
  if (admin) {
    const ledgers = await prisma.ledger.findMany({
      where: { userId: admin.id }
    });
    console.log('--- Admin Ledger Entries ---');
    console.log(JSON.stringify(ledgers, null, 2));

    // Calculate balances by walletType
    const balances = {};
    ledgers.forEach(l => {
      const type = l.walletType;
      const amt = l.type === 'CREDIT' ? l.amount : -l.amount;
      balances[type] = (balances[type] || 0) + amt;
    });
    console.log('\n--- Admin Wallet Balances ---');
    console.log(JSON.stringify(balances, null, 2));
  } else {
    console.log('Admin user not found!');
  }
}

check().then(() => prisma.$disconnect());
