const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding CRM Core Data (Phase 1 & Phase 2)...');

  // 1. Seed Marketing Sources
  const defaultSources = [
    { name: 'Justdial', channelType: 'DIRECT' },
    { name: 'Instagram', channelType: 'DIGITAL' },
    { name: 'Facebook', channelType: 'DIGITAL' },
    { name: 'Website', channelType: 'DIGITAL' },
    { name: 'Referral', channelType: 'DIRECT' },
    { name: 'Offline', channelType: 'OFFLINE' },
    { name: 'Google Ads', channelType: 'DIGITAL' }
  ];

  for (const src of defaultSources) {
    await prisma.marketingSource.upsert({
      where: { name: src.name },
      update: { channelType: src.channelType },
      create: { name: src.name, channelType: src.channelType, isActive: true }
    });
  }
  console.log('✅ Marketing Sources Seeded');

  // 2. Seed Default Staff / Employees
  const emp1 = await prisma.employee.upsert({
    where: { employeeCode: 'HT-EMP-001' },
    update: {},
    create: {
      employeeCode: 'HT-EMP-001',
      name: 'Rohan Sharma',
      email: 'rohan.sales@hellotrader.in',
      phone: '9876543210',
      designation: 'SENIOR_COUNSELOR',
      department: 'SALES',
      baseSalary: 35000,
      commissionRate: 5.0,
      status: 'ACTIVE'
    }
  });

  const emp2 = await prisma.employee.upsert({
    where: { employeeCode: 'HT-EMP-002' },
    update: {},
    create: {
      employeeCode: 'HT-EMP-002',
      name: 'Priya Verma',
      email: 'priya.tele@hellotrader.in',
      phone: '9876543211',
      designation: 'TELECALLER',
      department: 'SALES',
      baseSalary: 22000,
      commissionRate: 3.0,
      status: 'ACTIVE'
    }
  });

  const instructor = await prisma.employee.upsert({
    where: { employeeCode: 'HT-EMP-003' },
    update: {},
    create: {
      employeeCode: 'HT-EMP-003',
      name: 'Vikramaditya Trader',
      email: 'vikram.faculty@hellotrader.in',
      phone: '9876543212',
      designation: 'FACULTY',
      department: 'ACADEMICS',
      baseSalary: 50000,
      commissionRate: 0,
      status: 'ACTIVE'
    }
  });

  console.log('✅ Default Employees Seeded');

  // 3. Seed Sample Demo Class
  const now = new Date();
  const demoDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days later

  const demo = await prisma.demoClass.create({
    data: {
      title: 'Mastering Nifty & BankNifty Algo Trading',
      topic: 'Automated Options Strategies & Risk Management',
      scheduledAt: demoDate,
      durationMinutes: 60,
      meetingUrl: 'https://meet.google.com/ht-demo-masterclass',
      instructorId: instructor.id,
      status: 'SCHEDULED'
    }
  });

  console.log('✅ Sample Demo Class Created');

  // 4. Seed Sample Leads & Follow-ups
  const justdialSrc = await prisma.marketingSource.findUnique({ where: { name: 'Justdial' } });
  const instaSrc = await prisma.marketingSource.findUnique({ where: { name: 'Instagram' } });
  const fbSrc = await prisma.marketingSource.findUnique({ where: { name: 'Facebook' } });

  const lead1 = await prisma.lead.upsert({
    where: { phone: '9988776655' },
    update: {},
    create: {
      leadNumber: 'HT-LD-2026-0001',
      name: 'Amit Patel',
      email: 'amit.patel@gmail.com',
      phone: '9988776655',
      city: 'Ahmedabad',
      sourceId: instaSrc?.id,
      assignedEmployeeId: emp1.id,
      status: 'FOLLOW_UP',
      callStatus: 'CONNECTED',
      priority: 'HIGH',
      tradingExperience: 'BEGINNER',
      budget: 25000,
      notes: 'Interested in 90-day Master Trader Course + Dhan Algo setup.'
    }
  });

  const lead2 = await prisma.lead.upsert({
    where: { phone: '9988776644' },
    update: {},
    create: {
      leadNumber: 'HT-LD-2026-0002',
      name: 'Sneha Kapoor',
      email: 'sneha.k@yahoo.com',
      phone: '9988776644',
      city: 'Mumbai',
      sourceId: justdialSrc?.id,
      assignedEmployeeId: emp2.id,
      status: 'DEMO_SCHEDULED',
      callStatus: 'CONNECTED',
      priority: 'URGENT',
      tradingExperience: 'INTERMEDIATE',
      budget: 50000,
      notes: 'Wants to attend live demo masterclass before enrolling.'
    }
  });

  const lead3 = await prisma.lead.upsert({
    where: { phone: '9988776633' },
    update: {},
    create: {
      leadNumber: 'HT-LD-2026-0003',
      name: 'Rajesh Kumar',
      email: 'rajesh.k@outlook.com',
      phone: '9988776633',
      city: 'Delhi',
      sourceId: fbSrc?.id,
      assignedEmployeeId: emp1.id,
      status: 'NEW',
      callStatus: 'NOT_CALLED',
      priority: 'MEDIUM',
      tradingExperience: 'BEGINNER',
      budget: 15000,
      notes: 'New lead from Facebook ad campaign.'
    }
  });

  // Attach lead2 to demo class
  await prisma.demoAttendee.upsert({
    where: { demoId_leadId: { demoId: demo.id, leadId: lead2.id } },
    update: {},
    create: {
      demoId: demo.id,
      leadId: lead2.id,
      attended: false
    }
  });

  // Scheduled Follow-up for lead1 (today)
  const followUpTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
  await prisma.leadFollowUp.create({
    data: {
      leadId: lead1.id,
      employeeId: emp1.id,
      scheduledAt: followUpTime,
      status: 'PENDING',
      channel: 'CALL',
      summary: 'Discuss admission fee discount & batch timings.',
      nextAction: 'Call client and confirm payment mode'
    }
  });

  // Log initial activity timelines
  await prisma.crmActivityTimeline.createMany({
    data: [
      {
        leadId: lead1.id,
        actorName: emp1.name,
        actorRole: 'SENIOR_COUNSELOR',
        eventType: 'LEAD_CREATED',
        title: 'Lead Captured from Instagram',
        description: 'Interest registered for Nifty Algo Trading course.'
      },
      {
        leadId: lead1.id,
        actorName: emp1.name,
        actorRole: 'SENIOR_COUNSELOR',
        eventType: 'CALL_LOGGED',
        title: 'Phone Call Connected',
        description: 'Client requested follow-up today regarding installment options.'
      },
      {
        leadId: lead2.id,
        actorName: emp2.name,
        actorRole: 'TELECALLER',
        eventType: 'DEMO_BOOKED',
        title: 'Booked for Live Demo Masterclass',
        description: 'Seat reserved for upcoming Algo Trading webinar.'
      }
    ]
  });

  console.log('✅ Sample Leads, Follow-ups, and Timelines Seeded');
  console.log('🎉 CRM Seed Completed Successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
