'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * clientMatchingEngine.js
 * Smart Client Matcher for Telegram Smart Reminders
 */
async function matchClientByName(clientNameKeyword) {
  if (!clientNameKeyword || clientNameKeyword.trim().length < 2) {
    return { matchType: 'NONE' };
  }

  const keyword = clientNameKeyword.trim();

  // 1. Search Leads
  const leads = await prisma.lead.findMany({
    where: {
      name: { contains: keyword }
    },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      assignedEmployeeId: true
    },
    take: 5
  });

  // 2. Search Admissions
  const admissions = await prisma.admission.findMany({
    where: {
      user: { name: { contains: keyword } }
    },
    select: {
      id: true,
      courseName: true,
      user: { select: { id: true, name: true, phone: true } }
    },
    take: 5
  });

  const candidates = [];

  for (const l of leads) {
    candidates.push({
      clientId: l.id,
      clientType: 'LEAD',
      name: l.name,
      phone: l.phone,
      phoneLast4: l.phone ? l.phone.slice(-4) : 'N/A',
      detail: `Lead (${l.status})`,
      assignedEmployeeId: l.assignedEmployeeId
    });
  }

  for (const a of admissions) {
    if (!candidates.some(c => c.clientId === a.id)) {
      candidates.push({
        clientId: a.id,
        clientType: 'ADMISSION',
        name: a.user?.name || 'Student',
        phone: a.user?.phone,
        phoneLast4: a.user?.phone ? a.user.phone.slice(-4) : 'N/A',
        detail: `Admission (${a.courseName})`
      });
    }
  }

  if (candidates.length === 1) {
    return {
      matchType: 'EXACT_ONE',
      client: candidates[0]
    };
  } else if (candidates.length > 1) {
    return {
      matchType: 'MULTIPLE',
      choices: candidates
    };
  }

  return { matchType: 'NONE' };
}

module.exports = {
  matchClientByName
};
