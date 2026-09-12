import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-guard";
import { withStaffTx } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

function kioskStatus(lastSeen: Date) {
  const sec = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  return sec < 45 ? "ONLINE" : sec < 180 ? "ATTENTION" : "OFFLINE";
}

export async function GET() {
  const g = await requireStaff("HOSPITAL");
  if (g.response) return g.response;

  try {
    const overview = await withStaffTx(g.staff!.id, async (c) => {
      const [f, d, k, staff, cases] = await Promise.all([
        c.query(`
          SELECT 
            count(*) FILTER (WHERE case_status IN ('NEW', 'IN_PROGRESS'))::int AS kiosk_intake,
            count(*) FILTER (WHERE case_status = 'AWAITING_REVIEW')::int AS awaiting_review,
            count(*) FILTER (WHERE case_status = 'URGENT_REVIEW')::int AS urgent,
            count(*) FILTER (WHERE case_status = 'IN_CONSULTATION')::int AS in_consultation,
            (SELECT count(*)::int FROM consultations WHERE status = 'COMPLETED' AND completed_at::date = current_date) AS completed_today,
            coalesce(avg(extract(epoch FROM (now() - completed_at))) FILTER (WHERE case_status IN ('AWAITING_REVIEW', 'URGENT_REVIEW') AND completed_at IS NOT NULL), 0)::int AS avg_wait_seconds
          FROM patient_sessions
        `),
        c.query(`
          SELECT 
            count(*)::int AS uploaded,
            count(*) FILTER (WHERE ocr_status IN ('PENDING', 'PROCESSING'))::int AS ocr_processing,
            count(*) FILTER (WHERE extraction_status = 'PROCESSING')::int AS extraction_processing,
            count(*) FILTER (WHERE verification_status IN ('UNVERIFIED', 'PENDING_REVIEW') AND extraction_status = 'COMPLETED')::int AS awaiting_review,
            count(*) FILTER (WHERE processing_status = 'FAILED' OR ocr_status IN ('FAILED', 'UNAVAILABLE') OR extraction_status IN ('FAILED', 'UNAVAILABLE', 'MALFORMED_RESPONSE'))::int AS failed
          FROM documents
        `),
        c.query(`
          SELECT kiosk_id, label, last_seen, active_session_id, session_interrupted 
          FROM kiosk_heartbeats 
          ORDER BY last_seen DESC
        `),
        c.query(`
          SELECT 
            s.id, 
            s.display_name, 
            s.title, 
            s.role,
            (SELECT count(*)::int FROM consultations x WHERE x.doctor_id = s.id AND x.status = 'IN_PROGRESS') AS active_consultations
          FROM staff s
          WHERE s.active AND EXISTS (
            SELECT 1 FROM staff_sessions ss WHERE ss.staff_id = s.id AND ss.expires_at>now()
          )
          ORDER BY s.role, s.display_name
        `),
        c.query(`
          SELECT 
            s.id AS session_id,
            s.case_id,
            s.case_status,
            (SELECT count(*)::int FROM safety_signals WHERE session_id = s.id AND status = 'UNREVIEWED') AS unreviewed_signals,
            (SELECT count(*)::int FROM documents WHERE session_id = s.id) AS document_count,
            (SELECT display_name FROM staff WHERE id = (SELECT doctor_id FROM consultations WHERE session_id = s.id AND status = 'IN_PROGRESS' ORDER BY started_at DESC LIMIT 1)) AS doctor_name,
            s.created_at,
            s.completed_at
          FROM patient_sessions s
          WHERE s.case_status IN ('AWAITING_REVIEW', 'URGENT_REVIEW', 'IN_CONSULTATION', 'IN_PROGRESS', 'COMPLETED')
          ORDER BY 
            CASE s.case_status 
              WHEN 'URGENT_REVIEW' THEN 0 
              WHEN 'AWAITING_REVIEW' THEN 1 
              WHEN 'IN_CONSULTATION' THEN 2 
              WHEN 'IN_PROGRESS' THEN 3
              ELSE 4 
            END,
            s.created_at DESC
          LIMIT 100
        `),
      ]);

      const fr = f.rows[0];
      const dr = d.rows[0];

      return {
        funnel: {
          kioskIntake: fr.kiosk_intake ?? 0,
          awaitingReview: fr.awaiting_review ?? 0,
          urgent: fr.urgent ?? 0,
          inConsultation: fr.in_consultation ?? 0,
          completedToday: fr.completed_today ?? 0,
          avgWaitSeconds: fr.avg_wait_seconds ?? 0,
        },
        documents: {
          uploaded: dr.uploaded ?? 0,
          ocrProcessing: dr.ocr_processing ?? 0,
          extractionProcessing: dr.extraction_processing ?? 0,
          awaitingReview: dr.awaiting_review ?? 0,
          failed: dr.failed ?? 0,
        },
        kiosks: k.rows.map((r: any) => ({
          kioskId: r.kiosk_id,
          label: r.label,
          status: kioskStatus(r.last_seen),
          lastSeen: r.last_seen,
          activeSessionId: r.active_session_id,
          sessionInterrupted: Boolean(r.session_interrupted),
        })),
        staff: staff.rows.map((r: any) => ({
          id: r.id,
          displayName: r.display_name,
          title: r.title,
          role: r.role,
          activeConsultations: r.active_consultations ?? 0,
        })),
        cases: cases.rows.map((r: any) => ({
          sessionId: r.session_id,
          caseId: r.case_id,
          caseStatus: r.case_status,
          unreviewedSignals: r.unreviewed_signals ?? 0,
          documentCount: r.document_count ?? 0,
          doctorName: r.doctor_name ?? null,
          createdAt: r.created_at,
          completedAt: r.completed_at ?? null,
        })),
      };
    });

    return NextResponse.json({ overview }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (err) {
    console.error("Failed to load hospital overview:", err);
    return NextResponse.json({ error: "Failed to load hospital overview" }, { status: 500 });
  }
}
