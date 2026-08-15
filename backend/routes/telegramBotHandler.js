const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const https = require('https');

const { parseNaturalLanguageReminder } = require('../services/telegramReminderParser');
const { matchClientByName } = require('../services/clientMatchingEngine');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// Helper: Send Telegram Message
function sendTelegramMessage(chatId, text, replyMarkup = null) {
  if (!BOT_TOKEN || !chatId) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', err => reject(err));
    req.write(payload);
    req.end();
  });
}

// Helper: Auto-generate Reminder Number (e.g. #CRM-REM-1001)
async function generateReminderNumber() {
  const count = await prisma.crmReminder.count();
  return `#CRM-REM-${String(count + 1001).padStart(4, '0')}`;
}

// ─── TELEGRAM INBOUND WEBHOOK ROUTE ──────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // ACK Telegram immediately
  res.status(200).json({ status: 'ok' });

  setImmediate(async () => {
    try {
      const update = req.body;
      if (!update || !update.message || !update.message.text) return;

      const chatId = String(update.message.chat.id);
      const text = update.message.text.trim();
      const rawLower = text.toLowerCase();

      // Look up Employee Security Context
      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { email: { contains: chatId } },
            { phone: { contains: chatId } }
          ]
        }
      });

      const isAdmin = !employee || employee.designation === 'ADMIN';

      // ─── 1. COMMAND: List Reminders ("mere aaj ke reminders", "pending reminders" etc) ────
      if (rawLower.includes('aaj ke reminder') || rawLower.includes('today callbacks') || rawLower.includes('today demos')) {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const where = { scheduledAt: { gte: todayStart, lte: todayEnd } };
        if (!isAdmin && employee) where.employeeId = employee.id;

        const reminders = await prisma.crmReminder.findMany({ where, orderBy: { scheduledAt: 'asc' } });
        if (reminders.length === 0) {
          return sendTelegramMessage(chatId, '🔔 <b>Today&apos;s Reminders:</b> No reminders scheduled for today!');
        }

        let msg = `🔔 <b>Today&apos;s Reminders (${reminders.length}):</b>\n\n`;
        reminders.forEach((r, idx) => {
          const timeStr = new Date(r.scheduledAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
          const statusIcon = r.status === 'COMPLETED' ? '✅' : r.status === 'CANCELLED' ? '❌' : '⏰';
          msg += `${idx + 1}. ${statusIcon} <b>${r.title}</b>\n   ⏰ ${timeStr} | ID: <code>${r.reminderNumber}</code>\n\n`;
        });
        return sendTelegramMessage(chatId, msg);
      }

      if (rawLower.includes('pending reminder') || rawLower.includes('overdue reminder')) {
        const where = { status: 'PENDING' };
        if (!isAdmin && employee) where.employeeId = employee.id;

        const reminders = await prisma.crmReminder.findMany({ where, orderBy: { scheduledAt: 'asc' }, take: 10 });
        if (reminders.length === 0) {
          return sendTelegramMessage(chatId, '✅ No pending reminders found!');
        }

        let msg = `⏰ <b>Pending Reminders (${reminders.length}):</b>\n\n`;
        reminders.forEach((r, idx) => {
          const timeStr = new Date(r.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true, day: '2-digit', month: 'short' });
          msg += `${idx + 1}. <b>${r.title}</b>\n   ⏰ ${timeStr} | ID: <code>${r.reminderNumber}</code>\n\n`;
        });
        return sendTelegramMessage(chatId, msg);
      }

      // ─── 2. COMMAND: Cancel Reminder ("Rahul ka reminder cancel karo") ──────
      if (rawLower.includes('cancel') && (rawLower.includes('reminder') || rawLower.includes('ko'))) {
        const match = rawLower.match(/cancel\s+([a-zA-Z0-9#-]+)/i) || rawLower.match(/([a-zA-Z0-9#-]+)\s+ka\s+reminder\s+cancel/i);
        const term = match ? match[1] : null;

        if (term) {
          const target = await prisma.crmReminder.findFirst({
            where: {
              OR: [
                { reminderNumber: { contains: term.toUpperCase() } },
                { title: { contains: term } }
              ]
            }
          });

          if (target) {
            await prisma.crmReminder.update({
              where: { id: target.id },
              data: { status: 'CANCELLED', cancelledAt: new Date() }
            });

            // Log timeline
            if (target.leadId) {
              await prisma.crmActivityTimeline.create({
                data: {
                  leadId: target.leadId,
                  actorName: employee?.name || 'Telegram Bot',
                  actorRole: employee?.designation || 'ADMIN',
                  eventType: 'REMINDER_CANCELLED',
                  title: `❌ Reminder Cancelled: ${target.reminderNumber}`,
                  description: target.title
                }
              });
            }

            return sendTelegramMessage(chatId, `❌ <b>Reminder Cancelled:</b> ${target.title} (${target.reminderNumber})`);
          }
        }
      }

      // ─── 3. NATURAL LANGUAGE REMINDER CREATION & AMBIGUITY RESOLUTION ─────
      const parseResult = parseNaturalLanguageReminder(text);

      // Handle Ambiguity (Missing Time / Missing Info)
      if (parseResult.isAmbiguous) {
        return sendTelegramMessage(chatId, `❓ ${parseResult.question}`);
      }

      if (!parseResult.success) {
        return sendTelegramMessage(chatId, `ℹ️ I couldn't understand that reminder schedule. Try writing: <i>"Kal raat 8 baje Rahul ka demo hai"</i>`);
      }

      // Smart Client Matching
      let attachedLeadId = null;
      let attachedAdmissionId = null;

      if (parseResult.clientName) {
        const matchResult = await matchClientByName(parseResult.clientName);
        if (matchResult.matchType === 'EXACT_ONE') {
          if (matchResult.client.clientType === 'LEAD') attachedLeadId = matchResult.client.clientId;
          if (matchResult.client.clientType === 'ADMISSION') attachedAdmissionId = matchResult.client.clientId;
        } else if (matchResult.matchType === 'MULTIPLE') {
          let choiceMsg = `🔍 <b>Multiple clients matched for &quot;${parseResult.clientName}&quot;:</b>\n\n`;
          matchResult.choices.forEach((c, i) => {
            choiceMsg += `${i + 1}. <b>${c.name}</b> (..${c.phoneLast4}) — ${c.detail}\n`;
          });
          choiceMsg += `\nReply with client name & number to specify exact client.`;
          return sendTelegramMessage(chatId, choiceMsg);
        }
      }

      // Save Reminder to Database
      const reminderNumber = await generateReminderNumber();
      const reminder = await prisma.crmReminder.create({
        data: {
          reminderNumber,
          employeeId: employee?.id || null,
          leadId: attachedLeadId,
          admissionId: attachedAdmissionId,
          title: parseResult.title,
          type: parseResult.type,
          description: text,
          scheduledAt: parseResult.scheduledAt,
          timezone: 'Asia/Kolkata',
          status: 'PENDING',
          source: 'TELEGRAM',
          telegramChatId: chatId
        }
      });

      // Log to CRM Timeline
      if (attachedLeadId) {
        await prisma.crmActivityTimeline.create({
          data: {
            leadId: attachedLeadId,
            actorName: employee?.name || 'Telegram Bot',
            actorRole: employee?.designation || 'ADMIN',
            eventType: 'REMINDER_CREATED',
            title: `🔔 Reminder Created via Telegram: ${reminder.reminderNumber}`,
            description: `Scheduled: ${parseResult.formattedIST} | Type: ${parseResult.type}`
          }
        });
      }

      // Send Instant Confirmation
      const confirmText = `✅ <b>Reminder Created Successfully</b>\n\n👤 <b>Client/Title:</b> ${parseResult.clientName || 'General Follow-up'}\n📌 <b>Type:</b> ${parseResult.type.replace('_', ' ')}\n⏰ <b>Scheduled:</b> ${parseResult.formattedIST}\n🕐 <b>Timezone:</b> Asia/Kolkata\n\nReminder ID: <code>${reminder.reminderNumber}</code>`;

      return sendTelegramMessage(chatId, confirmText);
    } catch (error) {
      console.error('Error handling Telegram webhook:', error);
    }
  });
});

module.exports = router;
