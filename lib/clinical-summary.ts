import type { ComplaintRecord } from "@/lib/db/complaints";
import type { CaseRecord } from "@/lib/db/cases";
import type { EvidenceRow } from "@/lib/db/documents-pg";

/**
 * Deterministic clinical summary builder.
 *
 * The summary is a STRUCTURED view over real case data: every entry carries
 * its state (KNOWN/UNKNOWN/DECLINED/DENIED/NOT_ASKED) and provenance, and
 * missing information is reported as missing — never converted into "NO".
 * No language model is involved; nothing here is inferred or fabricated.
 */

export type InterviewFactView = {
  questionId: string;
  value?: string | null;
  state: "NOT_ASKED" | "KNOWN" | "UNKNOWN" | "DECLINED" | "DENIED";
  provenance: string;
};

export type ClinicalSummary = {
  caseId: string;
  language: string;
  completedAt: string;
  primaryComplaint: {
    position: number;
    text: string;
    severity: string | null;
    region: string | null;
  } | null;
  otherComplaints: Array<{
    position: number;
    text: string;
    severity: string | null;
    region: string | null;
  }>;
  hpi: Array<{
    complaintPosition: number;
    complaintText: string;
    facts: InterviewFactView[];
  }>;
  globalHistory: Array<{
    domain: string;
    facts: InterviewFactView[];
  }>;
  documents: Array<{
    id: string;
    filename: string;
    type: string;
    ocrStatus: string;
    extractionStatus: string;
    evidenceCount: number;
    verifiedCount: number;
    rejectedCount: number;
  }>;
  safetySignals: Array<{
    type: string;
    summary: string;
    reason: string;
    status: string;
    source: string;
  }>;
  missingInformation: string[]; // question ids with KNOWN-unlikely states
};

/**
 * Interview question grouping by clinical domain. Shared by the summary
 * builder and the doctor console so both use identical domain semantics.
 */
export const INTERVIEW_DOMAINS: Record<string, string[]> = {
  presenting_complaint: ["presenting_complaint", "hpi_onset", "hpi_duration", "hpi_progression", "hpi_location", "hpi_character", "hpi_aggravating", "hpi_relieving", "associated_symptoms", "associated_symptoms_details"],
  past_history: ["medical_conditions", "medical_conditions_details", "previous_illness", "previous_illness_details", "hospitalization", "hospitalization_details"],
  surgery_history: ["surgery_history", "surgery_details"],
  medication_history: ["medication_current", "medication_details"],
  allergy_history: ["allergy_medicine", "allergy_details"],
  family_history: ["family_history", "family_history_details"],
  personal_social_history: ["personal_history_smoking", "personal_history_smoking_details", "personal_history_alcohol", "personal_history_alcohol_details", "personal_history_sleep", "personal_history_diet", "personal_history_activity"],
  review_of_systems: ["ros_summary", "ros_details"],
};

export const HPI_DOMAINS = new Set(["presenting_complaint"]);

export function buildClinicalSummary(params: {
  caseRecord: CaseRecord;
  complaints: ComplaintRecord[];
  globalInterview: Record<string, unknown> | null;
  documents: Array<{
    id: string;
    originalFilename: string;
    documentType: string;
    ocrStatus: string;
    extractionStatus: string;
  }>;
  evidence: EvidenceRow[];
  signals: Array<{
    type: string;
    summary: string;
    reason: string;
    status: string;
    source: string;
  }>;
  now?: Date;
}): ClinicalSummary {
  const { caseRecord, complaints, globalInterview, documents, evidence, signals } = params;
  const active = complaints.filter((c) => c.status === "ACTIVE").sort((a, b) => a.position - b.position);
  const primary = active[0] ?? null;

  const factView = (raw: unknown): InterviewFactView | null => {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (typeof record.questionId !== "string") return null;
    const state = (["NOT_ASKED", "KNOWN", "UNKNOWN", "DECLINED", "DENIED"] as const).find((s) => s === record.state);
    return {
      questionId: record.questionId,
      value: (record.value as string | null | undefined) ?? null,
      state: state ?? "NOT_ASKED",
      provenance: (record.provenance as string | undefined) ?? "PATIENT",
    };
  };

  const hpi = active.map((complaint) => ({
    complaintPosition: complaint.position,
    complaintText: complaint.complaintText,
    facts: Object.values((complaint.interviewData as Record<string, unknown>) ?? {})
      .map(factView)
      .filter((f): f is InterviewFactView => f !== null),
  }));

  const globalFacts = Object.values(globalInterview ?? {})
    .map(factView)
    .filter((f): f is InterviewFactView => f !== null);

  const globalHistory = Object.entries(INTERVIEW_DOMAINS)
    .map(([domain, questionIds]) => ({
      domain,
      facts: globalFacts.filter((f) => questionIds.includes(f.questionId)),
    }))
    .filter((group) => group.facts.length > 0);

  const evidenceByDocument = new Map<string, EvidenceRow[]>();
  for (const item of evidence) {
    const key = item.documentId;
    if (!evidenceByDocument.has(key)) evidenceByDocument.set(key, []);
    evidenceByDocument.get(key)!.push(item);
  }

  const documentViews = documents.map((doc) => {
    const items = evidenceByDocument.get(doc.id) ?? [];
    return {
      id: doc.id,
      filename: doc.originalFilename,
      type: doc.documentType,
      ocrStatus: doc.ocrStatus,
      extractionStatus: doc.extractionStatus,
      evidenceCount: items.length,
      verifiedCount: items.filter((i) => i.verificationState === "VERIFIED").length,
      rejectedCount: items.filter((i) => i.verificationState === "REJECTED").length,
    };
  });

  // Missing information: areas not answered (NOT_ASKED), not knowable
  // (UNKNOWN), or declined (DECLINED). An explicit DENIED or KNOWN answer is
  // a valid clinical answer and is never reported as missing.
  const missing: string[] = [];
  const isMissing = (state: string) => state === "NOT_ASKED" || state === "UNKNOWN" || state === "DECLINED";
  for (const group of globalHistory) {
    for (const fact of group.facts) {
      if (isMissing(fact.state)) missing.push(fact.questionId);
    }
  }
  const requiredGlobal = ["medication_current", "allergy_medicine"];
  for (const id of requiredGlobal) {
    if (!globalFacts.some((f) => f.questionId === id)) missing.push(id);
  }

  return {
    caseId: caseRecord.caseId,
    language: caseRecord.language,
    completedAt: (params.now ?? new Date()).toISOString(),
    primaryComplaint: primary
      ? { position: primary.position, text: primary.complaintText, severity: primary.severity, region: primary.bodyRegion }
      : null,
    otherComplaints: active.slice(1).map((c) => ({
      position: c.position,
      text: c.complaintText,
      severity: c.severity,
      region: c.bodyRegion,
    })),
    hpi,
    globalHistory,
    documents: documentViews,
    safetySignals: signals.map((s) => ({
      type: s.type,
      summary: s.summary,
      reason: s.reason,
      status: s.status,
      source: s.source,
    })),
    missingInformation: Array.from(new Set(missing)),
  };
}
