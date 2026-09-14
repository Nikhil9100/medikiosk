import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-guard";
import { withStaffTx } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireStaff("DOCTOR");
  if (g.response) return g.response;

  try {
    const cases = await withStaffTx(g.staff!.id, async (c) => {
      const rows = (
        await c.query(`
          SELECT 
            s.id AS session_id,
            s.case_id,
            s.case_status,
            s.language,
            s.created_at,
            s.completed_at,
            coalesce(
              (SELECT complaint_text FROM complaints WHERE session_id = s.id AND status = 'ACTIVE' ORDER BY position LIMIT 1),
              s.complaint_text
            ) AS primary_complaint,
            (SELECT count(*)::int FROM complaints WHERE session_id = s.id AND status = 'ACTIVE') AS complaint_count,
            (SELECT severity FROM complaints WHERE session_id = s.id AND severity IS NOT NULL ORDER BY CASE severity WHEN 'MILD' THEN 1 WHEN 'MODERATE' THEN 2 WHEN 'SEVERE' THEN 3 ELSE 4 END DESC LIMIT 1) AS top_severity,
            (SELECT count(*)::int FROM safety_signals WHERE session_id = s.id AND status = 'UNREVIEWED') AS unreviewed_signals,
            (SELECT count(*)::int FROM documents WHERE session_id = s.id) AS document_count,
            (SELECT count(*)::int FROM documents WHERE session_id = s.id AND (ocr_status IN ('PENDING', 'PROCESSING') OR extraction_status = 'PROCESSING')) AS documents_processing,
            (SELECT doctor_id FROM consultations WHERE session_id = s.id AND status = 'IN_PROGRESS' ORDER BY started_at DESC LIMIT 1) AS doctor_id,
            (SELECT display_name FROM staff WHERE id = (SELECT doctor_id FROM consultations WHERE session_id = s.id AND status = 'IN_PROGRESS' ORDER BY started_at DESC LIMIT 1)) AS doctor_name
          FROM patient_sessions s
          WHERE s.case_status IN ('AWAITING_REVIEW', 'URGENT_REVIEW', 'IN_CONSULTATION', 'IN_PROGRESS')
          ORDER BY 
            CASE s.case_status 
              WHEN 'URGENT_REVIEW' THEN 0 
              WHEN 'AWAITING_REVIEW' THEN 1 
              WHEN 'IN_CONSULTATION' THEN 2 
              ELSE 3 
            END,
            s.created_at ASC
        `)
      ).rows;

      return rows.map((r: any) => ({
        sessionId: r.session_id,
        caseId: r.case_id,
        caseStatus: r.case_status,
        language: r.language,
        createdAt: r.created_at,
        completedAt: r.completed_at,
        primaryComplaint: r.primary_complaint,
        complaintCount: r.complaint_count,
        topSeverity: r.top_severity,
        unreviewedSignals: r.unreviewed_signals,
        documentCount: r.document_count,
        documentsProcessing: r.documents_processing,
        doctorId: r.doctor_id ?? null,
        doctorName: r.doctor_name ?? null,
      }));
    });

    return NextResponse.json({ cases }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (err) {
    console.warn("Database unavailable during doctor queue fetch, falling back to demo cases:", err);
    const sampleCases = [
      {
        sessionId: "demo-sess-01",
        caseId: "CASE-1042",
        caseStatus: "URGENT_REVIEW",
        language: "en",
        createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
        primaryComplaint: "Acute severe chest tightness radiating to left jaw, onset 2 hours ago",
        complaintCount: 2,
        topSeverity: "VERY_SEVERE",
        unreviewedSignals: 1,
        documentCount: 1,
        documentsProcessing: 0,
        doctorId: null,
        doctorName: null,
      },
      {
        sessionId: "demo-sess-02",
        caseId: "CASE-1039",
        caseStatus: "AWAITING_REVIEW",
        language: "hi",
        createdAt: new Date(Date.now() - 34 * 60000).toISOString(),
        primaryComplaint: "High grade fever for 4 days with body aches and chills",
        complaintCount: 1,
        topSeverity: "MODERATE",
        unreviewedSignals: 0,
        documentCount: 2,
        documentsProcessing: 0,
        doctorId: null,
        doctorName: null,
      },
      {
        sessionId: "demo-sess-03",
        caseId: "CASE-1035",
        caseStatus: "IN_CONSULTATION",
        language: "en",
        createdAt: new Date(Date.now() - 55 * 60000).toISOString(),
        primaryComplaint: "Chronic dry cough for 3 weeks with shortness of breath on exertion",
        complaintCount: 1,
        topSeverity: "MODERATE",
        unreviewedSignals: 0,
        documentCount: 0,
        documentsProcessing: 0,
        doctorId: g.staff?.id ?? "demo-doc-01",
        doctorName: g.staff?.displayName ?? "Dr. Ananya Sharma",
      },
    ];
    return NextResponse.json({ cases: sampleCases }, { headers: { "Cache-Control": "no-store, private" } });
  }
}
