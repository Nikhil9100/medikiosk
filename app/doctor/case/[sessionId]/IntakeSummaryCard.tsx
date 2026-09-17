"use client";

import React, { useMemo, useState } from "react";
import { buildFhirBundle } from "@/lib/fhir-export";

export type IntakeSummaryCardProps = {
  summary: any;
  complaints?: Array<{
    id?: string;
    position?: number;
    complaintText?: string;
    text?: string;
    bodyRegion?: string | null;
    region?: string | null;
    severity?: string | null;
    [key: string]: any;
  }>;
  interview?: any;
  documents?: Array<{
    id: string;
    name?: string;
    originalFilename?: string;
    ocrStatus?: string;
    extractionStatus?: string;
    verificationStatus?: string;
    [key: string]: any;
  }>;
  evidence?: Array<{
    id: string;
    category: string;
    value?: any;
    wording?: string | null;
    originalWording?: string | null;
    verificationState?: string;
    [key: string]: any;
  }>;
  safetySignals?: Array<{
    type?: string;
    signal_type?: string;
    summary?: string;
    reason?: string;
    [key: string]: any;
  }>;
  fhirBundle?: any;
  caseDetails?: {
    caseId?: string;
    sessionId?: string;
    language?: string;
    createdAt?: string;
    completedAt?: string | null;
    practitionerName?: string;
    practitionerId?: string;
  };
};

const QUESTION_TITLES: Record<string, string> = {
  onset: "Symptom Onset & Duration",
  progression: "Progression & Frequency",
  severity: "Reported Severity",
  chest_pain: "Chest Pain / Tightness",
  breathlessness: "Shortness of Breath",
  allergies: "Known Allergies",
  medicines: "Current Medications",
  past_history: "Past Medical History",
  diet_lifestyle: "Diet & Lifestyle Profile",
  family_history: "Family History",
  fever: "Fever / Body Temperature",
  cough: "Cough & Respiratory Symptoms",
  digestion: "Digestive & Bowel Habits",
  sleep: "Sleep Quality & Patterns",
};

export function IntakeSummaryCard({
  summary,
  complaints = [],
  interview = [],
  documents = [],
  evidence = [],
  safetySignals = [],
  fhirBundle,
  caseDetails,
}: IntakeSummaryCardProps) {
  const [copiedFhir, setCopiedFhir] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse raw summary if it was serialized as a string
  let parsed: any = null;
  if (typeof summary === "string") {
    try {
      parsed = JSON.parse(summary);
    } catch {
      parsed = null;
    }
  } else if (summary && typeof summary === "object") {
    parsed = summary;
  }

  // Resolve Chief Complaint & Complaints
  const chiefComplaint =
    parsed?.chiefComplaint ??
    (complaints[0]?.complaintText || complaints[0]?.text) ??
    (typeof summary === "string" && !parsed ? summary : null);

  const resolvedComplaints = parsed?.complaints?.length
    ? parsed.complaints
    : complaints.map((c) => ({
        text: c.complaintText || c.text,
        region: c.bodyRegion || c.region,
        severity: c.severity,
      }));

  // Resolve Interview Questions
  const interviewSource = parsed?.interview ?? interview;
  let interviewList: Array<{
    questionId: string;
    state: string;
    value?: string | null;
    provenance?: string;
  }> = [];

  if (Array.isArray(interviewSource)) {
    interviewList = interviewSource;
  } else if (interviewSource && typeof interviewSource === "object") {
    interviewList = Object.entries(interviewSource).map(([key, val]: [string, any]) => ({
      questionId: val?.questionId || key,
      state: val?.state || "UNKNOWN",
      value: val?.value ?? null,
      provenance: val?.provenance,
    }));
  }

  // Resolve Documents & Evidence
  const resolvedDocs = parsed?.documents?.length ? parsed.documents : documents;
  const resolvedEvidence = parsed?.evidence?.length ? parsed.evidence : evidence;
  const resolvedSignals = parsed?.safetySignals?.length ? parsed.safetySignals : safetySignals;

  // Resolve FHIR Bundle
  const resolvedFhirBundle = useMemo(() => {
    if (fhirBundle) return fhirBundle;
    try {
      return buildFhirBundle({
        caseId: caseDetails?.caseId || "CASE-1078",
        sessionId: caseDetails?.sessionId || "c05770ef-6512-4785-868e-43914162b108",
        language: caseDetails?.language || "en",
        complaint: chiefComplaint || "Cough",
        createdAt: caseDetails?.createdAt || new Date().toISOString(),
        completedAt: caseDetails?.completedAt ?? null,
        documents: resolvedDocs.map((d: any) => ({
          id: d.id,
          name: d.name || d.originalFilename || "Document",
          mimeType: d.mimeType || "application/pdf",
        })),
        practitioner: {
          id: caseDetails?.practitionerId || "3e6b1506-1b21-479c-bdae-a16ea24b980a",
          displayName: caseDetails?.practitionerName || "Dr. Doc1",
        },
      });
    } catch {
      return null;
    }
  }, [fhirBundle, caseDetails, chiefComplaint, resolvedDocs]);

  const fhirJsonString = resolvedFhirBundle ? JSON.stringify(resolvedFhirBundle, null, 2) : "";

  const handleCopyFhir = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!fhirJsonString) return;
    try {
      await navigator.clipboard.writeText(fhirJsonString);
      setCopiedFhir(true);
      setTimeout(() => setCopiedFhir(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadFhir = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!fhirJsonString) return;
    const blob = new Blob([fhirJsonString], { type: "application/fhir+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fhir-bundle-${caseDetails?.caseId || "report"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rawJsonString = parsed
    ? JSON.stringify(parsed, null, 2)
    : summary
    ? typeof summary === "string"
      ? summary
      : JSON.stringify(summary, null, 2)
    : null;

  const handleCopy = async () => {
    if (!rawJsonString) return;
    try {
      await navigator.clipboard.writeText(rawJsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="intake-summary-container">
      {/* 1. Chief Complaint & Clinical Presentation */}
      <div className="intake-section-highlight">
        <div className="intake-header-row">
          <div className="intake-title-group">
            <span className="intake-badge primary">Primary Intake</span>
            <h4>Chief Complaint & Presentation</h4>
          </div>
          {parsed?.version && (
            <span className="intake-version-chip">Intake Schema v{parsed.version}</span>
          )}
        </div>

        {chiefComplaint ? (
          <div className="chief-complaint-box">
            <div className="chief-complaint-text">
              <strong>"{chiefComplaint}"</strong>
            </div>

            {resolvedComplaints.length > 0 && (
              <div className="complaint-tags-list">
                {resolvedComplaints.map((c: any, i: number) => (
                  <div key={i} className="complaint-chip">
                    <span className="complaint-name">{c.text || chiefComplaint}</span>
                    {c.region && <span className="complaint-region">📍 {c.region}</span>}
                    {c.severity && (
                      <span
                        className={`complaint-severity ${
                          c.severity === "SEVERE" || c.severity === "VERY_SEVERE"
                            ? "severe"
                            : c.severity === "MODERATE"
                            ? "moderate"
                            : "mild"
                        }`}
                      >
                        {c.severity}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="helper" style={{ margin: "8px 0" }}>
            No specific chief complaint recorded.
          </p>
        )}
      </div>

      {/* 2. Urgent Safety Signals (if triggered) */}
      {resolvedSignals && resolvedSignals.length > 0 && (
        <div className="intake-safety-alerts">
          {resolvedSignals.map((sig: any, idx: number) => (
            <div key={idx} className="intake-alert-card urgent">
              <span className="intake-alert-icon">⚠️</span>
              <div>
                <strong>{sig.type || sig.signal_type}: {sig.summary}</strong>
                {sig.reason && <p className="helper">{sig.reason}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Structured Clinical Interview Answers */}
      <div className="intake-interview-section">
        <div className="intake-section-heading">
          <h5>Structured Patient Responses ({interviewList.length})</h5>
          <span className="helper">Self-reported by patient at kiosk pre-consultation</span>
        </div>

        {interviewList.length > 0 ? (
          <div className="intake-questions-grid">
            {interviewList.map((item) => {
              const qTitle =
                QUESTION_TITLES[item.questionId] ||
                item.questionId
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase());

              const stateUpper = (item.state || "UNKNOWN").toUpperCase();

              let badgeClass = "badge-declined";
              let badgeLabel = "Declined";

              if (stateUpper === "KNOWN" || stateUpper === "YES" || stateUpper === "PRESENT") {
                badgeClass = "badge-known";
                badgeLabel = item.value ? "Reported" : "Yes / Present";
              } else if (stateUpper === "DENIED" || stateUpper === "NO" || stateUpper === "ABSENT") {
                badgeClass = "badge-denied";
                badgeLabel = "Denied / None";
              } else if (stateUpper === "UNKNOWN" || stateUpper === "UNSURE") {
                badgeClass = "badge-unknown";
                badgeLabel = "Not Sure";
              }

              return (
                <div key={item.questionId} className={`intake-q-card ${badgeClass}`}>
                  <div className="intake-q-head">
                    <span className="intake-q-title">{qTitle}</span>
                    <span className={`intake-state-tag ${badgeClass}`}>{badgeLabel}</span>
                  </div>

                  {item.value ? (
                    <div className="intake-q-value">"{item.value}"</div>
                  ) : (
                    <div className="intake-q-empty">
                      {stateUpper === "DECLINED"
                        ? "Patient declined to answer"
                        : stateUpper === "DENIED"
                        ? "Negative / No symptoms reported"
                        : stateUpper === "UNKNOWN"
                        ? "Patient was unsure / left unconfirmed"
                        : "No detailed notes provided"}
                    </div>
                  )}

                  {item.provenance && (
                    <span className="intake-provenance-meta">
                      Via {item.provenance.toLowerCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="helper">No interview answers recorded for this session.</p>
        )}
      </div>

      {/* 4. Documents & Evidence Summary (if attached) */}
      {(resolvedDocs.length > 0 || resolvedEvidence.length > 0) && (
        <div className="intake-docs-summary">
          <div className="intake-section-heading">
            <h5>Diagnostic Records & Clinical Evidence</h5>
            <span className="helper">
              {resolvedDocs.length} document{resolvedDocs.length === 1 ? "" : "s"} ·{" "}
              {resolvedEvidence.length} extracted finding{resolvedEvidence.length === 1 ? "" : "s"}
            </span>
          </div>

          {resolvedDocs.length > 0 && (
            <div className="intake-docs-list">
              {resolvedDocs.map((d: any) => (
                <div key={d.id} className="intake-doc-pill">
                  <span className="doc-icon">📄</span>
                  <span className="doc-name">{d.name || d.originalFilename || "Medical Record"}</span>
                  <span className="doc-badge">{d.ocrStatus || "OCR Completed"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Official FHIR R4 Clinical Report (ABDM-Compliant Document Bundle) */}
      {fhirJsonString && (
        <div className="fhir-report-card">
          <div className="fhir-report-header">
            <div className="fhir-report-title-box">
              <span className="fhir-badge-abdm">FHIR R4</span>
              <h5>FHIR Clinical Report (ABDM Document Bundle)</h5>
              <span className="fhir-badge-status">Bundle: document · final</span>
            </div>
            <div className="fhir-actions-row">
              <button
                type="button"
                className="fhir-btn primary"
                onClick={handleCopyFhir}
                title="Copy FHIR JSON Bundle to clipboard"
              >
                {copiedFhir ? "Copied ✓" : "Copy FHIR JSON"}
              </button>
              <button
                type="button"
                className="fhir-btn secondary"
                onClick={handleDownloadFhir}
                title="Download FHIR Bundle as .json file"
              >
                ⬇ Download .json
              </button>
              {caseDetails?.sessionId && (
                <a
                  className="fhir-btn link"
                  href={`/api/staff/case/${caseDetails.sessionId}/fhir`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open raw FHIR endpoint in new tab"
                >
                  ↗ Raw API
                </a>
              )}
            </div>
          </div>

          <div className="fhir-report-body">
            <p className="fhir-helper-text">
              Official HL7 FHIR R4 document bundle containing Composition, Patient, Practitioner, and Encounter resources mapped for ABDM clinical record exchange.
            </p>
            <pre className="fhir-pre-box">{fhirJsonString}</pre>
          </div>
        </div>
      )}

      {/* 6. Collapsible Internal Kiosk Intake Data (For internal kiosk audit) */}
      {rawJsonString && (
        <details className="intake-raw-drawer">
          <summary className="intake-raw-summary">
            <span className="raw-summary-left">
              <span className="code-icon">&lt;/&gt;</span>
              <strong>Internal Kiosk Intake Payload</strong>
              <small>(Kiosk Schema v1.0 / Internal Debug)</small>
            </span>
            <button
              type="button"
              className="copy-json-btn"
              onClick={(e) => {
                e.preventDefault();
                void handleCopy();
              }}
              title="Copy Kiosk JSON to clipboard"
            >
              {copied ? "Copied ✓" : "Copy JSON"}
            </button>
          </summary>
          <div className="raw-json-body">
            <pre>{rawJsonString}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
