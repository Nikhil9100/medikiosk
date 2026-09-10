import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { closeSessionLifecycle, getCase } from "@/lib/db/cases";
import { PostgresDocumentRepository } from "@/lib/db/documents-pg";
import { SESSION_COOKIE } from "@/lib/db/session-scope";

/**
 * Kiosk hand-off: complete the session lifecycle and purge its transient
 * document bytes. Clinical case data (complaints, interview, evidence,
 * signals, chat) is PRESERVED for the doctor console — a reset is a device
 * hand-off, not a data deletion.
 */
export async function POST() {
  if (!databaseConfigured()) {
    return NextResponse.json(
      { error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  let deletedDocuments = 0;
  if (sessionId) {
    await withKioskTx(sessionId, async (client) => {
      const session = await getCase(client, sessionId);
      if (session && session.status === "ACTIVE") {
        const documents = new PostgresDocumentRepository(client);
        deletedDocuments = await documents.deleteBySessionId(sessionId);
        await closeSessionLifecycle(client, sessionId, { type: "PATIENT", id: sessionId });
      }
    }).catch(() => {});
  }

  const response = NextResponse.json({ reset: true, session: null, deletedDocuments });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
