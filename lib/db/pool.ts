import "server-only";

import { Pool, type PoolClient } from "pg";

/**
 * Durable PostgreSQL access for MediKiosk.
 *
 * Two connection strings:
 *  - DATABASE_URL       : the application role (medikiosk_app). Every DML query
 *                         runs under forced row-level security.
 *  - DATABASE_ADMIN_URL : the owner role (medikiosk_owner), used ONLY to apply
 *                         idempotent DDL during bootstrap/auto-heal.
 *
 * When DATABASE_URL is absent the app reports the database as unavailable and
 * callers must surface an honest NOT_CONFIGURED/UNAVAILABLE state — they must
 * never fall back to silently keeping clinical state in module memory.
 */

const poolCache = new Map<string, Pool>();

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getAppPool(): Pool {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    throw new Error("DATABASE_URL is not configured");
  }
  let pool = poolCache.get(dsn);
  if (!pool) {
    pool = new Pool({
      connectionString: dsn,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", () => {
      // Pool-level errors are surfaced per-query; avoid process crashes.
    });
    poolCache.set(dsn, pool);
  }
  return pool;
}

/**
 * Run `fn` inside a transaction with the row-scoping GUCs set for a kiosk
 * patient session. The GUCs drive the forced RLS policies, so every query in
 * the transaction is restricted to rows belonging to `sessionId` (plus the
 * session row itself).
 */
export async function withKioskTx<T>(
  sessionId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config(..., true) = transaction-local. (SET does not accept bound
    // parameters in the extended protocol.)
    await client.query("SELECT set_config('app.current_session', $1, true)", [sessionId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Same as withKioskTx but for creating a brand-new session: the row does not
 * exist yet, so scope by the server-generated owner id instead.
 */
export async function withNewSessionTx<T>(
  ownerUuid: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_owner', $1, true)", [ownerUuid]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Run `fn` as authenticated staff (doctor or hospital operations). */
export async function withStaffTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.access_role = 'staff'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` with the kiosk-device identity for heartbeat writes. The heartbeat
 * RLS policy permits a device to insert/update only its own kiosk_id row.
 */
export async function withKioskDeviceTx<T>(
  kioskId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getAppPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.kiosk_id', $1, true)", [kioskId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Apply the idempotent schema using the admin (owner) connection. Safe to call
 * at server startup: the DDL in db/schema.sql uses IF NOT EXISTS / DROP POLICY
 * IF EXISTS guards, so an already-initialized database is left unchanged.
 */
export async function ensureSchema(): Promise<boolean> {
  const adminDsn = process.env.DATABASE_ADMIN_URL;
  if (!adminDsn) return false;
  const { Client } = await import("pg");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const schemaPath = path.resolve(process.cwd(), "db", "schema.sql");
  const client = new Client({ connectionString: adminDsn });
  try {
    await client.connect();
    await client.query(fs.readFileSync(schemaPath, "utf8"));
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}
