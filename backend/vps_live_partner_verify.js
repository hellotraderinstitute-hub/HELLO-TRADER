
    const { PrismaClient } = require('/var/www/hello-trader/backend/node_modules/@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: 'file:/var/www/hello-trader/backend/prisma/backend.db' } }
    });
    const partnerService = require('/var/www/hello-trader/backend/services/partnerService');

    async function verify() {
      console.log('[VPS VERIFY] Checking Partner Model & Sequencing on VPS...');
      const partnerCount = await prisma.partner.count();
      console.log('Current Partner Count in VPS Production DB:', partnerCount);

      const nextId = await partnerService.getNextPartnerId(prisma);
      console.log('Next Partner ID Computed on VPS:', nextId);

      if (partnerCount === 0) {
        console.log('Creating initial PHT0036 Partner for Live Verification...');
        const p = await partnerService.createPartner({
          name: 'Hello Trader Partner Alpha',
          email: 'partner.alpha@hellotrader.in',
          phone: '9876543210',
          password: 'PartnerLivePass@2026'
        }, { id: 'SUPER_ADMIN' }, prisma);
        console.log('Created Initial Partner:', p.partner.partnerId, p.partner.referralCode);
      }

      const activePartners = await prisma.partner.findMany();
      console.log('Active Partners on VPS:', activePartners.map(p => ({ id: p.partnerId, name: p.name, status: p.status, ref: p.referralCode })));

      console.log('[VPS VERIFY] Checking Existing Users & Memberships Count...');
      const userCount = await prisma.user.count({ where: { role: 'USER' } });
      const memCount = await prisma.membership.count();
      console.log('Production Users Count:', userCount);
      console.log('Production Memberships Count:', memCount);

      console.log('[VPS VERIFY] SUCCESS: All tables and services responding normally.');
      await prisma.$disconnect();
    }

    verify().catch(e => { console.error('VPS Verification Error:', e); process.exit(1); });
  