/**
 * PrivacyGuard masks phone numbers, emails, and student IDs from complaint text
 * in staff list views to preserve student anonymity while allowing supervisors to reveal.
 */

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    const firstTwo = digits.slice(0, 2);
    const lastTwo = digits.slice(-2);
    const stars = '*'.repeat(Math.max(4, digits.length - 4));
    return `${firstTwo}${stars}${lastTwo}`;
  }
  return phone;
}

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  if (user.length <= 2) {
    return `*@${domain}`;
  }
  const first = user.slice(0, 2);
  const last = user.slice(-1);
  return `${first}***${last}@${domain}`;
}

export function maskStudentId(id: string): string {
  if (id.length <= 4) return '***';
  const prefix = id.slice(0, 2);
  const suffix = id.slice(-2);
  return `${prefix}${'*'.repeat(id.length - 4)}${suffix}`;
}

/**
 * Mask all identified personal identifiable details in raw complaint text
 */
export function maskSensitiveText(text: string): string {
  if (!text) return text;

  // Mask emails: e.g. aarav2024@hostel.edu -> aa***4@hostel.edu
  let result = text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    (match) => maskEmail(match)
  );

  // Mask 10-digit Indian mobile numbers (with optional +91 or leading 0)
  result = result.replace(
    /(?:\+91[-\s]?)?[6-9]\d{9}\b/g,
    (match) => maskPhoneNumber(match)
  );

  // Mask student roll numbers / IDs: e.g. 2024CS0129, STU10492, CC2024-991
  result = result.replace(
    /\b(20[12]\d[A-Za-z]{2,4}\d{3,5}|STU\d{4,8}|ID[-_]?\d{4,8})\b/gi,
    (match) => maskStudentId(match)
  );

  return result;
}
