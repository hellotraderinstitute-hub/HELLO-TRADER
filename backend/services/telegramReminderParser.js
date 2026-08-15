'use strict';

/**
 * telegramReminderParser.js
 * Natural Language Parser for Telegram CRM Reminders in Asia/Kolkata (IST)
 */

// Helper to convert IST hours/minutes/date into UTC JavaScript Date
function createISTDate(year, monthIndex, day, hours, minutes = 0) {
  // IST is UTC + 5:30 (330 minutes)
  const istOffsetMinutes = 330;
  const utcDate = new Date(Date.UTC(year, monthIndex, day, hours, minutes));
  return new Date(utcDate.getTime() - istOffsetMinutes * 60 * 1000);
}

function getISTNow() {
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(nowUTC.getTime() + istOffsetMs);
}

function parseNaturalLanguageReminder(text) {
  if (!text || typeof text !== 'string') {
    return { error: 'Empty text provided' };
  }

  const rawLower = text.toLowerCase().trim();
  const istNow = getISTNow();
  const currentYear = istNow.getUTCFullYear();
  const currentMonth = istNow.getUTCMonth(); // 0-indexed
  const currentDate = istNow.getUTCDate();

  let targetYear = currentYear;
  let targetMonth = currentMonth;
  let targetDay = currentDate;

  let hasExplicitDate = false;
  let hasExplicitTime = false;
  let detectedHours = null;
  let detectedMinutes = 0;
  let isAmbiguous = false;
  let missingField = null;
  let question = null;

  // 1. Detect Category
  let type = 'GENERAL';
  if (rawLower.includes('demo')) type = 'DEMO';
  else if (rawLower.includes('payment') || rawLower.includes('paise') || rawLower.includes('₹') || rawLower.includes('fee')) type = 'PAYMENT_FOLLOWUP';
  else if (rawLower.includes('call') || rawLower.includes('callback') || rawLower.includes('baat')) type = 'CALLBACK';
  else if (rawLower.includes('terminal')) type = 'TERMINAL_FOLLOWUP';
  else if (rawLower.includes('algo')) type = 'ALGO_FOLLOWUP';
  else if (rawLower.includes('copy trading') || rawLower.includes('copy')) type = 'COPY_TRADING_FOLLOWUP';
  else if (rawLower.includes('admission')) type = 'ADMISSION_FOLLOWUP';

  // 2. Extract Client Name (heuristics)
  let clientName = null;
  const clientMatch = rawLower.match(/(?:call|demo|payment|baat|remind|follow-up|followup)?\s*(?:for|ko|ka|ki)?\s*([a-zA-Z]+)(?:\s+ko|\s+ka|\s+ki|\s+call|\s+demo|\s+payment)?/i);
  
  // Filter out keywords from matched client names
  const stopWords = ['kal', 'aaj', 'parson', 'subah', 'raat', 'dopahar', 'shaam', 'demo', 'call', 'payment', 'baje', 'hours', 'baad', 'ko', 'ka', 'ki', 'par', 'hain', 'karna', 'hai'];
  
  const words = rawLower.split(/\s+/);
  for (const w of words) {
    const cleanW = w.replace(/[^a-zA-Z]/g, '');
    if (cleanW.length > 2 && !stopWords.includes(cleanW) && !clientName) {
      // Capitalize
      clientName = cleanW.charAt(0).toUpperCase() + cleanW.slice(1);
    }
  }

  // 3. Date Detection
  if (rawLower.includes('parson') || rawLower.includes('day after tomorrow')) {
    targetDay += 2;
    hasExplicitDate = true;
  } else if (rawLower.includes('kal') || rawLower.includes('tomorrow')) {
    targetDay += 1;
    hasExplicitDate = true;
  } else if (rawLower.includes('aaj') || rawLower.includes('today') || rawLower.includes('tonight')) {
    hasExplicitDate = true;
  }

  // Check specific date e.g. "25 august", "25 aug", "25/08"
  const specificDateMatch = rawLower.match(/(\d{1,2})\s*(august|aug|september|sep|october|oct|november|nov|december|dec|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|\/|-)/i);
  if (specificDateMatch) {
    const dayNum = parseInt(specificDateMatch[1], 10);
    const monthStr = specificDateMatch[2].toLowerCase();

    const monthMap = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };

    if (monthMap[monthStr] !== undefined) {
      targetDay = dayNum;
      targetMonth = monthMap[monthStr];
      hasExplicitDate = true;
    }
  }

  // 4. Relative Time Detection (e.g. "2 ghante baad", "30 minute baad", "2 hours later")
  const relativeMatch = rawLower.match(/(\d+)\s*(ghante|ghanta|hour|hours|minute|minutes|min|mins)\s*(baad|later)/i);
  if (relativeMatch) {
    const qty = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const nowUTC = new Date();

    if (unit.startsWith('ghant') || unit.startsWith('hour')) {
      const scheduledUTC = new Date(nowUTC.getTime() + qty * 60 * 60 * 1000);
      return {
        success: true,
        type,
        clientName,
        scheduledAt: scheduledUTC,
        formattedIST: scheduledUTC.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        title: `${type} for ${clientName || 'Client'}`,
        description: text,
        isAmbiguous: false
      };
    } else {
      const scheduledUTC = new Date(nowUTC.getTime() + qty * 60 * 1000);
      return {
        success: true,
        type,
        clientName,
        scheduledAt: scheduledUTC,
        formattedIST: scheduledUTC.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        title: `${type} for ${clientName || 'Client'}`,
        description: text,
        isAmbiguous: false
      };
    }
  }

  // 5. Time Keyword / Clock Detection
  // Check explicit 12-hour/24-hour e.g. "8:00 pm", "8 pm", "8:30 am", "8 baje", "20:00"
  const timeMatch = rawLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)?/i);
  
  if (rawLower.includes('subah') || rawLower.includes('morning')) {
    detectedHours = 10;
    hasExplicitTime = true;
  } else if (rawLower.includes('dopahar') || rawLower.includes('afternoon')) {
    detectedHours = 14;
    hasExplicitTime = true;
  } else if (rawLower.includes('shaam') || rawLower.includes('evening')) {
    detectedHours = 18;
    hasExplicitTime = true;
  } else if (rawLower.includes('raat') || rawLower.includes('tonight') || rawLower.includes('night')) {
    detectedHours = 20;
    hasExplicitTime = true;
  }

  // Parse clock numbers if present (ignore currency values e.g. ₹5,000 or 5,000)
  const textWithoutCurrency = rawLower.replace(/₹\s*\d+(?:,\d+)*(?:\.\d+)?/gi, '').replace(/\b\d{1,2},\d{3}\b/g, '');
  const clockMatch = textWithoutCurrency.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)\b/i) || textWithoutCurrency.match(/\b(\d{1,2}):(\d{2})\b/i);

  if (clockMatch && !textWithoutCurrency.includes('ghante') && !textWithoutCurrency.includes('minute')) {
    let num = parseInt(clockMatch[1], 10);
    const mins = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
    const meridian = clockMatch[3] ? clockMatch[3].toLowerCase() : null;

    if (num >= 1 && num <= 24) {
      detectedMinutes = mins;
      hasExplicitTime = true;

      if (meridian === 'pm' && num < 12) num += 12;
      else if (meridian === 'am' && num === 12) num = 0;
      else if (meridian === 'baje' || !meridian) {
        if (rawLower.includes('raat') || rawLower.includes('shaam') || type === 'DEMO' || num < 8) {
          if (num < 12) num += 12; // Infer 8 PM for demo / raat
        }
      }
      detectedHours = num;
    }
  }

  // 6. Handle Ambiguity & Missing Fields
  if (!hasExplicitTime && detectedHours === null) {
    return {
      success: false,
      isAmbiguous: true,
      missingField: 'TIME',
      clientName,
      type,
      question: `${hasExplicitDate ? 'Kal' : 'Reminder'} kis time lagau? (e.g. 8 PM ya 10 AM)`
    };
  }

  // Construct Final Scheduled UTC Date
  const finalScheduledUTC = createISTDate(targetYear, targetMonth, targetDay, detectedHours ?? 10, detectedMinutes);

  return {
    success: true,
    type,
    clientName,
    scheduledAt: finalScheduledUTC,
    formattedIST: finalScheduledUTC.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }),
    title: `${type.replace('_', ' ')}: ${clientName || 'Client Follow-up'}`,
    description: text,
    isAmbiguous: false
  };
}

module.exports = {
  parseNaturalLanguageReminder,
  createISTDate,
  getISTNow
};
