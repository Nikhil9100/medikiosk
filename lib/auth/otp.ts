import { randomInt } from "node:crypto";

export interface OtpEntry {
  code: string;
  phone: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

// In-memory store for OTPs (keyed by normalized identifier, e.g. phone or txnId)
const otpStore = new Map<string, OtpEntry>();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const MAX_ATTEMPTS = 5;
export const DEMO_OTP = "123456";

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

/**
 * Generates and records an OTP for a given phone number.
 */
export async function generatePhoneOtp(rawPhone: string): Promise<{ success: boolean; error?: string; retryAfter?: number; devOtp?: string }> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!isValidIndianMobile(phone)) {
    return { success: false, error: "Invalid 10-digit Indian mobile number." };
  }

  const existing = otpStore.get(phone);
  const now = Date.now();

  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    return { success: false, error: `Please wait ${remaining} seconds before requesting a new OTP.`, retryAfter: remaining };
  }

  // Generate 6-digit numeric OTP
  const code = randomInt(100000, 999999).toString();

  otpStore.set(phone, {
    code,
    phone,
    expiresAt: now + OTP_EXPIRY_MS,
    lastSentAt: now,
    attempts: 0,
  });

  return {
    success: true,
    devOtp: process.env.NODE_ENV !== "production" ? code : undefined,
  };
}

/**
 * Verifies the OTP submitted by the user.
 */
export async function verifyPhoneOtp(rawPhone: string, code: string): Promise<{ verified: boolean; error?: string }> {
  const phone = normalizePhoneNumber(rawPhone);
  const cleanCode = code.replace(/\D/g, "").trim();

  if (!cleanCode || cleanCode.length !== 6) {
    return { verified: false, error: "OTP must be 6 digits." };
  }

  // Development / Demo bypass code
  if (cleanCode === DEMO_OTP) {
    otpStore.delete(phone);
    return { verified: true };
  }

  const entry = otpStore.get(phone);
  if (!entry) {
    return { verified: false, error: "OTP expired or not found. Please request a new one." };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return { verified: false, error: "OTP has expired. Please request a new one." };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(phone);
    return { verified: false, error: "Too many failed attempts. Please request a new OTP." };
  }

  if (entry.code !== cleanCode) {
    entry.attempts += 1;
    const remaining = MAX_ATTEMPTS - entry.attempts;
    return { verified: false, error: `Incorrect OTP. ${remaining} attempt(s) remaining.` };
  }

  // OTP verified successfully
  otpStore.delete(phone);
  return { verified: true };
}
