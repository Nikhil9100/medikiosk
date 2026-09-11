import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const NoteSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

/** POST /api/staff/case/[sessionId]/notes — add a clinical note (any staff role). */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (staff.role !== "DOCTOR") {
    return NextResponse.json({ error: "Physician role required" }, { status: 403 });
  }
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  try {
    const note = await withStaffTx(async (client) => {
      const exists = await client.query(`SELECT id FROM patient_sessions WHERE id = $1`, [sessionId]);
      if (exists.rows.length === 0) return null;
      const result = await client.query(
        `INSERT INTO doctor_notes (session_id, author_id, body) VALUES ($1, $2, $3)
         RETURNING id, body, created_at, author_id`,
        [sessionId, staff.id, parsed.data.body],
      );
      await writeAudit(client, { type: "STAFF", id: staff.id }, "note.added", { type: "case", id: sessionId });
      return result.rows[0] as Record<string, unknown>;
    });
    if (!note) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    return NextResponse.json(
      { note: { id: note.id, body: note.body, authorName: staff.displayName, createdAt: (note.created_at as Date).toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Note add failed:", error);
    return NextResponse.json({ error: "Unable to add note" }, { status: 500 });
  }
}
