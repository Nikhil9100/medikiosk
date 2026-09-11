import { NextResponse } from "next/server";
import { databaseConfigured, withStaffTx } from "@/lib/db/pool";
import { getAuthenticatedStaff } from "@/lib/staff-auth";
import { listComplaints } from "@/lib/db/complaints";
import { listEvidenceForSession } from "@/lib/db/documents-pg";
import { INTERVIEW_DOMAINS } from "@/lib/clinical-summary";
import { writeAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const DASHAVIDHA_OBSERVATIONS = [
  "shabda", "roop", "sparsha", "purana", "prakriti", "vrikriti", "vikriti", "sthana",
] as const;

/**
 * GET /api/staff/case/[sessionId]
 *
 * The complete, live case bundle for the doctor console. Every section is
 * read from the canonical database state — nothing is cached or duplicated
 * per screen, so patient/doctor/hospital consoles always agree.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
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

  try {
    const bundle = await withStaffTx(async (client) => {
      const caseResult = await client.query(
        `SELECT s.*, c.display_name AS doctor_name, con.started_at AS consult_started_at
           FROM patient_sessions s
           LEFT JOIN consultations con ON con.session_id = s.id AND con.status = 'IN_PROGRESS'
           LEFT JOIN staff c ON c.id = con.doctor_id
          WHERE s.id = $1`,
        [sessionId],
      );
      if (caseResult.rows.length === 0) return null;
      const row = caseResult.rows[0] as Record<string, unknown>;
      const caseRecord = {
        sessionId: row.id as string,
        caseId: row.case_id as string,
        caseStatus: row.case_status as string,
        language: row.language as string,
        demoFlag: row.demo_flag as boolean,
        consentStatus: row.consent_status as string,
        createdAt: (row.created_at as Date).toISOString(),
        completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
        doctorName: (row.doctor_name as string | null) ?? null,
        consultStartedAt: row.consult_started_at ? (row.consult_started_at as Date).toISOString() : null,
      };

      const complaints = await listComplaints(client, sessionId);

      const globalInterview = (row.interview_data as Record<string, unknown> | null) ?? null;
      const globalHistory = Object.entries(INTERVIEW_DOMAINS).map(([domain, questionIds]) => ({
        domain,
        facts: Object.values(globalInterview ?? {})
          .map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null))
          .filter((f): f is Record<string, unknown> => Boolean(f))
          .filter((f) => questionIds.includes(f.questionId as string))
          .map((f) => ({
            questionId: f.questionId as string,
            value: (f.value as string | null | undefined) ?? null,
            state: (f.state as string | undefined) ?? "NOT_ASKED",
            provenance: (f.provenance as string | undefined) ?? "PATIENT",
          })),
      })).filter((group) => group.facts.length > 0);

      const documents = await client.query(
        `SELECT id, document_type, original_filename, mime_type, file_size, page_count,
                ocr_status, extraction_status, ai_provider_state, failure_stage,
                verification_status, errors, created_at
           FROM documents WHERE session_id = $1 ORDER BY created_at`,
        [sessionId],
      );
      const ocrResults = await client.query(
        `SELECT o.document_id, o.payload FROM ocr_results o
          WHERE o.session_id = $1 ORDER BY o.created_at`,
        [sessionId],
      );
      const ocrByDocument = new Map<string, unknown[]>();
      for (const r of ocrResults.rows) {
        const list = ocrByDocument.get(r.document_id as string) ?? [];
        list.push(r.payload);
        ocrByDocument.set(r.document_id as string, list);
      }

      const evidence = await listEvidenceForSession(client, sessionId);

      const signals = await client.query(
        `SELECT id, signal_type AS type, summary, reason, evidence_ref, source, status,
                review_note, reviewed_at
           FROM safety_signals WHERE session_id = $1 ORDER BY created_at`,
        [sessionId],
      );

      const consultations = await client.query(
        `SELECT con.id, con.status, con.started_at, con.completed_at, con.note, c.display_name AS doctor_name
           FROM consultations con LEFT JOIN staff c ON c.id = con.doctor_id
          WHERE con.session_id = $1 ORDER BY con.started_at`,
        [sessionId],
      );

      const notes = await client.query(
        `SELECT n.id, n.body, n.created_at, s.display_name AS author_name
           FROM doctor_notes n LEFT JOIN staff s ON s.id = n.author_id
          WHERE n.session_id = $1 ORDER BY n.created_at`,
        [sessionId],
      );

      const dashaRows = await client.query(
        `SELECT observation, value, state, provenance, note, recorded_at, s.display_name AS recorded_by
           FROM dashavidha_observations d
           LEFT JOIN staff s ON s.id = d.recorded_by
          WHERE d.session_id = $1`,
        [sessionId],
      );
      const dashavidha: Record<string, {
        observation: string; value: string | null; state: string; provenance: string;
        note: string | null; recordedAt: string | null; recordedBy: string | null;
      }> = {};
      for (const observation of DASHAVIDHA_OBSERVATIONS) {
        const found = dashaRows.rows.find((r) => r.observation === observation);
        dashavidha[observation] = found
          ? {
              observation,
              value: (found.value as string | null) ?? null,
              state: found.state as string,
              provenance: found.provenance as string,
              note: (found.note as string | null) ?? null,
              recordedAt: found.recorded_at ? new Date(found.recorded_at as string | Date).toISOString() : null,
              recordedBy: (found.recorded_by as string | null) ?? null,
            }
          : { observation, value: null, state: "NOT_ASSESSED", provenance: "DOCTOR", note: null, recordedAt: null, recordedBy: null };
      }

      const chat = await client.query(
        `SELECT id, role, content, intent, provider, created_at
           FROM chat_messages WHERE session_id = $1 ORDER BY created_at, id`,
        [sessionId],
      );

      await writeAudit(client, { type: "STAFF", id: staff.id }, "case.viewed", {
        type: "case",
        id: caseRecord.caseId,
      });

      return {
        case: caseRecord,
        complaints: complaints.map((c) => ({
          id: c.id,
          position: c.position,
          complaintText: c.complaintText,
          bodyRegion: c.bodyRegion,
          bodySubregion: c.bodySubregion,
          severity: c.severity,
          interviewData: c.interviewData,
          createdAt: c.createdAt.toISOString(),
        })),
        globalHistory,
        documents: documents.rows.map((d) => ({
          id: d.id,
          documentType: d.document_type,
          originalFilename: d.original_filename,
          mimeType: d.mime_type,
          fileSize: d.file_size,
          pageCount: d.page_count,
          ocrStatus: d.ocr_status,
          extractionStatus: d.extraction_status,
          aiProviderState: d.ai_provider_state,
          failureStage: d.failure_stage,
          verificationStatus: d.verification_status,
          errors: d.errors,
          createdAt: (d.created_at as Date).toISOString(),
          ocrResults: (ocrByDocument.get(d.id as string) ?? []) as unknown[],
        })),
        evidence: evidence.map((e) => ({
          ...e,
          verifiedAt: e.verifiedAt ?? null,
        })),
        signals: signals.rows.map((s) => ({
          id: s.id,
          type: s.type,
          summary: s.summary,
          reason: s.reason,
          evidenceRef: s.evidence_ref,
          source: s.source,
          status: s.status,
          reviewNote: s.review_note,
          reviewedAt: s.reviewed_at ? new Date(s.reviewed_at as string | Date).toISOString() : null,
        })),
        consultations: consultations.rows.map((c) => ({
          id: c.id,
          status: c.status,
          startedAt: (c.started_at as Date).toISOString(),
          completedAt: c.completed_at ? (c.completed_at as Date).toISOString() : null,
          note: c.note,
          doctorName: c.doctor_name,
        })),
        notes: notes.rows.map((n) => ({
          id: n.id,
          body: n.body,
          createdAt: (n.created_at as Date).toISOString(),
          authorName: n.author_name,
        })),
        dashavidha,
        chat: chat.rows.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          intent: m.intent,
          provider: m.provider,
          createdAt: (m.created_at as Date).toISOString(),
        })),
        summary: row.summary ?? null,
      };
    });

    if (!bundle) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    return NextResponse.json({ case: bundle });
  } catch (error) {
    console.error("Case bundle fetch failed:", error);
    return NextResponse.json({ error: "Unable to load case" }, { status: 500 });
  }
}
