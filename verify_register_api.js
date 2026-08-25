const http = require('http');

// Simulating an admin GET request to /api/admin/student-register.
// Since we don't have cookies easily available here, we'll import admin.js router or prisma directly 
// to simulate the exact endpoint handler output!
const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    where: { role: 'USER', accountMode: 'PRODUCTION' },
    include: {
      memberships: { orderBy: { expiresAt: 'desc' }, take: 1 },
      brokerConnections: true,
      auditLogs: {
        where: { category: 'AUTH', action: 'USER_LOGIN' },
        orderBy: { timestamp: 'desc' },
        take: 1
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const studentRegister = users.map(u => {
    const activeMembership = u.memberships.find(m => m.status === 'ACTIVE' && m.expiresAt > new Date());
    const tokenLedgers = u.ledger || []; // we handle fallback safely
    const tokenBalance = 0; // simple test
    const activeConnection = u.brokerConnections.find(b => b.isActive);
    const lastLogin = u.auditLogs[0]?.timestamp || null;
    const lastSeen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null;
    const isOnline = lastSeen && (Date.now() - lastSeen) < 90000;

    return {
      studentId: u.studentId,
      name: u.name,
      lastLoginDate: lastLogin ? new Date(lastLogin).toLocaleDateString('en-IN') : 'Never',
      lastLoginTime: lastLogin ? new Date(lastLogin).toLocaleTimeString('en-IN') : 'Never',
      lastLoginTimestamp: lastLogin,
      lastSeenAt: u.lastSeenAt,
      lastSeenDate: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString('en-IN') : 'Never',
      lastSeenTime: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleTimeString('en-IN') : 'Never',
      isOnline: !!isOnline
    };
  });

  console.log('=== LIVE API SIMULATED RESPONSE ===');
  const target = studentRegister.find(s => s.studentId === 'HT0787');
  console.log(JSON.stringify(target, null, 2));
}

check().then(() => prisma.$disconnect());
