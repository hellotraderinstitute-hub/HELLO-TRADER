const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// ─── PRODUCTION SAFETY GUARD ─────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED_IN_PROD) {
  console.error('🛑 SECURITY ERROR: Seeding test student accounts is strictly prohibited in PRODUCTION environment!');
  process.exit(1);
}

const prisma = new PrismaClient();

async function seedStudents() {
  console.log('Seeding initial student accounts...');
  const hash = await bcrypt.hash('Hello@123', 10);

  const studentsData = [
    { studentId: 'HT0786', name: 'Student Trader (Pro)', email: 'student@hellotrader.com', phone: '9876543210', referralCode: 'REFHT0786' },
    { studentId: 'HT0787', name: 'Rohan Sharma', email: 'rohan.sharma@gmail.com', phone: '9123456789', referralCode: 'REFHT0787' },
    { studentId: 'HT0788', name: 'Priya Patel', email: 'priya.patel@gmail.com', phone: '9812345678', referralCode: 'REFHT0788' },
    { studentId: 'HT0789', name: 'Amit Kumar', email: 'amit.kumar@gmail.com', phone: '9712345678', referralCode: 'REFHT0789' },
  ];

  for (const s of studentsData) {
    const user = await prisma.user.upsert({
      where: { studentId: s.studentId },
      update: {
        password: hash,
        status: 'ACTIVE',
      },
      create: {
        studentId: s.studentId,
        name: s.name,
        email: s.email,
        phone: s.phone,
        password: hash,
        role: 'USER',
        referralCode: s.referralCode,
        status: 'ACTIVE',
        trialStartedAt: new Date(),
      }
    });

    // Seed initial ledger entries for paper balance & tokens
    const existingLedger = await prisma.ledger.findFirst({ where: { userId: user.id } });
    if (!existingLedger) {
      await prisma.ledger.create({
        data: {
          userId: user.id,
          walletType: 'PAPER',
          amount: 5000000,
          type: 'CREDIT',
          reason: 'INITIAL_PAPER_MARGIN'
        }
      });
      await prisma.ledger.create({
        data: {
          userId: user.id,
          walletType: 'TOKEN',
          amount: 500,
          type: 'CREDIT',
          reason: 'WELCOME_BONUS'
        }
      });
    }

    console.log(`  ✓ Student seeded: ${user.studentId} (${user.name})`);
  }

  console.log('All student accounts seeded successfully!');
}

seedStudents()
  .catch(e => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
