const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOrigin() {
  const ids = ['HT0786', 'HT0787', 'HT0788', 'HT0789'];
  for (const s of ids) {
    const u = await prisma.user.findUnique({ where: { studentId: s } });
    console.log('====================================');
    console.log(`Student ID: ${s}`);
    if (u) {
      console.log(`DB Primary Key ID: ${u.id}`);
      console.log(`Name: ${u.name}`);
      console.log(`Email: ${u.email}`);
      console.log(`Phone: ${u.phone}`);
      console.log(`Role: ${u.role}`);
      console.log(`Exact DB Creation Timestamp: ${u.createdAt.toISOString()}`);
    } else {
      console.log('Record not found in DB');
    }
  }
}

checkOrigin().finally(() => prisma.$disconnect());
