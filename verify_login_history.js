const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('=== REAL USER AUDIT LOG & REGISTER VERIFICATION ===');
  
  // 1. Get first 3 users with role = 'USER'
  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    take: 3
  });
  
  for (const u of users) {
    console.log(`\nUser: ${u.name} (ID: ${u.studentId})`);
    
    // Find latest login audit log
    const latestLogin = await prisma.auditLog.findFirst({
      where: { userId: u.id, category: 'AUTH', action: 'USER_LOGIN' },
      orderBy: { timestamp: 'desc' }
    });
    
    if (latestLogin) {
      console.log(`  Latest USER_LOGIN timestamp in AuditLog: ${latestLogin.timestamp.toISOString()}`);
      console.log(`  IP Address: ${latestLogin.ipAddress}`);
    } else {
      console.log('  No USER_LOGIN audit log found.');
    }
  }

  // 2. Test GET /api/admin/student-register internally
  // Since we want to check what is returned by the route itself, let's query the database using the same logic as the route!
  console.log('\n=== TESTING ROUTE LOGIC FOR REGISTER ===');
  const registerUsers = await prisma.user.findMany({
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
    take: 3
  });

  registerUsers.forEach(u => {
    const lastLogin = u.auditLogs[0]?.timestamp || null;
    console.log(`User: ${u.name} (${u.studentId})`);
    console.log(`  auditLogs[0]?.timestamp: ${lastLogin ? lastLogin.toISOString() : 'null'}`);
    console.log(`  lastLoginDate: ${lastLogin ? new Date(lastLogin).toLocaleDateString('en-IN') : 'Never'}`);
  });
}

check().then(() => prisma.$disconnect());
