const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSources() {
  try {
    const sources = await prisma.marketingSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    console.log('MARKETING_SOURCES_COUNT:', sources.length);
    console.log('NAMES:', sources.map(s => s.name));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkSources();
