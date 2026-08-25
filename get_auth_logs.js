const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const logs = await prisma.auditLog.findMany({
    where: { category: 'AUTH' },
    orderBy: { timestamp: 'desc' }
  });
  console.log(`Found ${logs.length} AUTH logs:`);
  logs.forEach(l => {
    console.log(`User: ${l.userId}, Action: ${l.action}, Time: ${l.timestamp.toISOString()}`);
  });
}

check().then(() => prisma.$disconnect());
