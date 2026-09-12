"use client";

import { useCallback, useEffect, useState } from "react";
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
  } | null;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
  }>;
};

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
            <div className="loading-card">Loading case…</div>
          )}
        </main>
      </div>
    );
  }

  const c = data.case;
  const assessed = new Map(data.dashavidha.map((x) => [x.observation, x]));
  const unreviewedSignals = data.signals.filter((x) => x.status === "UNREVIEWED");

  return (
    <div className="console-shell">
      <header className="console-header">
        <div className="console-brand">
          <strong>MediKiosk · Clinical Review</strong>
          <span>Case {c.caseId}</span>
        </div>
        <Link className="secondary" href="/doctor">
          ← Queue
        </Link>
      </header>

      <main className="console-main">
        <div className="console-title">
          <div>
            <p className="eyebrow">Physician review</p>
            <h1>{c.caseId}</h1>
            <p className="helper">
              Language: {c.language.toUpperCase()} · Consent: {c.consentStatus} · ABHA:{" "}
              {c.identity?.status ?? "NOT_PROVIDED"}
              {c.identity?.abhaLast4 ? ` · •••• ${c.identity.abhaLast4}` : ""}
            </p>
          </div>
          <div className="actions" style={{ margin: 0 }}>
            {!data.consultation && (
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
            {error}
          </div>
        )}

        {/* Urgent Safety Signals */}
        {unreviewedSignals.length > 0 && (
          <section className="urgent-box" role="alert">
            <strong>Urgent clinical signals require physician assessment</strong>
            {unreviewedSignals.map((x) => (
              <div key={x.id} className="case-section">
                <p>
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
            {/* Physician-Ready History */}
            <section className="panel">
              <h2>Physician-ready history</h2>
              <div className="case-section">
                <h3>Complaints</h3>
                {data.complaints.map((x) => (
                  <div className="evidence" key={x.id}>
                    <strong>{x.position === 1 ? "Chief complaint" : "Additional complaint"}</strong>
                    <p style={{ margin: "4px 0" }}>{x.complaintText}</p>
                    <small>
                      Severity: {x.severity ?? "not recorded"} · Body area: {x.bodyRegion ?? "not recorded"}
                      {x.bodySubregion ? ` (${x.bodySubregion})` : ""}
                    </small>
                  </div>
                ))}
              </div>

              <div className="case-section">
                <h3>Adaptive interview</h3>
                {Object.values(data.interview ?? {}).length ? (
                  Object.values(data.interview ?? {}).map((x: any) => (
                    <p key={x.questionId}>
                      <b>{x.questionId.replaceAll("_", " ")}:</b> {x.state}
                      {x.value ? ` — ${x.value}` : ""}
                    </p>
                  ))
                ) : (
                  <p className="helper">No structured interview answers available.</p>
                )}
              </div>

              <div className="case-section">
                <h3>Clinical summary draft</h3>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                  {c.summary ? JSON.stringify(c.summary, null, 2) : "Not generated yet."}
                </pre>
              </div>
            </section>

            {/* Documents & Extracted Evidence */}
            <section className="panel">
              <h2>Documents & extracted evidence</h2>
              {data.documents.length === 0 ? (
                <p className="helper">No documents uploaded.</p>
              ) : (
                data.documents.map((d) => (
                  <div className="case-section" key={d.id}>
                    <strong>{d.originalFilename}</strong>
                    <p className="helper">
                      OCR: {d.ocrStatus} · Extraction: {d.extractionStatus} · Review: {d.verificationStatus}
                    </p>
                    {data.evidence
                      .filter((e) => e.documentId === d.id)
                      .map((e) => (
                        <div className="evidence" key={e.id}>
                          <b>{e.category}</b>: {e.originalWording ?? JSON.stringify(e.normalizedValue)}
                          <div className="helper">
                            Page {e.pageNumber ?? "?"} · Method: {e.extractionMethod} · State:{" "}
                            {e.verificationState} · Provenance: {e.provenance}
                          </div>
                          {e.uncertaintyNotes && (
                            <div className="helper">Uncertainty: {e.uncertaintyNotes}</div>
                          )}
                          <div className="actions" style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="secondary"
                              onClick={async () => {
                                await review(`evidence/${e.id}`, { verificationState: "VERIFIED" });
                              }}
                            >
                              Verify
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
                data.chat.map((m) => (
                  <div className="evidence" key={m.id}>
                    <b>{m.role === "PATIENT" ? "Patient" : "Anaya"}</b>
                    <p style={{ margin: "4px 0" }}>{m.content}</p>
                  </div>
                ))
              ) : (
                <p className="helper">No assistant conversation for this visit.</p>
              )}
            </section>
          </div>

          <aside>
            {/* Dashavidha Atura Pariksha */}
            <section className="panel">
              <h2>Dashavidha Atura Pariksha</h2>
              <p className="helper">
                {assessed.size}/10 records exist. Missing remains NOT_ASSESSED and is never inferred.
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

            {/* Doctor Notes */}
            <section className="panel">
              <h2>Doctor notes</h2>
              {data.notes.map((n) => (
                <div key={n.id} className="evidence">
                  <p style={{ margin: 0 }}>{n.body}</p>
                  <time className="helper">{new Date(n.createdAt).toLocaleString()}</time>
                </div>
              ))}
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="note">Add clinical note</label>
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
          </aside>
        </div>
      </main>
    </div>
  );
}
