const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function checkAdminPass() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.log('No admin user found!');
    return;
  }
  console.log('Admin found:', admin.studentId, admin.email, admin.phone);

  const testPasses = ['password123', 'admin123', 'HT@admin', 'HT@1234', 'admin', 'password', '123456'];
  for (const pass of testPasses) {
    const match = await bcrypt.compare(pass, admin.password);
    if (match) {
      console.log(`MATCH FOUND! Password is: "${pass}"`);
      return;
    }
  }
  console.log('No standard test password matched.');
}

checkAdminPass().catch(console.error).finally(() => prisma.$disconnect());
