import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { getCase, transitionCase } from "@/lib/db/cases";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const NoteSchema = z
  .object({
    note: z.string().min(1).max(4000),
    referred: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/staff/case/[sessionId]/consultation/complete
 *
 * Complete the consultation: IN_CONSULTATION -> COMPLETED. A consultation
 * note is REQUIRED — the record must say what the physician concluded.
 */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (staff.role !== "DOCTOR") {
    return NextResponse.json({ error: "Only doctors can complete consultations" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A consultation note is required to complete" }, { status: 400 });
  }

  try {
    const result = await withStaffTx(async (client) => {
      const current = await getCase(client, sessionId);
      if (!current) return { code: "NOT_FOUND" as const };
      if (current.caseStatus !== "IN_CONSULTATION") {
        return { code: "INVALID_STATE" as const, current: current.caseStatus };
      }
      await transitionCase(client, sessionId, "COMPLETED", {
        type: "STAFF",
        id: staff.id,
      }, { referred: parsed.data.referred ?? false });
      await client.query(
        `UPDATE consultations
            SET status = 'COMPLETED', completed_at = now(), note = COALESCE(note, '') || $1
          WHERE session_id = $2 AND doctor_id = $3 AND status = 'IN_PROGRESS'`,
        [parsed.data.note, sessionId, staff.id],
      );
      await writeAudit(client, { type: "STAFF", id: staff.id }, "consultation.completed", {
        type: "case",
        id: current.caseId,
      }, { referred: parsed.data.referred ?? false });
      return { code: "OK" as const, caseId: current.caseId };
    });

    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (result.code === "INVALID_STATE") {
      return NextResponse.json({ error: `Case is not in consultation (current: ${result.current})` }, { status: 409 });
    }
    return NextResponse.json({ caseId: result.caseId, caseStatus: "COMPLETED" });
  } catch (error) {
    console.error("Consultation completion failed:", error);
    return NextResponse.json({ error: "Unable to complete consultation" }, { status: 500 });
  }
}
