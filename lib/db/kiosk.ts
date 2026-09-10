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

export async function recordHeartbeat(
  client: PoolClient,
  kioskId: string,
  label: string | null,
  activeSessionId: string | null,
  lastActivity: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO kiosk_heartbeats (kiosk_id, label, last_seen, active_session_id, last_activity)
     VALUES ($1, $2, now(), $3, $4)
     ON CONFLICT (kiosk_id) DO UPDATE
       SET label = COALESCE(EXCLUDED.label, kiosk_heartbeats.label),
           last_seen = now(),
           active_session_id = COALESCE(EXCLUDED.active_session_id, kiosk_heartbeats.active_session_id),
           last_activity = COALESCE(EXCLUDED.last_activity, kiosk_heartbeats.last_activity)`,
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
