const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('Maa@2003', 10);
  
  await prisma.user.upsert({
    where: { email: 'hellotraderinstitute@gmail.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'hellotraderinstitute@gmail.com',
      phone: '9211501914',
      password: hashedPassword,
      role: 'ADMIN',
      studentId: 'ADMIN001',
      referralCode: 'ADMINREF'
    }
  });

  console.log("Admin seeded successfully.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
