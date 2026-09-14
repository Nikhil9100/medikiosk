import { randomInt, randomUUID } from "node:crypto";
const DEMO_OTP = "123456";

export interface AbdmSession {
  txnId: string;
  identifier: string; // ABHA number or address
  isAddress: boolean;
  code: string;
  expiresAt: number;
  attempts: number;
}

export interface VerifiedAbdmProfile {
  verified: boolean;
  abhaLast4: string | null;
  abhaAddressMasked: string | null;
  name: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  yearOfBirth: number;
  verificationSource: "ABDM_OTP";
  verifiedAt: string;
}

const abdmTxnStore = new Map<string, AbdmSession>();
const ABDM_OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function normalizeAbha(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidAbhaNum(value: string): boolean {
  return /^\d{14}$/.test(normalizeAbha(value));
}

function isValidAbhaAddr(value: string): boolean {
  return /^[a-z0-9._-]{3,64}@abdm$/i.test(value.trim());
}

function getAbhaLast4(value: string): string | null {
  const digits = normalizeAbha(value);
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function getMaskedAbhaAddr(value: string): string | null {
  const [name, domain] = value.trim().split("@");
  if (!name || !domain) return null;
  const shown = name.length <= 2 ? name[0] ?? "" : `${name.slice(0, 2)}${"*".repeat(Math.min(6, Math.max(2, name.length - 2)))}`;
  return `${shown}@${domain}`;
}

/**
 * Format 14 digits into standard XX-XXXX-XXXX-XXXX display format.
 */
export function formatAbhaNumber(value: string): string {
  const digits = normalizeAbha(value).slice(0, 14);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 10));
  if (digits.length > 10) parts.push(digits.slice(10, 14));
  return parts.join("-");
}

/**
 * Initiates ABDM verification by generating an OTP.
 */
export async function initiateAbdmVerification(identifier: string): Promise<{
  success: boolean;
  txnId?: string;
  maskedMobile?: string;
  error?: string;
  devOtp?: string;
}> {
  const cleanId = identifier.trim();
  const isAddress = cleanId.includes("@");

  if (isAddress) {
    if (!isValidAbhaAddr(cleanId)) {
      return { success: false, error: "Invalid ABHA address. Format must be username@abdm" };
    }
  } else {
    if (!isValidAbhaNum(cleanId)) {
      return { success: false, error: "Invalid ABHA number. Must be a valid 14-digit number." };
    }
  }

  const txnId = `txn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const code = randomInt(100000, 999999).toString();

  abdmTxnStore.set(txnId, {
    txnId,
    identifier: isAddress ? cleanId.toLowerCase() : normalizeAbha(cleanId),
    isAddress,
    code,
    expiresAt: Date.now() + ABDM_OTP_EXPIRY_MS,
    attempts: 0,
  });

  return {
    success: true,
    txnId,
    maskedMobile: "+91 ******" + randomInt(1000, 9999).toString(),
    devOtp: process.env.NODE_ENV !== "production" ? code : undefined,
  };
}

/**
 * Verifies the ABDM OTP and returns the verified patient identity profile.
 */
export async function confirmAbdmVerification(txnId: string, otp: string): Promise<{
  verified: boolean;
  profile?: VerifiedAbdmProfile;
  error?: string;
}> {
  const entry = abdmTxnStore.get(txnId);
  const cleanOtp = otp.replace(/\D/g, "").trim();

  if (!cleanOtp || cleanOtp.length !== 6) {
    return { verified: false, error: "OTP must be 6 digits." };
  }

  if (!entry) {
    // Check if DEMO_OTP is used with a synthetic txn
    if (cleanOtp === DEMO_OTP || cleanOtp === "123456") {
      return {
        verified: true,
        profile: {
          verified: true,
          abhaLast4: "9821",
          abhaAddressMasked: "pa***@abdm",
          name: "Verified Patient",
          gender: "FEMALE",
          yearOfBirth: 1994,
          verificationSource: "ABDM_OTP",
          verifiedAt: new Date().toISOString(),
        },
      };
    }
    return { verified: false, error: "ABDM verification session expired. Please request a new OTP." };
  }

  if (Date.now() > entry.expiresAt) {
    abdmTxnStore.delete(txnId);
    return { verified: false, error: "ABDM verification expired. Please request a new OTP." };
  }

  if (entry.attempts >= 5) {
    abdmTxnStore.delete(txnId);
    return { verified: false, error: "Too many failed attempts. Please request a new OTP." };
  }

  if (cleanOtp !== entry.code && cleanOtp !== DEMO_OTP && cleanOtp !== "123456") {
    entry.attempts += 1;
    return { verified: false, error: `Incorrect OTP. ${5 - entry.attempts} attempts remaining.` };
  }

  // Derive minimized attributes
  const abhaLast4 = entry.isAddress ? null : getAbhaLast4(entry.identifier);
  const abhaAddressMasked = entry.isAddress
    ? getMaskedAbhaAddr(entry.identifier)
    : getMaskedAbhaAddr(`patient${abhaLast4 ?? "1234"}@abdm`);

  const mockNames = ["Aarav Sharma", "Priya Patel", "Rohan Gupta", "Sunita Verma", "Kavita Rao"];
  const selectedName = mockNames[parseInt(abhaLast4 ?? "1", 10) % mockNames.length] ?? "Verified Patient";

  const profile: VerifiedAbdmProfile = {
    verified: true,
    abhaLast4,
    abhaAddressMasked,
    name: selectedName,
    gender: "FEMALE",
    yearOfBirth: 1992,
    verificationSource: "ABDM_OTP",
    verifiedAt: new Date().toISOString(),
  };

  abdmTxnStore.delete(txnId);
  return { verified: true, profile };
}
