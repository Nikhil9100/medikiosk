export type IdentityStatus = "NOT_PROVIDED" | "SELF_DECLARED" | "VERIFIED";
export function normalizeAbhaNumber(value: string) { return value.replace(/\D/g, ""); }
export function validAbhaNumber(value: string) { return /^\d{14}$/.test(normalizeAbhaNumber(value)); }
export function validAbhaAddress(value: string) { return /^[a-z0-9._-]{3,64}@abdm$/i.test(value.trim()); }
export function last4(value: string) { const digits = normalizeAbhaNumber(value); return digits.length >= 4 ? digits.slice(-4) : null; }
export function maskAbhaAddress(value: string) {
  const [name, domain] = value.trim().split("@");
  if (!name || !domain) return null;
  const shown = name.length <= 2 ? name[0] ?? "" : `${name.slice(0, 2)}${"*".repeat(Math.min(6, Math.max(2, name.length - 2)))}`;
  return `${shown}@${domain}`;
}
