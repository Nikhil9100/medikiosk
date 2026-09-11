import "server-only";

import { cookies } from "next/headers";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { getCase, type CaseRecord } from "@/lib/db/cases";

export const SESSION_COOKIE = "medikiosk_session";

/**
 * Resolve the kiosk patient session for the current request.
 *
 * The session id travels in an HTTP-only cookie set by the server; the
 * database is the single source of truth. The lookup runs inside a
 * session-scoped transaction, so even a forged cookie value can only ever
 * see rows that RLS admits for that session.
 *
 * Returns null when: the database is unconfigured, there is no cookie, the
 * session does not exist, or it is expired/completed.
 */
export async function getActiveKioskSession(): Promise<CaseRecord | null> {
  if (!databaseConfigured()) return null;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  try {
    return await withKioskTx(sessionId, async (client) => {
      const session = await getCase(client, sessionId);
      if (!session) return null;
      let live = session;
      if (session.status === "ACTIVE" && session.expiresAt.getTime() <= Date.now()) {
        await client.query(
          `UPDATE patient_sessions SET status = 'EXPIRED'
            WHERE id = $1 AND status = 'ACTIVE' AND expires_at <= now()`,
          [sessionId],
        );
        live = { ...session, status: "EXPIRED" as const };
      }
      // Only truly active, unexpired sessions may drive patient-scoped APIs.
      // Expired/completed sessions are refused here; the canonical
      // GET /api/patient/session endpoint distinguishes them and returns 410.
      if (live.status !== "ACTIVE") return null;
      return live;
    });
  } catch {
    return null;
  }
}
