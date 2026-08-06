const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rules = [
    { minAmount: 900, bonusPercent: 0 },
    { minAmount: 2500, bonusPercent: 5 },
    { minAmount: 5000, bonusPercent: 10 },
    { minAmount: 10000, bonusPercent: 15 },
    { minAmount: 25000, bonusPercent: 20 },
  ];

  for (const rule of rules) {
    await prisma.bonusRule.upsert({
      where: { minAmount: rule.minAmount },
      update: { bonusPercent: rule.bonusPercent },
      create: rule,
    });
  }
  
  console.log("Bonus rules seeded.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
