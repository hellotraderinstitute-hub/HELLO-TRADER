const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { N } = require('./services/notifier');

const runScheduler = async () => {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'CONFIG' } });
    
    // Convert current UTC time to IST (UTC + 5:30)
    const nowUTC = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(nowUTC.getTime() + istOffset);
    
    const hoursIST = istDate.getUTCHours();
    const minutesIST = istDate.getUTCMinutes();
    const dayIST = istDate.getUTCDay(); // 0 = Sun, 6 = Sat

    // ── 1. Auto-Renew / Expire / Auto-Bill Memberships ────────────────
    const { autoBillUserIfEligible } = require('./services/autoBillingService');
    
    // Find all users who are not active OR whose membership has expired
    const allUsers = await prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true }
    });

    for (const u of allUsers) {
      await autoBillUserIfEligible(u.id);
    }

    // ── 0. DAILY 9:15 AM IST LIVE MARKET OPEN HEALTH CHECK ─────────────
    const is915MarketOpenWindow = hoursIST === 9 && minutesIST >= 15 && minutesIST <= 20;
    const isMarketHours = (hoursIST === 9 && minutesIST >= 15) || (hoursIST > 9 && hoursIST < 15) || (hoursIST === 15 && minutesIST <= 30);

    const marketHealthMonitor = require('./services/marketHealthMonitor');
    if (is915MarketOpenWindow) {
      await marketHealthMonitor.dispatchMarketOpenTelegramAlert({ isScheduled915: true });
    } else if (isTradingDay && isMarketHours) {
      // Continuous health check during market hours (checks recovery/degradation)
      await marketHealthMonitor.dispatchMarketOpenTelegramAlert({ isScheduled915: false });
    }

    // ── 2. INTRADAY AUTO-SQUAREOFF ENGINE (3:15 PM IST on Trading Days) ─
    // If Monday to Friday and time >= 15:15 IST (3:15 PM IST)
    const isTradingDay = dayIST >= 1 && dayIST <= 5;
    const isSquareoffTime = (hoursIST === 15 && minutesIST >= 15) || (hoursIST > 15 && hoursIST < 16);

    if (isTradingDay && isSquareoffTime) {
      const openIntradayTrades = await prisma.trade.findMany({
        where: {
          status: 'OPEN',
          productType: 'INTRADAY'
        }
      });

      if (openIntradayTrades.length > 0) {
        console.log(`[Scheduler] 3:15 PM IST Reached — Auto-squaring off ${openIntradayTrades.length} Intraday positions...`);
        for (const trade of openIntradayTrades) {
          // Compute settlement price (strictly entryPrice or exact live tick, no Math.random)
          const closePrice = trade.entryPrice;
          let pnl = 0;
          if (trade.side === 'BUY') {
            pnl = (closePrice - trade.entryPrice) * trade.quantity * trade.leverage;
          } else {
            pnl = (trade.entryPrice - closePrice) * trade.quantity * trade.leverage;
          }
          pnl = Number(pnl.toFixed(2));

          await prisma.trade.update({
            where: { id: trade.id },
            data: {
              status: 'CLOSED',
              closePrice,
              pnl,
              closedAt: nowUTC
            }
          });

          // Return Margin + PnL to user's PAPER ledger
          const returnedMargin = (trade.entryPrice * trade.quantity) / trade.leverage;
          const totalReturn = Math.max(0, returnedMargin + pnl);

          await prisma.ledger.create({
            data: {
              userId: trade.userId,
              walletType: 'PAPER',
              amount: totalReturn,
              type: 'CREDIT',
              reason: `INTRADAY_AUTO_SQUAREOFF_315PM_${trade.symbol}`
            }
          });
          console.log(`[Scheduler] Closed Intraday Trade ${trade.id} for ${trade.symbol} PnL: ₹${pnl}`);
        }
      }
    }

    // ── 3. Server-Side Automated Due-Date & Subscription Telegram Reminder Engine ──
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;

    // A. Auto-Cancel Payment Reminders if Paid (Pending Amount = 0)
    const paidAdmissions = await prisma.admission.findMany({
      where: { pendingAmount: { lte: 0 } },
      select: { id: true }
    });
    if (paidAdmissions.length > 0) {
      await prisma.crmReminder.updateMany({
        where: {
          admissionId: { in: paidAdmissions.map(a => a.id) },
          status: 'PENDING',
          type: { in: ['PAYMENT_FOLLOWUP', 'ADMISSION_FOLLOWUP'] }
        },
        data: { status: 'COMPLETED', completedAt: nowUTC }
      });
    }

    // B. Scan Admissions with Pending Balance & Due Dates
    const pendingAdmissions = await prisma.admission.findMany({
      where: {
        pendingAmount: { gt: 0 },
        dueDate: { not: null }
      },
      include: {
        user: true,
        counselor: true
      }
    });

    const reminderSettings = await prisma.reminderSettings.findUnique({ where: { id: 'GLOBAL' } }) || {};

    for (const adm of pendingAdmissions) {
      const due = new Date(adm.dueDate);
      const diffDays = Math.ceil((due - nowUTC) / (1000 * 60 * 60 * 24));
      const yyyymmdd = nowUTC.toISOString().split('T')[0];

      let alertType = null;
      let dedupKey = null;
      let messageTitle = null;

      if (diffDays === 7 && settings.remind7DaysBefore !== false) {
        alertType = 'DUE_7_DAYS';
        dedupKey = `PAYMENT_DUE_7_DAYS_${adm.id}`;
        messageTitle = '🔔 PAYMENT DUE IN 7 DAYS';
      } else if (diffDays === 3 && settings.remind3DaysBefore !== false) {
        alertType = 'DUE_3_DAYS';
        dedupKey = `PAYMENT_DUE_3_DAYS_${adm.id}`;
        messageTitle = '🔔 PAYMENT DUE IN 3 DAYS';
      } else if (diffDays === 1 && settings.remind1DayBefore !== false) {
        alertType = 'DUE_1_DAY';
        dedupKey = `PAYMENT_DUE_1_DAY_${adm.id}`;
        messageTitle = '🔔 PAYMENT DUE TOMORROW';
      } else if (diffDays === 0 && settings.remindOnDueDate !== false) {
        alertType = 'DUE_TODAY';
        dedupKey = `PAYMENT_DUE_TODAY_${adm.id}`;
        messageTitle = '🔔 PAYMENT DUE TODAY';
      } else if (diffDays < 0 && settings.remindOverdue !== false) {
        alertType = 'OVERDUE';
        dedupKey = `PAYMENT_OVERDUE_${adm.id}_${yyyymmdd}`;
        messageTitle = `🔴 PAYMENT OVERDUE (${Math.abs(diffDays)} Days Overdue)`;
      }

      if (alertType && dedupKey) {
        const existing = await prisma.crmReminder.findUnique({ where: { dedupKey } });
        if (!existing) {
          const remNum = `#CRM-REM-${Date.now().toString().slice(-4)}`;
          const empChatId = adm.counselor?.phone || adm.counselor?.email || defaultChatId;

          await prisma.crmReminder.create({
            data: {
              reminderNumber: remNum,
              employeeId: adm.counselorId,
              admissionId: adm.id,
              title: `${messageTitle}: ${adm.user?.name || 'Student'}`,
              type: 'PAYMENT_FOLLOWUP',
              description: `Course: ${adm.courseName} | Fee: ₹${adm.totalFee} | Paid: ₹${adm.paidAmount} | Pending: ₹${adm.pendingAmount}`,
              scheduledAt: nowUTC,
              status: 'PENDING',
              source: 'SYSTEM_AUTO',
              dedupKey,
              telegramChatId: empChatId
            }
          });
        }
      }
    }

    // C. Dispatch Pending Reminders to Telegram safely
    const dueReminders = await prisma.crmReminder.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: nowUTC }
      },
      include: {
        lead: true,
        admission: { include: { user: true } },
        employee: true
      }
    });

    for (const rem of dueReminders) {
      const targetChatId = rem.telegramChatId || rem.employee?.phone || defaultChatId;

      if (!botToken || !targetChatId) {
        await prisma.crmReminder.update({
          where: { id: rem.id },
          data: {
            status: 'FAILED',
            lastError: 'TELEGRAM_NOT_CONFIGURED'
          }
        });
        console.log(`[Scheduler] Reminder ${rem.reminderNumber} failed: Telegram not configured.`);
        continue;
      }

      try {
        const clientName = rem.lead?.name || rem.admission?.user?.name || 'Client';
        const formattedTime = new Date(rem.scheduledAt).toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        const notifyMsg = `🔔 <b>${rem.title}</b>\n\n👤 <b>Client:</b> ${clientName}\n📝 <b>Details:</b> ${rem.description || rem.title}\n⏰ <b>Time:</b> ${formattedTime} (IST)\n\nID: <code>${rem.reminderNumber}</code>`;

        if (N.sendTelegramCustomMessage) {
          await N.sendTelegramCustomMessage(targetChatId, notifyMsg);
        }

        await prisma.crmReminder.update({
          where: { id: rem.id },
          data: {
            status: 'SENT',
            completedAt: nowUTC,
            sentAt: nowUTC
          }
        });

        console.log(`[Scheduler] Dispatched CRM Reminder ${rem.reminderNumber} to Telegram.`);
      } catch (remErr) {
        console.error(`[Scheduler] Failed to dispatch reminder ${rem.reminderNumber}:`, remErr.message);

        const newRetry = (rem.retryCount || 0) + 1;
        await prisma.crmReminder.update({
          where: { id: rem.id },
          data: {
            retryCount: newRetry,
            lastError: remErr.message,
            status: newRetry >= 3 ? 'FAILED' : 'PENDING'
          }
        });
      }
    }

  } catch (err) {
    console.error('[Scheduler] Error:', err);
  }
};

// ── Automated Database & Payment Config Backup Cron (6-Hour Rolling) ──
const backupEngine = require('./services/backupEngine');

setInterval(async () => {
  try {
    await backupEngine.createDatabaseBackup();
    await backupEngine.createPaymentConfigBackup('Automated Scheduler Cron');
    console.log('[Scheduler] Automated 6-Hour Database & Payment Config Backup Completed.');
  } catch (err) {
    console.error('[Scheduler] Backup cron error:', err.message);
  }
}, 6 * 60 * 60 * 1000);

console.log('[Scheduler] 30-second background cron, 3:15 PM IST Squareoff, & 6-Hour Automated Backup initialized.');
module.exports = { runScheduler };
