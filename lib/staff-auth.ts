import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { writeAudit } from "@/lib/db/audit";

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const STAFF_COOKIE = "medikiosk_staff";
const SESSION_TTL_MS = 10 * 60 * 60 * 1000; // 10 hours, a working day

export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type StaffMember = {
  id: string;
  email: string;
  displayName: string;
  title: string | null;
  role: "DOCTOR" | "HOSPITAL";
  active: boolean;
};

function toStaffMember(row: Record<string, unknown>): StaffMember {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    title: (row.title as string | null) ?? null,
    role: row.role as StaffMember["role"],
    active: row.active as boolean,
  };
}

/** Authenticate a staff member and open a token-scoped session. */
export async function loginStaff(
  client: PoolClient,
  email: string,
  password: string,
): Promise<StaffMember | null> {
  const result = await client.query(
    `SELECT id, email, display_name, title, role, active, password_hash FROM staff WHERE email = $1`,
    [email.toLowerCase().trim()],
  );
  const row = result.rows[0] as (Record<string, unknown> & { password_hash: string }) | undefined;
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    return null;
  }
  const token = randomBytes(32).toString("hex");
  await client.query(
    `INSERT INTO staff_sessions (staff_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '10 hours')`,
    [row.id, createHash("sha256").update(token).digest("hex")],
  );
  await writeAudit(client, { type: "STAFF", id: row.id as string }, "staff.login", { type: "staff", id: row.id as string });
  const member = toStaffMember(row);
  (member as StaffMember & { token: string }).token = token;
  return member;
}

export async function getStaffFromToken(
  client: PoolClient,
  token: string | undefined,
): Promise<StaffMember | null> {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await client.query(
    `SELECT s.id, s.email, s.display_name, s.title, s.role, s.active
       FROM staff s
       JOIN staff_sessions ss ON ss.staff_id = s.id
      WHERE ss.token_hash = $1 AND ss.expires_at > now() AND s.active`,
    [tokenHash],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return toStaffMember({ ...row, title: (row.title as string | null) ?? null });
}

export async function logoutStaff(client: PoolClient, token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await client.query(`DELETE FROM staff_sessions WHERE token_hash = $1`, [tokenHash]);
}

export function setStaffCookie(response: Response, token: string) {
  (response as unknown as { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }).cookies.set(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearStaffCookie(response: Response) {
  (response as unknown as { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }).cookies.set(STAFF_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Resolve the authenticated staff member for a request, or null. Runs in a
 * staff-scoped transaction so RLS permits the token lookup.
 */
export async function getAuthenticatedStaff(): Promise<StaffMember | null> {
  const { withStaffTx } = await import("@/lib/db/pool");
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_COOKIE)?.value;
  if (!token) return null;
  try {
    return await withStaffTx((client) => getStaffFromToken(client, token));
  } catch {
    return null;
  }
}

export async function getStaffToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(STAFF_COOKIE)?.value ?? null;
}
