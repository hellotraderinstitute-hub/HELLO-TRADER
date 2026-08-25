const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const conn = await prisma.algoBrokerConnection.findUnique({
    where: { id: 'dhan-test-terminal' }
  });
  console.log('AlgoBrokerConnection dhan-test-terminal:', JSON.stringify(conn, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
