"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchStaffMe, staffJson, type StaffIdentity } from "@/lib/staff-client";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { DashavidhaSection, DocumentsSection, HistorySection, SignalsSection } from "./sections";
import type { CaseBundle } from "./types";

export default function DoctorCasePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>("");
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (sid: string) => {
    try {
      const data = await staffJson<CaseBundle>(`/api/staff/case/${sid}`);
      setBundle(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load case");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await fetchStaffMe();
        if (cancelled) return;
        setStaff(identity);
      } catch {
        if (!cancelled) router.replace("/doctor/login");
        return;
      }
      try {
        const p = await params;
        if (cancelled) return;
        setSessionId(p.sessionId);
        void load(p.sessionId);
      } catch {
        if (!cancelled) setLoadError("Invalid case link");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400" aria-live="polite">
        Loading case…
      </div>
    );
  }

  const c = bundle?.case ?? null;
  const inConsultation = c?.caseStatus === "IN_CONSULTATION";
  const canConsult = c?.caseStatus === "AWAITING_REVIEW" || c?.caseStatus === "URGENT_REVIEW";
  const isDoctor = staff?.role === "DOCTOR";

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/doctor" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ← Queue
          </Link>
          {c && (
            <>
              <h1 className="text-lg font-bold text-slate-900">{c.caseId}</h1>
              <StatusBadge status={c.caseStatus} />
              {c.demoFlag && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">demo case</span>}
            </>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {staff?.displayName}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-5">
        {loadError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
        )}

        {bundle === null && !loadError && (
          <div className="text-sm text-slate-400" aria-live="polite">Loading case bundle…</div>
        )}

        {bundle !== null && c && (
          <>
            {/* Patient header */}
            <section aria-label="Case header" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Language</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{c.language}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Consent</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{c.consentStatus}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">{new Date(c.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Consultation</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {c.consultStartedAt ? `${c.doctorName ?? "Doctor"} · ${new Date(c.consultStartedAt).toLocaleString()}` : "not started"}
                  </dd>
                </div>
              </dl>
              {c.completedAt && (
                <p className="mt-2 text-xs text-slate-500">Completed at {new Date(c.completedAt).toLocaleString()}</p>
              )}
            </section>

            {/* At a glance */}
            <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Primary complaint</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{bundle.complaints[0]?.complaintText ?? "—"}</p>
                {bundle.complaints[0]?.severity && (
                  <div className="mt-1"><SeverityBadge severity={bundle.complaints[0].severity} /></div>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Other complaints</p>
                {bundle.complaints.length > 1 ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                    {bundle.complaints.slice(1).map((com) => (
                      <li key={com.id}>{com.complaintText}{com.severity ? ` (${com.severity.toLowerCase()})` : ""}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">none</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Safety signals</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{bundle.signals.filter((s) => s.status === "UNREVIEWED").length}</p>
                <p className="text-xs text-slate-500">unreviewed of {bundle.signals.length} detected</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Documents</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{bundle.documents.length}</p>
                <p className="text-xs text-slate-500">{bundle.evidence.length} evidence items</p>
              </div>
            </section>

            <SignalsSection sessionId={sessionId} signals={bundle.signals} onChanged={() => void load(sessionId)} />
            <HistorySection complaints={bundle.complaints} globalHistory={bundle.globalHistory} />
            <DocumentsSection sessionId={sessionId} bundle={bundle} onChanged={() => void load(sessionId)} />
            <DashavidhaSection
              sessionId={sessionId}
              dashavidha={bundle.dashavidha}
              isDoctor={isDoctor}
              onChanged={() => void load(sessionId)}
            />
            <ConsultationPanel
              sessionId={sessionId}
              bundle={bundle}
              canConsult={canConsult && isDoctor}
              inConsultation={inConsultation}
              isDoctor={isDoctor}
              onChanged={() => void load(sessionId)}
            />
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConsultationPanel({
  sessionId,
  bundle,
  canConsult,
  inConsultation,
  isDoctor,
  onChanged,
}: {
  sessionId: string;
  bundle: CaseBundle;
  canConsult: boolean;
  inConsultation: boolean;
  isDoctor: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [referred, setReferred] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run(action: "start" | "complete" | "note") {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (action === "start") {
        await staffJson(`/api/staff/case/${sessionId}/consultation`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        setOk("Consultation started.");
      } else if (action === "complete") {
        await staffJson(`/api/staff/case/${sessionId}/consultation/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: completeNote.trim(), referred }),
        });
        setCompleteNote("");
        setOk("Consultation completed.");
      } else {
        await staffJson(`/api/staff/case/${sessionId}/notes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: note.trim() }),
        });
        setNote("");
        setOk("Note added.");
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="consult-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="consult-heading" className="text-base font-semibold text-slate-900">Consultation</h3>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {ok && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {canConsult && (
          <button type="button" disabled={busy} onClick={() => void run("start")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            Start consultation
          </button>
        )}
        {inConsultation && (
          <div className="flex w-full flex-wrap items-end gap-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
            <label className="min-w-64 flex-1 text-xs font-medium text-slate-600">
              Consultation note <span className="text-red-500">*</span>
              <textarea
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="What was assessed and concluded?"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={referred} onChange={(e) => setReferred(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Referred to another service
            </label>
            <button type="button" disabled={busy || !completeNote.trim()} onClick={() => void run("complete")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              Complete consultation
            </button>
          </div>
        )}
        {!canConsult && !inConsultation && (
          <p className="text-sm text-slate-500">
            Consultations can be started while the case is awaiting review. Current status: <strong>{bundle.case.caseStatus}</strong>.
          </p>
        )}
      </div>

      {/* Notes */}
      <h4 className="mt-5 text-sm font-semibold text-slate-800">Notes</h4>
      {bundle.notes.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">No notes yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {[...bundle.notes].reverse().map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-700">{n.body}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{n.authorName ?? "Staff"} · {new Date(n.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
      {isDoctor && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("note");
          }}
        >
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a clinical note…"
            aria-label="Add a clinical note"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !note.trim()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Add note
          </button>
        </form>
      )}

      {/* Past consultations */}
      {bundle.consultations.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-slate-800">Consultation history</h4>
          <ul className="mt-2 space-y-2">
            {bundle.consultations.map((con) => (
              <li key={con.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{con.doctorName ?? "Doctor"}</span>
                  <StatusBadge status={con.status} />
                  <span className="text-xs text-slate-400">{new Date(con.startedAt).toLocaleString()}</span>
                </div>
                {con.note && <p className="mt-1 text-slate-600">{con.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
