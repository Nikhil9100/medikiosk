"use client";

import React, { useState } from "react";

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
}: IntakeSummaryCardProps) {
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

      {/* 5. Collapsible Raw Audit JSON (Preserves full contract and FHIR payload) */}
      {rawJsonString && (
        <details className="intake-raw-drawer">
          <summary className="intake-raw-summary">
            <span className="raw-summary-left">
              <span className="code-icon">&lt;/&gt;</span>
              <strong>View Raw Intake JSON Payload</strong>
              <small>(Clinical Audit & FHIR Interoperability)</small>
            </span>
            <button
              type="button"
              className="copy-json-btn"
              onClick={(e) => {
                e.preventDefault();
                void handleCopy();
              }}
              title="Copy JSON to clipboard"
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
