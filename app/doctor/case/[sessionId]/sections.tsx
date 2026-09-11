"use client";

import { useState } from "react";
import {
  FactStateBadge,
  SeverityBadge,
  SignalStatusBadge,
  VerificationBadge,
} from "@/components/badges";
import { staffJson } from "@/lib/staff-client";
import type {
  BundleComplaint,
  BundleEvidence,
  BundleSignal,
  CaseBundle,
  DashavidhaEntry,
  GlobalHistoryGroup,
} from "./types";

const DOMAIN_LABELS: Record<string, string> = {
  medication: "Current medications",
  allergy: "Allergies",
  history: "Medical history",
  lifestyle: "Lifestyle",
  symptoms: "Symptom details",
};

const DASHAVIDHA_LABELS: Record<string, string> = {
  shabda: "Shabda (voice)",
  roop: "Roop ( complexion / appearance)",
  sparsha: "Sparsha (touch / skin)",
  purana: "Purana (age)",
  prakriti: "Prakriti (constitution)",
  vrikriti: "Vrikriti (habit / metabolism)",
  vikriti: "Vikriti (present imbalance)",
  sthana: "Sthana (localisation)",
};

function evidenceValueDisplay(item: BundleEvidence): string {
  const v = item.normalizedValue;
  if (!v || typeof v !== "object") return item.originalOcrWording || "—";
  const entries = Object.entries(v).slice(0, 6);
  if (entries.length === 0) return item.originalOcrWording || "—";
  return entries
    .map(([k, val]) => {
      const text = Array.isArray(val) ? val.join(", ") : String(val);
      return `${k}: ${text}`;
    })
    .join(" · ");
}

function confidenceLabel(confidence: number | undefined): string | null {
  if (confidence === undefined || Number.isNaN(confidence)) return null;
  return `confidence ${(confidence * 100).toFixed(0)}%`;
}

/* ------------------------------------------------------------------ */
/* Safety signals                                                      */
/* ------------------------------------------------------------------ */

export function SignalsSection({
  sessionId,
  signals,
  onChanged,
}: {
  sessionId: string;
  signals: BundleSignal[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function review(signal: BundleSignal, status: "REVIEWED" | "ESCALATED" | "DISMISSED") {
    setBusyId(signal.id);
    setError(null);
    try {
      const reviewNote = (note[signal.id] ?? "").trim();
      if (status === "DISMISSED" && !reviewNote) {
        setError("A note is required to dismiss a safety signal.");
        return;
      }
      await staffJson(`/api/staff/case/${sessionId}/signals/${signal.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note: reviewNote || undefined }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update signal");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="signals-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 id="signals-heading" className="text-base font-semibold text-slate-900">Safety signals</h3>
        <span className="text-xs text-slate-500">{signals.length} detected · never a diagnosis</span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {signals.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No red-flag signals detected from this intake.</p>
      )}

      <ul className="mt-3 space-y-3">
        {signals.map((s) => (
          <li key={s.id} className={`rounded-lg border p-4 ${s.status === "UNREVIEWED" ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-700">{s.type}</span>
              <SignalStatusBadge status={s.status} />
              <span className="text-xs text-slate-400">source: {s.source}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-800">{s.summary}</p>
            <p className="mt-1 text-xs text-slate-500">{s.reason}</p>
            {s.reviewNote && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <span className="font-semibold">Review note:</span> {s.reviewNote}
              </p>
            )}
            {s.status === "UNREVIEWED" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={note[s.id] ?? ""}
                  onChange={(e) => setNote((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Review note (required to dismiss)"
                  aria-label={`Review note for ${s.type}`}
                  className="min-w-52 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button type="button" disabled={busyId !== null} onClick={() => void review(s, "REVIEWED")} className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50">
                  Mark reviewed
                </button>
                <button type="button" disabled={busyId !== null} onClick={() => void review(s, "ESCALATED")} className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-800 hover:bg-purple-100 disabled:opacity-50">
                  Escalate
                </button>
                <button type="button" disabled={busyId !== null} onClick={() => void review(s, "DISMISSED")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Dismiss
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Clinical history                                                    */
/* ------------------------------------------------------------------ */

function FactList({ facts }: { facts: Array<{ questionId: string; value: string | null; state: string; provenance: string }> }) {
  if (facts.length === 0) return <p className="text-xs text-slate-400">No recorded answers for this domain.</p>;
  return (
    <ul className="space-y-1.5">
      {facts.map((f) => (
        <li key={`${f.questionId}-${f.state}`} className="flex flex-wrap items-center gap-2 text-sm">
          <FactStateBadge state={f.state} />
          <span className="text-slate-700">
            {f.questionId.replace(/_/g, " ")}:{" "}
            {f.value && f.value !== "" ? f.value : <span className="italic text-slate-400">{f.state.toLowerCase()}</span>}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{f.provenance}</span>
        </li>
      ))}
    </ul>
  );
}

export function HistorySection({
  complaints,
  globalHistory,
}: {
  complaints: BundleComplaint[];
  globalHistory: GlobalHistoryGroup[];
}) {
  return (
    <section aria-labelledby="history-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="history-heading" className="text-base font-semibold text-slate-900">Clinical history</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Preserved exactly as captured — UNKNOWN, NOT_ASKED and DECLINED are kept visible and never filled in.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {complaints.map((c: BundleComplaint) => {
          const facts = c.interviewData
            ? Object.values(c.interviewData).sort((a, b) => a.questionId.localeCompare(b.questionId))
            : [];
          return (
            <article key={c.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Complaint {c.position}</span>
                <h4 className="text-sm font-semibold text-slate-900">{c.complaintText}</h4>
                {c.severity && <SeverityBadge severity={c.severity} />}
              </div>
              {(c.bodyRegion || c.bodySubregion) && (
                <p className="mt-1 text-xs text-slate-500">
                  {c.bodyRegion}{c.bodySubregion ? ` · ${c.bodySubregion}` : ""}
                </p>
              )}
              <div className="mt-3">
                <FactList facts={facts} />
              </div>
            </article>
          );
        })}
      </div>

      {globalHistory.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {globalHistory.map((g: GlobalHistoryGroup) => (
            <article key={g.domain} className="rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">{DOMAIN_LABELS[g.domain] ?? g.domain}</h4>
              <div className="mt-2">
                <FactList facts={g.facts} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Documents + evidence                                                */
/* ------------------------------------------------------------------ */

export function DocumentsSection({
  sessionId,
  bundle,
  onChanged,
}: {
  sessionId: string;
  bundle: CaseBundle;
  onChanged: () => void;
}) {
  const [showSourceFor, setShowSourceFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify(item: BundleEvidence, state: "VERIFIED" | "REJECTED" | "UNVERIFIED") {
    setBusyId(item.id);
    setError(null);
    try {
      await staffJson(`/api/staff/case/${sessionId}/evidence/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationState: state }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update evidence");
    } finally {
      setBusyId(null);
    }
  }

  const contradictionGroups = new Map<string, BundleEvidence[]>();
  for (const item of bundle.evidence) {
    if (!item.contradictionGroupId) continue;
    const list = contradictionGroups.get(item.contradictionGroupId) ?? [];
    list.push(item);
    contradictionGroups.set(item.contradictionGroupId, list);
  }

  if (bundle.documents.length === 0 && bundle.evidence.length === 0) {
    return (
      <section aria-labelledby="docs-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 id="docs-heading" className="text-base font-semibold text-slate-900">Document evidence</h3>
        <p className="mt-2 text-sm text-slate-500">No documents were submitted for this case.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="docs-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="docs-heading" className="text-base font-semibold text-slate-900">Document evidence</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Every extracted value carries provenance, method and confidence. Verification is a physician decision —
        patient acceptance never counts as physician verification.
      </p>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {bundle.documents.map((doc) => (
        <article key={doc.id} className="mt-4 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{doc.originalFilename || doc.documentType}</span>
            <span className="text-xs text-slate-400">
              {doc.documentType}{doc.pageCount ? ` · ${doc.pageCount} page(s)` : ""} · {doc.mimeType}
            </span>
            <span className="ml-auto text-xs text-slate-400">OCR: {doc.ocrStatus} · extraction: {doc.extractionStatus}</span>
          </div>
          {doc.errors && doc.errors.length > 0 && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Pipeline errors: {Array.isArray(doc.errors) ? doc.errors.join("; ") : String(doc.errors)}
            </p>
          )}

          <ul className="mt-3 divide-y divide-slate-100">
            {bundle.evidence
              .filter((e) => e.documentId === doc.id)
              .map((item) => {
                const conf = confidenceLabel(item.confidence);
                return (
                  <li key={item.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{item.category}</span>
                      <VerificationBadge state={item.verificationState} />
                      {item.verifiedAt && <span className="text-[11px] text-slate-400">verified {new Date(item.verifiedAt).toLocaleString()}</span>}
                      {item.verificationNote && <span className="text-[11px] text-slate-500">“{item.verificationNote}”</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{evidenceValueDisplay(item)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      page {item.pageNumber} · method {item.extractionMethod} · provider {item.provider?.name ?? "—"}
                      {conf ? ` · ${conf}` : ""}
                      {item.uncertaintyNotes ? ` · ${item.uncertaintyNotes}` : ""}
                    </p>
                    {item.originalOcrWording && (
                      <p className="mt-1 text-xs italic text-slate-400">OCR wording: “{item.originalOcrWording}”</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSourceFor(showSourceFor === item.id ? null : item.id)}
                        aria-expanded={showSourceFor === item.id}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {showSourceFor === item.id ? "Hide source" : "View source"}
                      </button>
                      {item.verificationState !== "VERIFIED" && (
                        <button type="button" disabled={busyId !== null} onClick={() => void verify(item, "VERIFIED")} className="rounded-lg border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-800 hover:bg-green-100 disabled:opacity-50">
                          Verify
                        </button>
                      )}
                      {item.verificationState !== "REJECTED" && (
                        <button type="button" disabled={busyId !== null} onClick={() => void verify(item, "REJECTED")} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
                          Reject
                        </button>
                      )}
                    </div>
                    {showSourceFor === item.id && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                        {JSON.stringify({ normalizedValue: item.normalizedValue, ocrSpan: item.ocrSpan, provider: item.provider }, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
          </ul>
          {bundle.evidence.filter((e) => e.documentId === doc.id).length === 0 && (
            <p className="mt-2 text-xs text-slate-400">No structured evidence extracted from this document yet.</p>
          )}
        </article>
      ))}

      {contradictionGroups.size > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/60 p-4">
          <h4 className="text-sm font-semibold text-amber-900">Contradictions (preserved, never auto-resolved)</h4>
          <ul className="mt-2 space-y-2">
            {[...contradictionGroups.values()].map((group, i) => (
              <li key={i} className="rounded-md border border-amber-200 bg-white p-3 text-sm">
                <p className="font-semibold text-slate-800">
                  {group[0].category} — {group.length > 1 ? `${group.length} conflicting readings` : "potential conflict (requires physician assessment)"}
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                  {group.map((g) => (
                    <li key={g.id}>
                      {evidenceValueDisplay(g)} <VerificationBadge state={g.verificationState} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* AYUSH Dashavidha                                                    */
/* ------------------------------------------------------------------ */

export function DashavidhaSection({
  sessionId,
  dashavidha,
  isDoctor,
  onChanged,
}: {
  sessionId: string;
  dashavidha: Record<string, DashavidhaEntry>;
  isDoctor: boolean;
  onChanged: () => void;
}) {
  const [observation, setObservation] = useState("shabda");
  const [value, setValue] = useState("");
  const [state, setState] = useState<"OBSERVED" | "NOT_ASSESSED" | "NOT_APPLICABLE">("OBSERVED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const observedCount = Object.values(dashavidha).filter((d) => d.state === "OBSERVED").length;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await staffJson(`/api/staff/case/${sessionId}/dashavidha`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          observation,
          value: state === "OBSERVED" ? value.trim() : null,
          state,
          note: note.trim() || undefined,
        }),
      });
      setValue("");
      setNote("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record observation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ayush-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="ayush-heading" className="text-base font-semibold text-slate-900">AYUSH — Dashavidha Pariksha</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Recorded by the physician only ({observedCount}/8 assessed). The system never infers or fabricates observations.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {Object.values(dashavidha).map((d) => (
          <li key={d.observation} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-slate-800">{DASHAVIDHA_LABELS[d.observation] ?? d.observation}</span>
              {d.value && <span className="ml-2 text-slate-600">{d.value}</span>}
              {d.note && <span className="ml-2 text-xs text-slate-400">“{d.note}”</span>}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${d.state === "OBSERVED" ? "border-green-300 bg-green-50 text-green-800" : d.state === "NOT_APPLICABLE" ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
              {d.state === "OBSERVED" ? "Assessed" : d.state === "NOT_APPLICABLE" ? "N/A" : "Not assessed"}
            </span>
          </li>
        ))}
      </ul>

      {isDoctor && (
        <form
          className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-600">
              Observation
              <select value={observation} onChange={(e) => setObservation(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
                {Object.entries(DASHAVIDHA_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              State
              <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
                <option value="OBSERVED">Assessed</option>
                <option value="NOT_ASSESSED">Not assessed</option>
                <option value="NOT_APPLICABLE">Not applicable</option>
              </select>
            </label>
            <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">
              Value {state === "OBSERVED" && <span className="text-red-500">*</span>}
              <input
                type="text"
                value={value}
                disabled={state !== "OBSERVED"}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
                placeholder="e.g. clear and strong"
              />
            </label>
            <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">
              Note
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </label>
            <button type="submit" disabled={busy || (state === "OBSERVED" && !value.trim())} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? "Saving…" : "Record"}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </form>
      )}
    </section>
  );
}
