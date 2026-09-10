import "server-only";

import type { PoolClient } from "pg";

export type AuditActor = { type: "PATIENT" | "STAFF" | "SYSTEM"; id?: string };

/**
 * Append an audit record inside the caller's transaction. Audit rows are
 * append-only and carry the actor identity; they never contain document
 * content or full clinical values beyond the targeted reference.
 */
export async function writeAudit(
  client: PoolClient,
  actor: AuditActor,
  action: string,
  target: { type?: string; id?: string },
  detail: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actor.type,
      actor.id ?? null,
      action,
      target.type ?? null,
      target.id ?? null,
      JSON.stringify(detail),
    ],
  );
}
