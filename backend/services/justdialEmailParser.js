/**
 * ─────────────────────────────────────────────────────────────────────────────
 * justdialEmailParser.js — Enhanced & Secure Justdial Email Alert Parser
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Supported Senders (Case-Insensitive & Display-Name Normalized):
 *   - instantemail@justdial.com
 *   - lead-alerts@justdial.com
 *   - noreply@justdial.com
 *   - info@justdial.com
 *
 * Features:
 *   - Validates authenticated email address (never trusts display-name alone)
 *   - Checks SPF/DKIM/DMARC headers if provided by email gateway
 *   - Normalizes 10-digit Indian phone (+91, 91, 0, spaces, dashes)
 *   - Decodes HTML entities and handles plain text + HTML
 *   - Never logs raw email body or unmasked sensitive data
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const APPROVED_SENDERS = [
  'instantemail@justdial.com',
  'lead-alerts@justdial.com',
  'noreply@justdial.com',
  'info@justdial.com'
];

/**
 * Extract true email address from header, ignoring display names
 * e.g. "JustDial <instantemail@justdial.com>" -> "instantemail@justdial.com"
 *      "\"JustDial Support\" <instantemail@justdial.com>" -> "instantemail@justdial.com"
 */
function extractEmailAddress(fromHeader) {
  if (!fromHeader) return '';
  const str = String(fromHeader).trim();
  const angleMatch = str.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    return angleMatch[1].trim().toLowerCase();
  }
  // If no angle brackets, strip quotes and whitespace
  return str.replace(/^["'\s]+|["'\s]+$/g, '').toLowerCase();
}

/**
 * Validate authenticated sender against allowlist
 */
function isValidSender(fromHeader) {
  const email = extractEmailAddress(fromHeader);
  return APPROVED_SENDERS.includes(email);
}

/**
 * Validate SPF/DKIM/DMARC headers if provided by inbound email gateway
 */
function validateAuthenticationHeaders(headers = {}) {
  const spf = headers['received-spf'] || headers['x-spf'] || headers['spf'] || '';
  const dkim = headers['dkim-signature'] || headers['x-dkim'] || headers['x-sendgrid-auth'] || '';
  const dmarc = headers['x-mailgun-dmarc-status'] || headers['dmarc'] || '';

  const combined = `${spf} ${dkim} ${dmarc}`.toLowerCase();
  if (combined.includes('fail') || combined.includes('softfail') || combined.includes('reject')) {
    return { valid: false, reason: `AUTH_HEADER_FAILED: Authentication check failed (${combined.slice(0, 100)})` };
  }
  return { valid: true };
}

/**
 * Decode HTML entities and strip markup
 */
function cleanHtmlAndEntities(str) {
  if (!str) return '';
  let text = String(str);

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>/gi, '  ');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&copy;/gi, '©');

  return text;
}

/**
 * Normalize phone string to 10-digit Indian mobile number
 */
function normalizeIndianPhone(phoneStr) {
  if (!phoneStr) return null;
  let digits = String(phoneStr).replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
}

/**
 * Mask phone number for non-sensitive output (e.g., 9876543210 -> 98******10)
 */
function maskPhone(phone) {
  if (!phone || phone.length < 10) return 'XX******XX';
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

/**
 * Mask email address for non-sensitive output
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return 'X***@X.com';
  const parts = email.split('@');
  return `${parts[0][0]}***@${parts[1]}`;
}

/**
 * Parse raw email payload (HTML or Plain Text) into structured Justdial Lead Object
 */
function parseJustdialEmail(rawEmail) {
  const fromHeader = rawEmail.from || rawEmail.sender || rawEmail.From || '';

  if (!isValidSender(fromHeader)) {
    const parsedAddr = extractEmailAddress(fromHeader);
    throw new Error(`REJECTED_SENDER: Email sender '${maskEmail(parsedAddr)}' is not in approved Justdial allowlist.`);
  }

  // SPF / DKIM verification if headers present
  if (rawEmail.headers) {
    const authCheck = validateAuthenticationHeaders(rawEmail.headers);
    if (!authCheck.valid) {
      throw new Error(authCheck.reason);
    }
  }

  const rawBody = rawEmail.html || rawEmail.text || rawEmail.body || '';
  if (!rawBody || String(rawBody).trim().length === 0) {
    throw new Error('MALFORMED_EMAIL: Email body is empty.');
  }

  const text = cleanHtmlAndEntities(rawBody);
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  let externalLeadId = null;
  let name = null;
  let phone = null;
  let email = null;
  let area = null;
  let city = null;
  let enquiry = null;
  let receivedAt = null;

  // 1. Extract Lead / Enquiry ID
  const leadIdMatch = text.match(/(?:Enquiry\s*ID|Ref\s*No|Ref\s*ID|Lead\s*ID|Lead\s*Ref)\s*[:#-]?\s*([A-Za-z0-9_-]+)/i) ||
                      text.match(/JD[_-]?(?:ENQ|LEAD)?[_-]?([A-Za-z0-9_-]{4,})/i);
  if (leadIdMatch) {
    externalLeadId = leadIdMatch[1].trim();
  }

  // 2. Extract Name
  const nameMatch = text.match(/(?:Name|Caller|Client|Lead\s*Name|User)\s*:\s*([^\n\r]+)/i);
  if (nameMatch) {
    let candidate = nameMatch[1].trim();
    candidate = candidate.split(/(?:Mobile|Phone|Email|Contact|Location|City)/i)[0].trim();
    if (candidate && candidate.length > 1 && !/^\d+$/.test(candidate)) {
      name = candidate;
    }
  }

  // 3. Extract Phone
  const phoneMatch = text.match(/(?:Mobile|Phone|Contact|Mobile\s*No|Cell)\s*:\s*([+\d\s-]{10,20})/i) ||
                     text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  if (phoneMatch) {
    const rawPhone = phoneMatch[1] || phoneMatch[0];
    phone = normalizeIndianPhone(rawPhone);
  }

  if (!phone) {
    for (const line of lines) {
      const p = normalizeIndianPhone(line);
      if (p) {
        phone = p;
        break;
      }
    }
  }

  // 4. Extract Email (Optional)
  const emailMatch = text.match(/(?:Email|E-mail)\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                      text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    const candidate = emailMatch[1].trim();
    if (!APPROVED_SENDERS.includes(candidate.toLowerCase()) && !candidate.includes('justdial.com')) {
      email = candidate.toLowerCase();
    }
  }

  // 5. Extract Address / Area
  const areaMatch = text.match(/(?:Location|Area|Address|Locality)\s*:\s*([^\n\r]+)/i);
  if (areaMatch) {
    area = areaMatch[1].trim();
  }

  // 6. Extract City
  const cityMatch = text.match(/(?:City|State)\s*:\s*([^\n\r]+)/i);
  if (cityMatch) {
    city = cityMatch[1].trim();
  }

  // 7. Extract Category / Enquiry
  const enquiryMatch = text.match(/(?:Requirement|Category|Service|Enquiry|Interested\s*In|Details)\s*:\s*([^\n\r]+)/i);
  if (enquiryMatch) {
    enquiry = enquiryMatch[1].trim();
  }

  // 8. Extract Received Date/Time
  const dateMatch = text.match(/(?:Date|Received|Time)\s*:\s*([^\n\r]+)/i);
  if (dateMatch) {
    const d = new Date(dateMatch[1].trim());
    if (!isNaN(d.getTime())) {
      receivedAt = d;
    }
  }

  if (!receivedAt && rawEmail.date) {
    const d = new Date(rawEmail.date);
    if (!isNaN(d.getTime())) receivedAt = d;
  }

  if (!receivedAt) {
    receivedAt = new Date();
  }

  if (!phone) {
    throw new Error('MALFORMED_EMAIL: Could not extract valid 10-digit Indian phone number from email.');
  }

  if (!name) {
    name = `Justdial Lead ${phone.slice(-4)}`;
  }

  const combinedLocation = [area, city].filter(Boolean).join(', ') || city || area || null;

  return {
    externalLeadId: externalLeadId || `JD-${Date.now()}-${phone.slice(-4)}`,
    name,
    phone,
    email: email || null,
    city: combinedLocation,
    enquiry: enquiry || 'Justdial Enquiry',
    receivedAt,
    source: 'Justdial'
  };
}

module.exports = {
  APPROVED_SENDERS,
  extractEmailAddress,
  isValidSender,
  validateAuthenticationHeaders,
  normalizeIndianPhone,
  maskPhone,
  maskEmail,
  cleanHtmlAndEntities,
  parseJustdialEmail
};
