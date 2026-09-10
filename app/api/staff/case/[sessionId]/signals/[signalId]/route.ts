import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    status: z.enum(["UNREVIEWED", "REVIEWED", "ESCALATED", "DISMISSED"]),
    note: z.string().max(2000).optional(),
  })
  .strict();

/**
 * PATCH /api/staff/case/[sessionId]/signals/[signalId]
 *
 * A safety signal is a review trigger, never a diagnosis. The doctor records
 * how it was handled (REVIEWED / ESCALATED / DISMISSED with a note).
 * DISMISSED requires a note so the reasoning is preserved.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; signalId: string }> },
) {
  const { sessionId, signalId } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid signal update" }, { status: 400 });
  }
  const { status, note } = parsed.data;
  if (status === "DISMISSED" && !note) {
    return NextResponse.json({ error: "A note is required to dismiss a safety signal" }, { status: 400 });
  }

  try {
    const result = await withStaffTx(async (client) => {
      const owned = await client.query(`SELECT session_id FROM safety_signals WHERE id = $1`, [signalId]);
      if (owned.rows.length === 0) return { code: "NOT_FOUND" as const };
      if (owned.rows[0].session_id !== sessionId) return { code: "MISMATCH" as const };

      await client.query(
        `UPDATE safety_signals
            SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3
          WHERE id = $4 AND session_id = $5`,
        [status, staff.id, note ?? null, signalId, sessionId],
      );
      await writeAudit(client, { type: "STAFF", id: staff.id }, "safety_signal.reviewed", {
        type: "signal",
        id: signalId,
      }, { caseId: sessionId, status, note: note ?? null });

      const updated = await client.query(`SELECT * FROM safety_signals WHERE id = $1`, [signalId]);
      return { code: "OK" as const, row: updated.rows[0] as Record<string, unknown> | undefined };
    });

    if (result.code === "NOT_FOUND") return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    if (result.code === "MISMATCH") return NextResponse.json({ error: "Signal does not belong to this case" }, { status: 400 });
    return NextResponse.json({
      signal: {
        id: result.row?.id,
        status: result.row?.status,
        reviewNote: result.row?.review_note ?? null,
        reviewedAt: result.row?.reviewed_at ? new Date(result.row.reviewed_at as string | Date).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Signal review failed:", error);
    return NextResponse.json({ error: "Unable to update signal" }, { status: 500 });
  }
}
