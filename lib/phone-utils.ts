/**
 * Client-safe Indian phone number validation and formatting utilities.
 */

/**
 * Normalizes Indian mobile number to 10 digits.
 * Accepts +91XXXXXXXXXX, 0XXXXXXXXXX, or XXXXXXXXXX
 */
export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Validates whether string is a valid 10-digit Indian mobile number.
 */
export function isValidIndianMobile(phone: string): boolean {
  const norm = normalizePhoneNumber(phone);
  return /^[6-9]\d{9}$/.test(norm);
}

/**
 * Masks a phone number for display (e.g. "+91 ******4321")
 */
export function maskPhoneNumber(phone: string): string {
  const norm = normalizePhoneNumber(phone);
  if (norm.length !== 10) return phone;
  return `+91 ******${norm.slice(-4)}`;
}
