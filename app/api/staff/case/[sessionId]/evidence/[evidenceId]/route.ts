import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    verificationState: z.enum(["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"]),
    note: z.string().max(2000).optional(),
  })
  .strict();

/**
 * PATCH /api/staff/case/[sessionId]/evidence/[evidenceId]
 *
 * Physician verification of one extracted evidence item. This is the ONLY
 * path that can set VERIFIED: patient ACCEPTED review remains a separate,
 * lower-privilege state. Every decision is audited with the doctor identity.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; evidenceId: string }> },
) {
  const { sessionId, evidenceId } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (staff.role !== "DOCTOR") {
    return NextResponse.json({ error: "Only doctors can verify evidence" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification" }, { status: 400 });
  }
  const { verificationState, note } = parsed.data;

  try {
    const result = await withStaffTx(async (client) => {
      const owned = await client.query(
        `SELECT session_id FROM clinical_evidence WHERE id = $1`,
        [evidenceId],
      );
      if (owned.rows.length === 0) return { code: "NOT_FOUND" as const };
      if (owned.rows[0].session_id !== sessionId) return { code: "MISMATCH" as const };

      await client.query(
        `UPDATE clinical_evidence
            SET verification_state = $1, verified_by = $2, verified_at = now(), verification_note = $3
          WHERE id = $4 AND session_id = $5`,
        [verificationState, staff.id, note ?? null, evidenceId, sessionId],
      );
      await writeAudit(client, { type: "STAFF", id: staff.id }, "evidence.verified", {
        type: "evidence",
        id: evidenceId,
      }, { caseId: sessionId, state: verificationState, note: note ?? null });

      const updated = await client.query(`SELECT * FROM clinical_evidence WHERE id = $1`, [evidenceId]);
      return { code: "OK" as const, row: updated.rows[0] as Record<string, unknown> | undefined };
    });

    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    if (result.code === "MISMATCH") return NextResponse.json({ error: "Evidence does not belong to this case" }, { status: 400 });

    const row = result.row;
    return NextResponse.json({
      evidence: {
        id: row?.id,
        category: row?.category,
        verificationState: row?.verification_state,
        verifiedBy: row?.verified_by,
        verifiedAt: row?.verified_at ? new Date(row.verified_at as string | Date).toISOString() : null,
        verificationNote: row?.verification_note ?? null,
      },
    });
  } catch (error) {
    console.error("Evidence verification failed:", error);
    return NextResponse.json({ error: "Unable to update evidence" }, { status: 500 });
  }
}
