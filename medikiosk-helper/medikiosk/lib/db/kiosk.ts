import "server-only";

import type { PoolClient } from "pg";

export type KioskStatus = "ONLINE" | "ATTENTION" | "OFFLINE";

export type KioskInfo = {
  kioskId: string;
  label: string | null;
  lastSeen: Date;
  activeSessionId: string | null;
  lastActivity: string | null;
  status: KioskStatus;
  /** An in-progress session whose kiosk is no longer reporting. Data is
   *  preserved durably; only the device is unreachable. */
  sessionInterrupted: boolean;
};

const ONLINE_MS = 45 * 1000;
const ATTENTION_MS = 3 * 60 * 1000;

/**
 * Upsert semantics WITHOUT `ON CONFLICT DO UPDATE`: this build of PostgreSQL
 * evaluates the UPDATE arm's RLS policy even on the non-conflicting insert
 * path and rejects it (42501), while plain INSERT and plain UPDATE each pass
 * their own policy fine (verified live). So: try the plain insert; on the
 * primary-key conflict, roll back to a savepoint and run a plain update.
 * Both arms are scoped to the device by the same `app.kiosk_id` GUC.
 */
export async function recordHeartbeat(
  client: PoolClient,
  kioskId: string,
  label: string | null,
  activeSessionId: string | null,
  lastActivity: string | null,
): Promise<void> {
  await client.query(`SAVEPOINT medikiosk_heartbeat_insert`);
  try {
    await client.query(
      `INSERT INTO kiosk_heartbeats (kiosk_id, label, last_seen, active_session_id, last_activity)
       VALUES ($1, $2, now(), $3, $4)`,
      [kioskId, label, activeSessionId, lastActivity],
    );
    return;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      await client.query(`ROLLBACK TO SAVEPOINT medikiosk_heartbeat_insert`);
    } else {
      throw error;
    }
  }
  await client.query(
    `UPDATE kiosk_heartbeats
        SET label = COALESCE($2, kiosk_heartbeats.label),
            last_seen = now(),
            active_session_id = COALESCE($3, kiosk_heartbeats.active_session_id),
            last_activity = COALESCE($4, kiosk_heartbeats.last_activity)
      WHERE kiosk_id = $1`,
    [kioskId, label, activeSessionId, lastActivity],
  );
}

/** Staff view of the kiosk network, derived from real heartbeat timestamps. */
export async function listKiosks(client: PoolClient): Promise<KioskInfo[]> {
  const result = await client.query(
    `SELECT kiosk_id, label, last_seen, active_session_id, last_activity
       FROM kiosk_heartbeats ORDER BY last_seen DESC`,
  );
  const now = Date.now();
  return result.rows.map((row) => {
    const lastSeen = new Date(row.last_seen as string | Date).getTime();
    const age = now - lastSeen;
    const status: KioskStatus = age < ONLINE_MS ? "ONLINE" : age < ATTENTION_MS ? "ATTENTION" : "OFFLINE";
    const activeSessionId = row.active_session_id as string | null;
    return {
      kioskId: row.kiosk_id as string,
      label: (row.label as string | null) ?? null,
      lastSeen: new Date(row.last_seen as string | Date),
      activeSessionId,
      lastActivity: (row.last_activity as string | null) ?? null,
      status,
      sessionInterrupted: status !== "ONLINE" && activeSessionId !== null,
    };
  });
}

/** Mark an offline kiosk's interrupted session as triaged (ops action). */
export async function clearInterruptedSession(client: PoolClient, kioskId: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE kiosk_heartbeats SET active_session_id = NULL WHERE kiosk_id = $1`,
    [kioskId],
  );
  return (result.rowCount ?? 0) > 0;
}
