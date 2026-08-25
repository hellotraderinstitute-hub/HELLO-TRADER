require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function testLogin() {
  const loginId = 'hellotraderinstitute@gmail.com';
  const password = 'password123';

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: loginId }, { phone: loginId }, { studentId: loginId }]
    }
  });

  console.log('USER FOUND IN DB:', user);

  if (!user) {
    console.log('❌ User not found');
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  console.log('PASSWORD VALID?:', valid);
}

testLogin().catch(console.error).finally(() => prisma.$disconnect());
