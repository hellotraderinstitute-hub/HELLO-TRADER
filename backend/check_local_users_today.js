const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsersToday() {
  console.log('=== LOCAL DATABASE READ-ONLY USER ACCOUNTS INSPECTION ===\n');

  const allUsers = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Total Users in Local DB: ${allUsers.length}`);

  const nowIndiaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  console.log(`Current India (IST) Date: ${nowIndiaStr}`);

  // Yesterday IST
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIndiaStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  console.log(`Yesterday India (IST) Date: ${yesterdayIndiaStr}`);

  const todayUsers = [];
  const yesterdayUsers = [];
  const olderUsers = [];

  for (const u of allUsers) {
    const userDateIST = new Date(u.createdAt || u.trialStartedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (userDateIST === nowIndiaStr) {
      todayUsers.push(u);
    } else if (userDateIST === yesterdayIndiaStr) {
      yesterdayUsers.push(u);
    } else {
      olderUsers.push(u);
    }
  }

  console.log(`\nUsers Created TODAY in IST (${nowIndiaStr}): ${todayUsers.length}`);
  console.log(`Users Created YESTERDAY in IST (${yesterdayIndiaStr}): ${yesterdayUsers.length}`);
  console.log(`Older Users: ${olderUsers.length}`);

  console.log('\n--- LATEST 10 USERS IN LOCAL DB ---');
  allUsers.slice(0, 10).forEach((u, i) => {
    const createdISTDate = new Date(u.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const createdISTTime = new Date(u.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    console.log(`${i + 1}. [${u.role}] ${u.name} | ID: ${u.studentId} | Email: ${u.email} | Mobile: ${u.phone} | Created IST: ${createdISTDate} ${createdISTTime} | Status: ${u.status}`);
  });

  await prisma.$disconnect();
}

checkUsersToday().catch(console.error);
