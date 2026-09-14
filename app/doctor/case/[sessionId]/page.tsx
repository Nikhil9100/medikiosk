"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DASHAVIDHA } from "@/lib/dashavidha";

type Bundle = {
  case: {
    caseId: string;
    sessionId: string;
    caseStatus: string;
    language: string;
    consentStatus: string;
    createdAt: string;
    completedAt?: string | null;
    summary: any;
    identity?: {
      status: string;
      abhaLast4: string | null;
      abhaAddressMasked: string | null;
    } | null;
  };
  complaints: Array<{
    id: string;
    position: number;
    complaintText: string;
    bodyRegion: string | null;
    bodySubregion: string | null;
    severity: string | null;
    interviewData: any;
  }>;
  signals: Array<{
    id: string;
    type: string;
    summary: string;
    reason: string;
    status: string;
    source: string;
  }>;
  documents: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    processingStatus: string;
    ocrStatus: string;
    extractionStatus: string;
    verificationStatus: string;
  }>;
  evidence: Array<{
    id: string;
    documentId: string | null;
    category: string;
    normalizedValue: any;
    originalWording: string | null;
    pageNumber: number | null;
    extractionMethod: string;
    confidence: number | null;
    verificationState: string;
    provenance: string;
    uncertaintyNotes: string | null;
    contradictionGroupId: string | null;
  }>;
  interview: Record<string, any> | null;
  chat: Array<{
    id: string;
    role: string;
    content: string;
    intent?: string | null;
    provider?: string | null;
    createdAt: string;
  }>;
  dashavidha: Array<{
    observation: string;
    value: string | null;
    state: string;
    note: string | null;
    recordedAt?: string | null;
  }>;
  consultation: {
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string | null;
    doctorId?: string | null;
    doctorName?: string | null;
    doctorTitle?: string | null;
  } | null;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorId?: string | null;
    authorName?: string | null;
    authorTitle?: string | null;
  }>;
};

function formatWaitTime(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} minutes`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)} days`;
}

export default function CasePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/staff/case/${sessionId}`, { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        router.replace("/doctor/login");
        return;
      }
      if (!r.ok) {
        setError("Unable to load this case.");
        return;
      }
      setData(await r.json());
      setError("");
    } catch {
      setError("Unable to load this case. Please check network connection.");
    }
  }, [sessionId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(path: string, body?: unknown) {
    setSaving(path);
    try {
      const r = await fetch(`/api/staff/case/${sessionId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "The clinical action could not be saved. Your typed data has been kept on screen.");
        return false;
      }
      await load();
      setError("");
      return true;
    } catch {
      setError("Connection lost. Nothing was confirmed saved; your typed data has been kept on screen.");
      return false;
    } finally {
      setSaving("");
    }
  }

  async function review(path: string, body: unknown) {
    try {
      const r = await fetch(`/api/staff/case/${sessionId}/${path}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if(!r.ok) {
        setError("The review action could not be saved. Please retry.");
        return false;
      }
      await load();
      setError("");
      return true;
    } catch {
      setError("Connection lost before the review action was confirmed. Please retry.");
      return false;
    }
  }

  const assessed = useMemo(() => {
    return new Map(data?.dashavidha.map((x) => [x.observation, x]) ?? []);
  }, [data?.dashavidha]);

  const unreviewedSignals = useMemo(() => {
    return data?.signals.filter((x) => x.status === "UNREVIEWED") ?? [];
  }, [data?.signals]);

  const unverifiedEvidence = useMemo(() => {
    return data?.evidence.filter((x) => x.verificationState === "UNVERIFIED") ?? [];
  }, [data?.evidence]);

  const contradictions = useMemo(() => {
    return data?.evidence.filter((x) => Boolean(x.contradictionGroupId)) ?? [];
  }, [data?.evidence]);

  if (!data) {
    return (
      <div className="console-shell">
        <main className="console-main">
          {error ? (
            <div className="system-banner error" role="alert">
              <span>{error}</span>
              <button type="button" className="secondary inline-retry-btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : (
            <div className="loading-card">Loading clinical case workspace…</div>
          )}
        </main>
      </div>
    );
  }

  const c = data.case;
  const topSeverity = data.complaints.find((x) => x.severity)?.severity;
  const isUrgent = c.caseStatus === "URGENT_REVIEW" || unreviewedSignals.length > 0;
  const isHighPriority = !isUrgent && (topSeverity === "SEVERE" || topSeverity === "VERY_SEVERE");
  const priorityLabel = isUrgent ? "URGENT" : isHighPriority ? "HIGH PRIORITY" : "ROUTINE";

  // Next Action Engine calculation
  let nextActionKicker = "Workflow recommendation";
  let nextActionTitle = "Start clinical consultation";
  let nextActionDescription = "Review patient presentation and history below, then initiate consultation.";
  let nextActionType: "SIGNAL" | "EVIDENCE" | "START_CONSULT" | "COMPLETE_CONSULT" | "DONE" = "START_CONSULT";

  if (unreviewedSignals.length > 0) {
    nextActionKicker = "Safety Action Required";
    nextActionTitle = "Review urgent clinical safety signals";
    nextActionDescription = `${unreviewedSignals.length} unreviewed safety signal(s) require physician evaluation.`;
    nextActionType = "SIGNAL";
  } else if (unverifiedEvidence.length > 0) {
    nextActionKicker = "Evidence Verification";
    nextActionTitle = "Verify extracted diagnostic facts";
    nextActionDescription = `${unverifiedEvidence.length} extracted item(s) await doctor confirmation.`;
    nextActionType = "EVIDENCE";
  } else if (!data.consultation || data.consultation.status !== "IN_PROGRESS") {
    if (c.caseStatus === "COMPLETED" || data.consultation?.status === "COMPLETED") {
      nextActionKicker = "Case Archived";
      nextActionTitle = "Consultation completed";
      nextActionDescription = "All clinical documentation and physician notes have been recorded.";
      nextActionType = "DONE";
    } else {
      nextActionKicker = "Next Step";
      nextActionTitle = "Begin patient consultation";
      nextActionDescription = "Pre-consultation evidence is reviewed. Ready to consult with patient.";
      nextActionType = "START_CONSULT";
    }
  } else {
    nextActionKicker = "Active Consultation";
    nextActionTitle = "Record impressions and complete consultation";
    nextActionDescription = "Consultation is currently in progress. Add clinical notes and finalize.";
    nextActionType = "COMPLETE_CONSULT";
  }

  return (
    <div className="console-shell">
      <header className="console-header">
        <div className="console-brand">
          <strong>MediKiosk · Clinical Review</strong>
          <span>Case {c.caseId}</span>
        </div>
        <Link className="secondary" href="/doctor">
          ← Return to Queue
        </Link>
      </header>

      <main className="console-main">
        {/* Case Meta Bar */}
        <div className="case-meta-bar">
          <div className="case-meta-left">
            <div className="case-meta-item">
              <small>Case ID</small>
              <strong>{c.caseId}</strong>
            </div>
            <div className="case-meta-item">
              <small>Priority</small>
              <span className={`status ${isUrgent ? "urgent" : isHighPriority ? "high-priority" : "routine"}`}>
                {priorityLabel}
              </span>
            </div>
            <div className="case-meta-item">
              <small>Workflow Status</small>
              <span className={`status ${isUrgent ? "urgent" : ""}`}>
                {c.caseStatus.replaceAll("_", " ")}
              </span>
            </div>
            <div className="case-meta-item">
              <small>Elapsed Wait</small>
              <strong>{formatWaitTime(c.createdAt)}</strong>
            </div>
            <div className="case-meta-item">
              <small>Assigned Physician</small>
              <strong>{data.consultation?.doctorName || "Unassigned"}</strong>
            </div>
            <div className="case-meta-item">
              <small>ABHA / Identity</small>
              {c.identity?.status === "VERIFIED" ? (
                <span className="status ok" title="ABDM Verified Patient">
                  ✓ ABHA Verified {c.identity.abhaLast4 ? `(..${c.identity.abhaLast4})` : ""}
                </span>
              ) : c.identity?.status === "SELF_DECLARED" ? (
                <span className="status routine" title="Self-declared by patient">
                  Self-declared {c.identity.abhaLast4 ? `(..${c.identity.abhaLast4})` : ""}
                </span>
              ) : (
                <span className="helper">Not linked</span>
              )}
            </div>
          </div>

          <div className="actions" style={{ margin: 0 }}>
            {(!data.consultation || data.consultation.status !== "IN_PROGRESS") &&
              c.caseStatus !== "COMPLETED" && (
                <button
                  type="button"
                  className="primary"
                  disabled={!!saving}
                  onClick={() => void action("consultation")}
                >
                  Start consultation
                </button>
              )}
            {data.consultation?.status === "IN_PROGRESS" && (
              <button
                type="button"
                className="primary"
                disabled={!!saving}
                onClick={() => void action("consultation/complete")}
              >
                Complete consultation
              </button>
            )}
            <a
              className="secondary"
              href={`/api/staff/case/${sessionId}/fhir`}
              target="_blank"
              rel="noreferrer"
            >
              FHIR R4 export
            </a>
          </div>
        </div>

        {error && (
          <div className="system-banner error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Next Action Engine Banner */}
        <div className="next-action-banner">
          <div>
            <span className="kicker">{nextActionKicker}</span>
            <h3>{nextActionTitle}</h3>
            <p>{nextActionDescription}</p>
          </div>
          {nextActionType === "START_CONSULT" && (
            <button
              type="button"
              className="next-action-cta"
              disabled={!!saving}
              onClick={() => void action("consultation")}
            >
              Start Consultation →
            </button>
          )}
          {nextActionType === "COMPLETE_CONSULT" && (
            <button
              type="button"
              className="next-action-cta"
              disabled={!!saving}
              onClick={() => void action("consultation/complete")}
            >
              Complete Consultation ✓
            </button>
          )}
        </div>

        {/* What Has Been Reviewed? Checklist */}
        <section className="checklist-panel" aria-label="Clinical Review Checklist">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.02rem" }}>What has been reviewed?</h2>
            <span className="helper">Real-time verification state</span>
          </div>
          <div className="checklist-grid">
            <div className="checklist-item">
              <strong>Clinical history</strong>
              <span className="checklist-badge done">
                ✓ Captured ({data.complaints.length} complaint{data.complaints.length === 1 ? "" : "s"})
              </span>
            </div>
            <div className="checklist-item">
              <strong>Documents</strong>
              <span
                className={`checklist-badge ${
                  data.documents.length === 0 ? "info" : "done"
                }`}
              >
                {data.documents.length === 0
                  ? "None uploaded"
                  : `✓ ${data.documents.length} file(s) processed`}
              </span>
            </div>
            <div className="checklist-item">
              <strong>Safety signals</strong>
              <span
                className={`checklist-badge ${
                  unreviewedSignals.length > 0 ? "pending" : "done"
                }`}
              >
                {unreviewedSignals.length > 0
                  ? `● ${unreviewedSignals.length} needs review`
                  : "✓ Clear"}
              </span>
            </div>
            <div className="checklist-item">
              <strong>AI / OCR evidence</strong>
              <span
                className={`checklist-badge ${
                  unverifiedEvidence.length > 0 ? "pending" : "done"
                }`}
              >
                {data.evidence.length === 0
                  ? "No extracted facts"
                  : unverifiedEvidence.length > 0
                  ? `● ${unverifiedEvidence.length} unverified`
                  : "✓ All verified"}
              </span>
            </div>
            <div className="checklist-item">
              <strong>Contradictions</strong>
              <span
                className={`checklist-badge ${
                  contradictions.length > 0 ? "pending" : "done"
                }`}
              >
                {contradictions.length > 0
                  ? `● ${contradictions.length} potential conflict(s)`
                  : "✓ None detected"}
              </span>
            </div>
            <div className="checklist-item">
              <strong>Dashavidha</strong>
              <span
                className={`checklist-badge ${
                  assessed.size > 0 ? "done" : "info"
                }`}
              >
                {assessed.size > 0 ? `✓ ${assessed.size}/10 assessed` : "Needs assessment"}
              </span>
            </div>
          </div>
        </section>

        {/* Urgent Safety Signals */}
        {unreviewedSignals.length > 0 && (
          <section className="urgent-box" role="alert" style={{ marginBottom: 20 }}>
            <strong style={{ fontSize: "1.05rem", display: "block", marginBottom: 8 }}>
              Urgent clinical signals require physician assessment
            </strong>
            <p className="helper" style={{ color: "#74170f", margin: "0 0 12px" }}>
              These safety flags were identified during intake. Physician judgment determines diagnosis and triage.
            </p>
            {unreviewedSignals.map((x) => (
              <div key={x.id} className="case-section" style={{ borderTopColor: "#f3c2bc", paddingTop: 10 }}>
                <p style={{ margin: "4px 0 8px" }}>
                  <strong>{x.summary}</strong> — {x.reason}
                </p>
                <div className="actions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      await review(`signals/${x.id}`, { status: "REVIEWED" });
                    }}
                  >
                    ✓ Reviewed
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={async () => {
                      await review(`signals/${x.id}`, { status: "ESCALATED" });
                    }}
                  >
                    ▲ Escalate
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      await review(`signals/${x.id}`, { status: "DISMISSED" });
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="console-grid">
          <div>
            {/* Patient Presentation & Clinical History */}
            <section className="panel">
              <h2>Patient overview & history</h2>
              <div className="case-section" style={{ borderTop: 0, paddingTop: 0 }}>
                <h3>Complaints</h3>
                {data.complaints.map((x) => (
                  <div className="evidence" key={x.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{x.position === 1 ? "Chief complaint" : `Complaint #${x.position}`}</strong>
                      {x.severity && (
                        <span className={`severity-tag ${x.severity.toLowerCase()}`}>
                          {x.severity.replaceAll("_", " ")}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "6px 0", fontSize: "1rem" }}>{x.complaintText}</p>
                    <small className="helper">
                      Body area: {x.bodyRegion ?? "not recorded"}
                      {x.bodySubregion ? ` (${x.bodySubregion})` : ""} · Language: {c.language.toUpperCase()}
                    </small>
                  </div>
                ))}
              </div>

              {/* Adaptive Interview */}
              <div className="case-section">
                <h3>Adaptive interview</h3>
                {Object.values(data.interview ?? {}).length ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {Object.values(data.interview ?? {}).map((x: any) => (
                      <div
                        key={x.questionId}
                        style={{
                          background: "#f9fbfb",
                          border: "1px solid #e2ece8",
                          borderRadius: 8,
                          padding: "8px 12px",
                        }}
                      >
                        <b>{x.questionId.replaceAll("_", " ")}:</b>{" "}
                        <span style={{ color: "#183c36" }}>{x.value ?? x.state}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper">No structured interview answers recorded for this session.</p>
                )}
              </div>

              {/* Clinical Summary Draft */}
              <div className="case-section">
                <h3>Clinical intake summary</h3>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#f8fbf9", border: "1px solid #dce8e3", borderRadius: 8, padding: 12 }}>
                  {c.summary ? (typeof c.summary === "string" ? c.summary : JSON.stringify(c.summary, null, 2)) : "Draft intake summary not available."}
                </pre>
              </div>
            </section>

            {/* Documents & Extracted Evidence */}
            <section className="panel">
              <h2>Documents & extracted evidence</h2>
              <p className="helper">
                Physician verifies or rejects structured facts extracted from diagnostic records.
              </p>
              {data.documents.length === 0 ? (
                <p className="helper" style={{ padding: "16px 0" }}>
                  No medical documents uploaded for this session.
                </p>
              ) : (
                data.documents.map((d) => (
                  <div className="case-section" key={d.id}>
                    <strong>📄 {d.originalFilename}</strong>
                    <p className="helper">
                      OCR: {d.ocrStatus} · Extraction: {d.extractionStatus} · Verification: {d.verificationStatus}
                    </p>
                    {data.evidence
                      .filter((e) => e.documentId === d.id)
                      .map((e) => (
                        <div className="evidence" key={e.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <b>{e.category}</b>
                            <span
                              className={`status ${
                                e.verificationState === "VERIFIED"
                                  ? "ok"
                                  : e.verificationState === "REJECTED"
                                  ? "urgent"
                                  : ""
                              }`}
                            >
                              {e.verificationState}
                            </span>
                          </div>
                          <p style={{ margin: "4px 0" }}>
                            {e.originalWording ?? JSON.stringify(e.normalizedValue)}
                          </p>
                          <div className="helper">
                            Page {e.pageNumber ?? "1"} · Method: {e.extractionMethod} · Confidence:{" "}
                            {e.confidence ? `${Math.round(e.confidence * 100)}%` : "N/A"} · Source: {e.provenance}
                          </div>
                          {e.uncertaintyNotes && (
                            <div className="helper" style={{ color: "#a32218" }}>
                              Uncertainty note: {e.uncertaintyNotes}
                            </div>
                          )}
                          <div className="actions" style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="secondary"
                              onClick={async () => {
                                await review(`evidence/${e.id}`, { verificationState: "VERIFIED" });
                              }}
                            >
                              ✓ Verify
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={async () => {
                                await review(`evidence/${e.id}`, { verificationState: "REJECTED" });
                              }}
                            >
                              Reject
                            </button>
                            {e.verificationState !== "UNVERIFIED" && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={async () => {
                                  await review(`evidence/${e.id}`, { verificationState: "UNVERIFIED" });
                                }}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ))
              )}
            </section>

            {/* Anaya Assistant Conversation */}
            <section className="panel">
              <h2>Anaya patient-assistant conversation</h2>
              {data.chat.length ? (
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {data.chat.map((m) => (
                    <div className="evidence" key={m.id}>
                      <b>{m.role === "PATIENT" ? "Patient" : "Anaya"}</b>
                      <p style={{ margin: "4px 0" }}>{m.content}</p>
                      <small className="helper">{new Date(m.createdAt).toLocaleTimeString()}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="helper">No assistant conversation recorded for this visit.</p>
              )}
            </section>
          </div>

          <aside>
            {/* Physician Assessment & Clinical Notes */}
            <section className="panel">
              <h2>Physician assessment & notes</h2>
              <p className="helper">
                Record diagnosis, impressions, treatment plan, or next steps. Physician remains final authority.
              </p>
              {data.notes.map((n) => (
                <div key={n.id} className="evidence">
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.body}</p>
                  <time className="helper" style={{ display: "block", marginTop: 4 }}>
                    {n.authorName ? `${n.authorName} · ` : ""}
                    {new Date(n.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="note">Add clinical note / assessment</label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Record clinical impressions, treatment plans, or instructions…"
                />
              </div>
              <button
                type="button"
                className="primary"
                disabled={!note.trim()}
                onClick={async () => {
                  if(await action("notes",{body:note}))setNote("");
                }}
              >
                Save note
              </button>
            </section>

            {/* Dashavidha Atura Pariksha */}
            <section className="panel">
              <h2>Dashavidha Atura Pariksha</h2>
              <p className="helper">
                {assessed.size}/10 records exist. Missing remains NOT_ASSESSED and is never inferred by AI.
              </p>
              <div className="dash-grid">
                {DASHAVIDHA.map(([key, label, help]) => {
                  const row = assessed.get(key) as any;
                  return (
                    <div className="dash-item" key={key}>
                      <strong>{label}</strong>
                      <p className="helper">{help}</p>
                      <textarea
                        aria-label={`${label} observation`}
                        defaultValue={row?.value ?? ""}
                        id={`d-${key}`}
                        rows={2}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          const el = document.getElementById(`d-${key}`) as HTMLTextAreaElement;
                          setSaving(key);
                          const r = await fetch(`/api/staff/case/${sessionId}/dashavidha`, {
                            method: "PUT",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              observation: key,
                              state: el.value.trim() ? "OBSERVED" : "NOT_ASSESSED",
                              value: el.value.trim() || null,
                            }),
                          });
                          if (r.ok) await load();
                          else setError("Dashavidha observation was not saved.");
                          setSaving("");
                        }}
                      >
                        Save
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

