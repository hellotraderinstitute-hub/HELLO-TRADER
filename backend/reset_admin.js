const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function resetAdminPassword() {
  const hash = await bcrypt.hash('password123', 10);
  const updated = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { password: hash }
  });
  console.log('Admin password reset to password123. Records updated:', updated.count);
}

resetAdminPassword().catch(console.error).finally(() => prisma.$disconnect());
