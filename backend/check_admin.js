require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function checkOrResetAdmin() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true, studentId: true }
  });
  console.log('ALL USERS IN DB:', JSON.stringify(users, null, 2));

  let admin = await prisma.user.findFirst({
    where: { OR: [{ email: 'hellotraderinstitute@gmail.com' }, { role: 'ADMIN' }, { role: 'SUPER_ADMIN' }] }
  });

  const hashedPassword = await bcrypt.hash('password123', 10);

  if (admin) {
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        email: 'hellotraderinstitute@gmail.com',
        phone: '9211501914',
        password: hashedPassword,
        role: 'ADMIN',
      }
    });
    console.log(`✅ Admin user (${admin.email}) password updated to: password123`);
  } else {
    admin = await prisma.user.create({
      data: {
        name: 'Hello Trader Admin',
        email: 'hellotraderinstitute@gmail.com',
        phone: '9211501914',
        password: hashedPassword,
        role: 'ADMIN',
        studentId: 'HT-ADMIN-001',
        referralCode: 'ADMIN01',
      }
    });
    console.log('✅ Created Admin user: hellotraderinstitute@gmail.com / password123');
  }
}

checkOrResetAdmin().catch(console.error).finally(() => prisma.$disconnect());
