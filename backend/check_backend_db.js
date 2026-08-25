const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('=== BACKEND DATABASE DIAGNOSTICS ===');
  
  // 1. Users
  const users = await prisma.user.findMany();
  console.log('Users found:', users.length);
  users.forEach(u => {
    console.log(`- ID: ${u.id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, StudentId: ${u.studentId}`);
  });

  // 2. Connections
  const connections = await prisma.algoBrokerConnection.findMany();
  console.log('\nConnections found:', connections.length);
  connections.forEach(c => {
    console.log(`- ID: ${c.id}, Broker: ${c.broker}, ClientId: ${c.clientId}, Active: ${c.isActive}, KillSwitch: ${c.killSwitchActive}, Token: ${c.webhookToken ? c.webhookToken.slice(0, 10) + '...' : 'NONE'}`);
  });

  // 3. Static IP Assignments
  const ipAssignments = await prisma.clientStaticIpAssignment.findMany();
  console.log('\nStatic IP Assignments found:', ipAssignments.length);
  ipAssignments.forEach(ip => {
    console.log(`- ID: ${ip.id}, UserID: ${ip.userId}, Broker: ${ip.broker}, Status: ${ip.status}, IP: ${ip.ipAddress}, Host: ${ip.proxyHost}`);
  });

  // 4. Agent Risk Settings
  const riskSettings = await prisma.agentRiskSettings.findMany();
  console.log('\nAgent Risk Settings found:', riskSettings.length);
  riskSettings.forEach(r => {
    console.log(`- UserID: ${r.userId}, Live: ${r.isLiveTradingEnabled}, MaxLots: ${r.maxLots}, DailyMaxLoss: ${r.dailyMaxLoss} (Enabled: ${r.dailyMaxLossEnabled}), DailyProfitTarget: ${r.dailyProfitTarget} (Enabled: ${r.dailyProfitTargetEnabled}), Paused: ${r.isPausedToday}`);
  });

  // 5. System Settings
  const sysSettings = await prisma.systemSettings.findMany();
  console.log('\nSystem Settings found:', sysSettings.length);
  sysSettings.forEach(s => {
    console.log(`- ID: ${s.id}, GlobalKillSwitch: ${s.globalKillSwitch}`);
  });
}

run().catch(console.error).finally(() => prisma.$disconnect());
