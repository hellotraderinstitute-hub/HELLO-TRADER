require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const conns = await prisma.algoBrokerConnection.findMany({
    select: { id: true, broker: true, displayName: true, webhookToken: true, isActive: true, testStatus: true, connectedAt: true }
  });
  console.log('ACTIVE CONNECTIONS IN DB:');
  console.log(JSON.stringify(conns, null, 2));
}

main().finally(() => prisma.$disconnect());
