import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { getCase, transitionCase } from "@/lib/db/cases";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const NoteSchema = z.object({ note: z.string().max(4000).optional() }).strict();

/**
 * POST /api/staff/case/[sessionId]/consultation
 * Start the consultation: AWAITING_REVIEW / URGENT_REVIEW -> IN_CONSULTATION.
 */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (staff.role !== "DOCTOR") {
    return NextResponse.json({ error: "Only doctors can run consultations" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = NoteSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await withStaffTx(async (client) => {
      const current = await getCase(client, sessionId);
      if (!current) return { code: "NOT_FOUND" as const };
      if (current.caseStatus === "IN_CONSULTATION") return { code: "ALREADY" as const, caseId: current.caseId };
      if (current.caseStatus !== "AWAITING_REVIEW" && current.caseStatus !== "URGENT_REVIEW") {
        return { code: "INVALID_STATE" as const, current: current.caseStatus };
      }
      const updated = await transitionCase(client, sessionId, "IN_CONSULTATION", { type: "STAFF", id: staff.id });
      await client.query(
        `INSERT INTO consultations (session_id, doctor_id, note) VALUES ($1, $2, $3)`,
        [sessionId, staff.id, parsed.data.note ?? null],
      );
      await writeAudit(client, { type: "STAFF", id: staff.id }, "consultation.started", {
        type: "case",
        id: current.caseId,
      });
      return { code: "OK" as const, caseId: current.caseId, caseStatus: updated?.caseStatus ?? "IN_CONSULTATION" };
    });

    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (result.code === "ALREADY") return NextResponse.json({ caseId: result.caseId, caseStatus: "IN_CONSULTATION" });
    if (result.code === "INVALID_STATE") {
      return NextResponse.json({ error: `Case is not awaiting consultation (current: ${result.current})` }, { status: 409 });
    }
    return NextResponse.json({ caseId: result.caseId, caseStatus: result.caseStatus }, { status: 201 });
  } catch (error) {
    console.error("Consultation start failed:", error);
    return NextResponse.json({ error: "Unable to start consultation" }, { status: 500 });
  }
}


