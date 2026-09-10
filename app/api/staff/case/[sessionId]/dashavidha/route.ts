import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const OBSERVATIONS = ["shabda", "roop", "sparsha", "purana", "prakriti", "vrikriti", "vikriti", "sthana"];

const PatchSchema = z
  .object({
    observation: z.enum(["shabda", "roop", "sparsha", "purana", "prakriti", "vrikriti", "vikriti", "sthana"]),
    value: z.string().max(500).nullable().optional(),
    state: z.enum(["NOT_ASSESSED", "OBSERVED", "NOT_APPLICABLE"]),
    note: z.string().max(500).optional(),
  })
  .strict();

/**
 * PATCH /api/staff/case/[sessionId]/dashavidha
 *
 * Record ONE Dashavidha Pariksha observation. AYUSH observations are entered
 * by the physician (provenance DOCTOR) or left NOT_ASSESSED — they are never
 * inferred or fabricated by the system.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Staff storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid observation" }, { status: 400 });
  }
  const { observation, state } = parsed.data;
  if (state === "OBSERVED" && !parsed.data.value) {
    return NextResponse.json({ error: "An observed value is required" }, { status: 400 });
  }
  void OBSERVATIONS;

  try {
    const record = await withStaffTx(async (client) => {
      const exists = await client.query(`SELECT id FROM patient_sessions WHERE id = $1`, [sessionId]);
      if (exists.rows.length === 0) return null;
      const result = await client.query(
        `INSERT INTO dashavidha_observations (session_id, observation, value, state, provenance, recorded_by, recorded_at, note)
         VALUES ($1, $2, $3, $4, 'DOCTOR', $5, now(), $6)
         ON CONFLICT (session_id, observation) DO UPDATE SET
           value = EXCLUDED.value,
           state = EXCLUDED.state,
           provenance = EXCLUDED.provenance,
           recorded_by = EXCLUDED.recorded_by,
           recorded_at = now(),
           note = EXCLUDED.note
         RETURNING observation, value, state, provenance, note, recorded_at, recorded_by`,
        [sessionId, observation, state === "OBSERVED" ? parsed.data.value ?? null : null, state, staff.id, parsed.data.note ?? null],
      );
      await writeAudit(client, { type: "STAFF", id: staff.id }, "dashavidha.recorded", {
        type: "case",
        id: sessionId,
      }, { observation, state });
      return result.rows[0] as Record<string, unknown>;
    });
    if (!record) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    return NextResponse.json({
      dashavidha: {
        observation: record.observation,
        value: record.value,
        state: record.state,
        note: record.note,
        recordedBy: staff.displayName,
        recordedAt: record.recorded_at ? new Date(record.recorded_at as string | Date).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Dashavidha update failed:", error);
    return NextResponse.json({ error: "Unable to record observation" }, { status: 500 });
  }
}
