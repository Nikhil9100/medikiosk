import { NextResponse } from "next/server";
import { databaseConfigured, withKioskTx } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { completeKioskIntake, getCase } from "@/lib/db/cases";
import { listComplaints } from "@/lib/db/complaints";
import { listEvidenceForSession } from "@/lib/db/documents-pg";
import { detectSafetySignals, dedupeSignals } from "@/lib/safety-signals";
import { buildClinicalSummary } from "@/lib/clinical-summary";
import { writeAudit } from "@/lib/db/audit";
import type { Severity } from "@/lib/case-status";

export const runtime = "nodejs";

type InterviewFactRaw = {
  questionId: string;
  value?: string | null;
  state: string;
  provenance?: string;
};

/**
 * POST /api/patient/complete
 *
 * End of the patient journey. Server-side, in ONE transaction:
 *   1. gather real case data (complaints, interview facts, documents, evidence)
 *   2. run deterministic safety-signal detection (deduped against existing)
 *   3. build the structured clinical summary (deterministic, no LLM)
 *   4. transition the case to AWAITING_REVIEW or URGENT_REVIEW
 *      (URGENT_REVIEW when unreviewed safety signals exist)
 *
 * The patient never sees a diagnosis; the doctor console receives the case.
 */
export async function POST() {
  if (!databaseConfigured()) {
    return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getActiveKioskSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 404 });
  if (session.status !== "ACTIVE") {
    return NextResponse.json({ error: "Session is not active" }, { status: 410 });
  }

  try {
    const result = await withKioskTx(session.id, async (client) => {
      const caseRecord = (await getCase(client, session.id))!;
      const complaints = await listComplaints(client, session.id);

      // Global interview facts live on the session; HPI facts live per-complaint.
      const globalInterview = (caseRecord.interviewData as Record<string, InterviewFactRaw> | null) ?? null;
      const facts: Array<{ questionId: string; value?: string | null; state: string }> = [
        ...(globalInterview ? Object.values(globalInterview) : []),
        ...complaints.flatMap((c) =>
          Object.values((c.interviewData as Record<string, InterviewFactRaw>) ?? []).map((f) => ({
            questionId: f.questionId,
            value: f.value ?? null,
            state: f.state,
          })),
        ),
      ];

      const evidence = await listEvidenceForSession(client, session.id);
      const documents = await client.query(
        `SELECT id, original_filename AS filename, document_type, ocr_status, extraction_status
           FROM documents WHERE session_id = $1`,
        [session.id],
      );

      const existingSignals = await client.query(
        `SELECT signal_type AS type, evidence_ref FROM safety_signals WHERE session_id = $1`,
        [session.id],
      );

      const drafts = detectSafetySignals({
        complaints: complaints.map((c) => ({
          text: c.complaintText,
          region: c.bodyRegion,
          severity: (c.severity as Severity | null) ?? null,
          position: c.position,
        })),
        facts,
        evidence: evidence.map((e) => ({
          id: e.id,
          category: e.category,
          primaryValue: e.normalizedValue?.name ?? e.originalOcrWording ?? "",
          detail: e.normalizedValue?.details ?? null,
        })),
      });
      const newSignals = dedupeSignals(
        existingSignals.rows.map((r) => ({ type: r.type as string, evidenceRef: (r.evidence_ref as string | null) ?? null })),
        drafts,
      );
      for (const draft of newSignals) {
        await client.query(
          `INSERT INTO safety_signals (session_id, signal_type, summary, reason, evidence_ref, source)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [session.id, draft.type, draft.summary, draft.reason, draft.evidenceRef, draft.source],
        );
      }
      if (newSignals.length > 0) {
        await writeAudit(client, { type: "SYSTEM", id: session.id }, "safety_signals.detected", {
          type: "case",
          id: caseRecord.caseId,
        }, { count: newSignals.length, types: newSignals.map((s) => s.type) });
      }

      const allSignals = await client.query(
        `SELECT signal_type AS type, summary, reason, status, source FROM safety_signals
          WHERE session_id = $1 ORDER BY created_at`,
        [session.id],
      );

      const summary = buildClinicalSummary({
        caseRecord,
        complaints,
        globalInterview,
        documents: documents.rows.map((r) => ({
          id: r.id as string,
          originalFilename: r.filename as string,
          documentType: r.document_type as string,
          ocrStatus: r.ocr_status as string,
          extractionStatus: r.extraction_status as string,
        })),
        evidence,
        signals: allSignals.rows.map((r) => ({
          type: r.type as string,
          summary: r.summary as string,
          reason: r.reason as string,
          status: r.status as string,
          source: r.source as string,
        })),
      });

      const hasUnreviewed = (allSignals.rows as Array<{ status: string }>).some((s) => s.status === "UNREVIEWED");
      const updated = await completeKioskIntake(client, session.id, hasUnreviewed, summary);
      return { caseRecord: updated!, newSignals, summary };
    });

    return NextResponse.json({
      caseId: result.caseRecord.caseId,
      caseStatus: result.caseRecord.caseStatus,
      signals: result.newSignals.map((s) => ({ type: s.type, summary: s.summary, reason: s.reason, source: s.source })),
      summary: result.summary,
    });
  } catch (error) {
    console.error("Patient completion failed:", error);
    return NextResponse.json({ error: "Unable to complete" }, { status: 500 });
  }
}
