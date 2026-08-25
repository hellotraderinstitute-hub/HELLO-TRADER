const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('=== AUDIT LOGS FOR HT0802 / NITU ===');
  // Find all audit logs containing 'HT0802' or 'nituojha' or 'bf3af5b4-3e3e-44b3-a1e4-e77bb2bb74a9'
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { detail: { contains: 'HT0802' } },
        { detail: { contains: 'nituojha' } },
        { userId: 'bf3af5b4-3e3e-44b3-a1e4-e77bb2bb74a9' }
      ]
    },
    orderBy: { timestamp: 'desc' },
    take: 50
  });
  console.log(JSON.stringify(logs, null, 2));
}

check().then(() => prisma.$disconnect());
