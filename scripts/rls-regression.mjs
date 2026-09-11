// RLS regression tests (PostgreSQL, live DB).
//
// Guards against the PostgreSQL 17.10 (Debian) planner quirk where a raw
// `current_setting` GUC reference inside a command-scoped RLS write policy is
// constant-folded to a stale value at plan time, silently turning the kiosk
// heartbeat UPDATE into a 0-row no-op (kiosks stuck at OFFLINE in the
// hospital console). See the comment on kiosk_heartbeats_scope in
// db/schema.sql for the full history.
//
// Run: node scripts/rls-regression.mjs   (needs DATABASE_URL + DATABASE_ADMIN_URL)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

// Minimal .env.local loader (KEY=VALUE lines, no shell needed).
const envPath = resolve(process.cwd(), ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* rely on process env */
}

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!appUrl || !adminUrl) {
  console.error("FAIL - DATABASE_URL / DATABASE_ADMIN_URL not configured");
  process.exit(1);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const TEST_KIOSK = "KIOSK-RLS-REG-1";
const OTHER_KIOSK = "KIOSK-RLS-REG-2";

const admin = new Client({ connectionString: adminUrl });
await admin.connect();

try {
  // Scratch rows (owner bypasses RLS for DDL/DML setup).
  await admin.query(
    `INSERT INTO kiosk_heartbeats (kiosk_id, label, last_seen)
     VALUES ($1, 'rls-reg-1', now()), ($2, 'rls-reg-2', now())
     ON CONFLICT (kiosk_id) DO NOTHING`,
    [TEST_KIOSK, OTHER_KIOSK]
  );

  const app = new Client({ connectionString: appUrl });
  await app.connect();

  // 1. No GUC set: the app role sees nothing (no unscoped read).
  await app.query("BEGIN");
  let r = await app.query("SELECT kiosk_id FROM kiosk_heartbeats");
  await app.query("ROLLBACK");
  check("no GUC: app role sees zero kiosk rows", r.rowCount === 0, `saw ${r.rowCount}`);

  // 2. Worst-case fold scenario: this backend's FIRST plan above ran with no
  //    GUC. Now, in the same backend, set the kiosk GUC and verify the row is
  //    visible AND updatable (the historically broken path).
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.kiosk_id', $1, true)", [TEST_KIOSK]);
  r = await app.query("SELECT kiosk_id FROM kiosk_heartbeats");
  const visible = r.rows.map((row) => row.kiosk_id).sort();
  const u = await app.query(
    "UPDATE kiosk_heartbeats SET last_seen = now() WHERE kiosk_id = $1",
    [TEST_KIOSK]
  );
  await app.query("ROLLBACK");
  check(
    "kiosk GUC: own row visible (even after no-GUC plan on same backend)",
    JSON.stringify(visible) === JSON.stringify([TEST_KIOSK]),
    JSON.stringify(visible)
  );
  check("kiosk GUC: heartbeat UPDATE affects its own row", u.rowCount === 1, `rowCount=${u.rowCount}`);

  // 3. Cross-kiosk write isolation: a kiosk may not touch another device's row.
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.kiosk_id', $1, true)", [TEST_KIOSK]);
  const x = await app.query(
    "UPDATE kiosk_heartbeats SET last_activity = 'cross-write' WHERE kiosk_id = $1",
    [OTHER_KIOSK]
  );
  await app.query("ROLLBACK");
  check("kiosk GUC: cannot update another kiosk's row", x.rowCount === 0, `rowCount=${x.rowCount}`);

  // 4. Staff scope sees all kiosk rows.
  await app.query("BEGIN");
  await app.query("SELECT set_config('app.access_role', 'staff', true)");
  const s = await app.query("SELECT kiosk_id FROM kiosk_heartbeats WHERE kiosk_id IN ($1, $2)", [
    TEST_KIOSK,
    OTHER_KIOSK,
  ]);
  await app.query("ROLLBACK");
  check("staff: sees all kiosk rows", s.rowCount === 2, `rowCount=${s.rowCount}`);

  await app.end();
} catch (error) {
  check("rls regression suite completed without error", false, String(error?.message ?? error));
} finally {
  await admin
    .query("DELETE FROM kiosk_heartbeats WHERE kiosk_id IN ($1, $2)", [TEST_KIOSK, OTHER_KIOSK])
    .catch(() => {});
  await admin.end().catch(() => {});
}

if (failures > 0) {
  console.log(`\n${failures} RLS regression check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll RLS regression checks passed.");
