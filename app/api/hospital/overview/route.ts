import { NextResponse } from "next/server";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { getFunnelCounts, listQueueCases } from "@/lib/db/cases";
import { listKiosks, clearInterruptedSession } from "@/lib/db/kiosk";

export const runtime = "nodejs";

/**
 * GET /api/hospital/overview
 *
 * The operations picture, all derived from live state:
 *  - funnel counts (kiosk intake → pre-consultation → processing →
 *    consultation → completed) with wait time
 *  - case queue across statuses
 *  - kiosk device network (heartbeat-derived ONLINE/ATTENTION/OFFLINE)
 *  - document processing pipeline counts
 *  - staff on duty and consultation activity
 */
export async function GET() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Hospital storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const overview = await withStaffTx(async (client) => {
    const funnel = await getFunnelCounts(client);
    const cases = await listQueueCases(client);
    const kiosks = await listKiosks(client);

    const docPipeline = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM documents WHERE ocr_status = 'NOT_STARTED') AS uploaded,
        (SELECT COUNT(*)::int FROM documents WHERE ocr_status IN ('PENDING','PROCESSING')) AS ocr_processing,
        (SELECT COUNT(*)::int FROM documents WHERE ocr_status = 'COMPLETED' AND extraction_status = 'NOT_STARTED') AS ocr_complete,
        (SELECT COUNT(*)::int FROM documents WHERE extraction_status = 'PROCESSING') AS extraction_processing,
        (SELECT COUNT(*)::int FROM documents WHERE extraction_status = 'COMPLETED') AS awaiting_review,
        (SELECT COUNT(*)::int FROM documents WHERE ocr_status = 'FAILED' OR extraction_status IN ('FAILED','MALFORMED_RESPONSE')) AS failed`);

    const staffOnDuty = await client.query(
      `SELECT s.id, s.display_name, s.title, s.role,
              (SELECT COUNT(*)::int FROM consultations con
                 WHERE con.doctor_id = s.id AND con.status = 'IN_PROGRESS') AS active_consultations
         FROM staff s WHERE s.active ORDER BY s.role, s.display_name`,
    );
    const completedToday = await client.query(
      `SELECT COUNT(*)::int AS n FROM patient_sessions
        WHERE case_status = 'COMPLETED' AND completed_at >= date_trunc('day', now())`,
    );

    return {
      funnel,
      completedToday: completedToday.rows[0].n as number,
      cases: cases.map((c) => ({
        caseId: c.caseId,
        caseStatus: c.caseStatus,
        language: c.language,
        primaryComplaint: c.primaryComplaint,
        complaintCount: c.complaintCount,
        topSeverity: c.topSeverity,
        unreviewedSignals: c.unreviewedSignals,
        documentCount: c.documentCount,
        documentsProcessing: c.documentsProcessing,
        demoFlag: c.demoFlag,
        createdAt: c.createdAt.toISOString(),
        doctorName: c.doctorName,
      })),
      kiosks,
      docPipeline: docPipeline.rows[0] as Record<string, number>,
      staffOnDuty: staffOnDuty.rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        title: r.title,
        role: r.role,
        activeConsultations: r.active_consultations as number,
      })),
    };
  });

  return NextResponse.json({
    overview: {
      ...overview,
      funnel: {
        ...overview.funnel,
        // Bottleneck = stage with the most accumulation (live computation).
        bottleneck: (() => {
          const stages: Array<{ stage: string; count: number }> = [
            { stage: "KIOSK_INTAKE", count: overview.funnel.kiosk_intake },
            { stage: "PRE_CONSULTATION", count: overview.funnel.pre_consultation },
            { stage: "DOCUMENT_PROCESSING", count: overview.funnel.document_processing },
            { stage: "CONSULTATION", count: overview.funnel.in_consultation },
          ];
          const top = stages.reduce((a, b) => (b.count > a.count ? b : a), stages[0]);
          return top.count > 0 ? top.stage : null;
        })(),
      },
    },
  });
}

/** POST /api/hospital/overview/kiosks/[kioskId]/triage — mark interrupted session triaged. */
export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Hospital storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const staff = await getAuthenticatedStaff();
  if (!staff) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (staff.role !== "HOSPITAL") {
    return NextResponse.json({ error: "Hospital operations role required" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const kioskId = (body as { kioskId?: unknown })?.kioskId;
  if (typeof kioskId !== "string" || kioskId.length > 64) {
    return NextResponse.json({ error: "Invalid kiosk id" }, { status: 400 });
  }
  const cleared = await withStaffTx((client) => clearInterruptedSession(client, kioskId)).catch(() => false);
  return NextResponse.json({ cleared });
}
