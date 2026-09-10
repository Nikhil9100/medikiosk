#!/usr/bin/env node
// Idempotent staff seed for the local development database.
// Demo accounts (see README "Local development"):
//   doctor@medikiosk.local  /  doctor-demo-2026   (DOCTOR)
//   hospital@medikiosk.local / hospital-demo-2026 (HOSPITAL)
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { Client } from "pg";

const dsn = process.env.DATABASE_URL;
if (!dsn) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const staff = [
  { email: "doctor@medikiosk.local", display_name: "Dr. Ananya Iyer", title: "Consultant Physician", role: "DOCTOR", password: "doctor-demo-2026" },
  { email: "hospital@medikiosk.local", display_name: "Meera Kulkarni", title: "OPD Operations Lead", role: "HOSPITAL", password: "hospital-demo-2026" },
];

const client = new Client({ connectionString: dsn });
await client.connect();
try {
  await client.query("BEGIN");
  for (const member of staff) {
    const passwordHash = hashPassword(member.password);
    await client.query(
      `INSERT INTO staff (email, display_name, title, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             title = EXCLUDED.title,
             role = EXCLUDED.role,
             active = true`,
      [member.email, member.display_name, member.title, member.role, passwordHash],
    );
    console.log(`staff seeded: ${member.email} (${member.role})`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
