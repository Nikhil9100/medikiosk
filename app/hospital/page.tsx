"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchStaffMe,
  staffJson,
  staffLogout,
  StaffAuthError,
  type StaffIdentity,
} from "@/lib/staff-client";
import { StatusBadge } from "@/components/badges";

type Funnel = {
  kiosk_intake: number;
  pre_consultation: number;
  document_processing: number;
  in_consultation: number;
  completed: number;
  urgent: number;
  avg_wait_seconds: number;
  bottleneck: string | null;
};

type OpsCase = {
  caseId: string;
  sessionId: string;
  caseStatus: string;
  language: string;
  primaryComplaint: string | null;
  complaintCount: number;
  topSeverity: string | null;
  unreviewedSignals: number;
  documentCount: number;
  documentsProcessing: number;
  demoFlag: boolean;
  createdAt: string;
  completedAt: string | null;
  startedAt: string | null;
  doctorName: string | null;
};

type Kiosk = {
  kioskId: string;
  label: string | null;
  lastSeen: string;
  activeSessionId: string | null;
  lastActivity: string | null;
  status: "ONLINE" | "ATTENTION" | "OFFLINE";
  sessionInterrupted: boolean;
};

type DocPipeline = {
  uploaded: number;
  ocr_processing: number;
  ocr_complete: number;
  extraction_processing: number;
  awaiting_review: number;
  failed: number;
};

type StaffOnDuty = {
  id: string;
  display_name: string;
  title: string | null;
  role: string;
  active_consultations: number;
};

type AuditRow = {
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type Overview = {
  funnel: Funnel;
  completedToday: number;
  cases: OpsCase[];
  kiosks: Kiosk[];
  docPipeline: DocPipeline;
  staffOnDuty: StaffOnDuty[];
};

const KIOSK_STATUS_STYLES: Record<string, string> = {
  ONLINE: "border-green-300 bg-green-50 text-green-800",
  ATTENTION: "border-amber-300 bg-amber-50 text-amber-800",
  OFFLINE: "border-slate-300 bg-slate-100 text-slate-500",
};

const KIOSK_STATUS_GLYPH: Record<string, string> = {
  ONLINE: "●",
  ATTENTION: "◐",
  OFFLINE: "○",
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function StatCard({ label, value, sub, tone = "default" }: { label: string; value: string | number; sub?: string; tone?: "default" | "urgent" | "ok" }) {
  const toneCls =
    tone === "urgent"
      ? "border-red-300 bg-red-50"
      : tone === "ok"
        ? "border-green-200 bg-green-50/50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneCls}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "urgent" ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function HospitalOpsPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [triaging, setTriaging] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([
        staffJson<{ overview: Overview }>("/api/hospital/overview"),
        staffJson<{ audit: AuditRow[] }>("/api/hospital/audit?limit=25").catch(() => ({ audit: [] })),
      ]);
      setOverview(o.overview);
      setAudit(a.audit);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await fetchStaffMe();
        if (cancelled) return;
        if (identity.role !== "HOSPITAL") {
          router.replace("/hospital/login");
          return;
        }
        setStaff(identity);
      } catch (err) {
        if (!cancelled && (err instanceof StaffAuthError || true)) router.replace("/hospital/login");
        return;
      }
      void load();
    })();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, router]);

  async function triageKiosk(kioskId: string) {
    setTriaging(kioskId);
    try {
      await staffJson("/api/hospital/overview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kioskId }),
      });
      await load();
    } catch {
      // triage may be a no-op if already cleared
    } finally {
      setTriaging(null);
    }
  }

  const f = overview?.funnel ?? null;
  const bottleneckLabel: Record<string, string> = {
    KIOSK_INTAKE: "Kiosk intake",
    PRE_CONSULTATION: "Pre-consultation review",
    DOCUMENT_PROCESSING: "Document processing",
    CONSULTATION: "Consultation",
  };

  const funnelStages: Array<{ key: string; label: string; count: number }> = f
    ? [
        { key: "KIOSK_INTAKE", label: "Kiosk intake", count: f.kiosk_intake },
        { key: "PRE_CONSULTATION", label: "Pre-consultation", count: f.pre_consultation },
        { key: "DOCUMENT_PROCESSING", label: "Docs processing", count: f.document_processing },
        { key: "CONSULTATION", label: "In consultation", count: f.in_consultation },
        { key: "COMPLETED", label: "Completed today", count: overview!.completedToday },
      ]
    : [];
  const maxStage = Math.max(1, ...funnelStages.map((s) => s.count));

  const pipelineStages: Array<{ key: string; label: string; count: number }> = overview
    ? [
        { key: "uploaded", label: "Uploaded", count: overview.docPipeline.uploaded },
        { key: "ocr", label: "OCR", count: overview.docPipeline.ocr_processing },
        { key: "ocr_done", label: "OCR done", count: overview.docPipeline.ocr_complete },
        { key: "extraction", label: "Extraction", count: overview.docPipeline.extraction_processing },
        { key: "review", label: "Awaiting review", count: overview.docPipeline.awaiting_review },
        { key: "failed", label: "Failed", count: overview.docPipeline.failed },
      ]
    : [];

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-indigo-600">MediKiosk</span>
            <h1 className="text-lg font-semibold text-slate-900">Hospital Console</h1>
          </div>
          {staff && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">
                {staff.displayName} · <span className="text-slate-400">{staff.title ?? staff.email}</span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  await staffLogout();
                  router.replace("/hospital/login");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 pt-5">
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
        {overview === null && !error && (
          <div className="text-sm text-slate-400" aria-live="polite">Loading operations overview…</div>
        )}

        {overview !== null && f && (
          <>
            {/* Operational cards — every number is a live aggregate */}
            <section aria-label="Operational summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <StatCard label="Waiting review" value={f.pre_consultation} sub="pre-consultation" />
              <StatCard label="Urgent" value={f.urgent} sub="urgent review" tone={f.urgent > 0 ? "urgent" : "default"} />
              <StatCard label="In consultation" value={f.in_consultation} sub={`avg wait ${f.avg_wait_seconds}s`} />
              <StatCard label="Kiosk intake" value={f.kiosk_intake} sub="new / in progress" />
              <StatCard label="Docs processing" value={f.document_processing} sub="OCR + extraction" />
              <StatCard label="Completed today" value={overview.completedToday} sub="consultations" tone="ok" />
              <StatCard
                label="Doctors on duty"
                value={overview.staffOnDuty.filter((s) => s.role === "DOCTOR").length}
                sub={`${overview.kiosks.filter((k) => k.status === "ONLINE").length}/${overview.kiosks.length} kiosks online`}
              />
            </section>

            {/* Funnel with bottleneck visibility */}
            <section aria-labelledby="funnel-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="funnel-heading" className="text-base font-semibold text-slate-900">Patient funnel</h3>
                {f.bottleneck && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    ◈ Bottleneck: {bottleneckLabel[f.bottleneck] ?? f.bottleneck}
                  </span>
                )}
              </div>
              <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
                {funnelStages.map((stage, i) => {
                  const isBottleneck = f.bottleneck === stage.key;
                  return (
                    <li
                      key={stage.key}
                      className={`rounded-lg border p-3 ${isBottleneck ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">
                          {i + 1}. {stage.label}
                        </span>
                        {isBottleneck && <span aria-hidden="true" className="text-xs text-amber-600">◈</span>}
                      </div>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{stage.count}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${isBottleneck ? "bg-amber-500" : "bg-indigo-400"}`}
                          style={{ width: `${Math.min(100, (stage.count / maxStage) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Kiosk network */}
              <section aria-labelledby="kiosks-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 id="kiosks-heading" className="text-base font-semibold text-slate-900">Kiosk network</h3>
                {overview.kiosks.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No kiosk heartbeats recorded yet. Each kiosk device reports liveness via the heartbeat API;
                    states are ONLINE (&lt;45s), ATTENTION (&lt;3min) or OFFLINE.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {overview.kiosks.map((k) => (
                      <li key={k.kioskId} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${KIOSK_STATUS_STYLES[k.status]}`}>
                          <span aria-hidden="true">{KIOSK_STATUS_GLYPH[k.status]}</span>
                          {k.status}
                        </span>
                        <span className="text-sm font-medium text-slate-800">{k.label ?? k.kioskId}</span>
                        <span className="text-xs text-slate-400">last seen {ago(k.lastSeen)}</span>
                        {k.sessionInterrupted && (
                          <>
                            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              SESSION INTERRUPTED
                            </span>
                            <button
                              type="button"
                              disabled={triaging !== null}
                              onClick={() => void triageKiosk(k.kioskId)}
                              className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {triaging === k.kioskId ? "Triaging…" : "Mark triaged"}
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Document processing pipeline */}
              <section aria-labelledby="pipeline-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 id="pipeline-heading" className="text-base font-semibold text-slate-900">Document processing</h3>
                <ol className="mt-4 space-y-1.5">
                  {pipelineStages.map((stage, i) => (
                    <li key={stage.key} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 text-slate-600">{stage.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${stage.key === "failed" && stage.count > 0 ? "bg-red-400" : "bg-slate-400"}`}
                          style={{ width: `${Math.min(100, stage.count * 20)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-semibold text-slate-800">{stage.count}</span>
                      {i < pipelineStages.length - 1 && <span aria-hidden="true" className="sr-only">then</span>}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-slate-400">
                  Live counts from the documents table — OCR and extraction stages of the patient document pipeline.
                </p>
              </section>
            </div>

            {/* Active cases */}
            <section aria-labelledby="cases-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 id="cases-heading" className="text-base font-semibold text-slate-900">Active cases</h3>
              {overview.cases.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No active cases right now.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th scope="col" className="px-3 py-2 font-semibold">Case</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Complaint</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Signals</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Since</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Doctor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.cases.map((c) => (
                        <tr key={c.sessionId} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2">
                            <Link href={`/doctor/case/${c.sessionId}`} className="font-semibold text-indigo-700 hover:underline">
                              {c.caseId}
                            </Link>
                            {c.demoFlag && <span className="ml-1.5 text-[11px] text-amber-600">demo</span>}
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={c.caseStatus} /></td>
                          <td className="px-3 py-2 text-slate-700">{c.primaryComplaint ?? "—"}</td>
                          <td className="px-3 py-2">
                            {c.unreviewedSignals > 0 ? (
                              <span className="text-xs font-semibold text-red-700">▲ {c.unreviewedSignals}</span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{ago(c.createdAt)}</td>
                          <td className="px-3 py-2 text-slate-600">{c.doctorName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Audit feed */}
            <section aria-labelledby="audit-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 id="audit-heading" className="text-base font-semibold text-slate-900">Recent activity (audit log)</h3>
              {audit.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No audit events recorded yet.</p>
              ) : (
                <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1 text-sm">
                  {audit.map((a, i) => (
                    <li key={`${a.createdAt}-${a.action}-${i}`} className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-slate-50 px-3 py-1.5">
                      <span className="font-mono text-xs text-slate-500">{new Date(a.createdAt).toLocaleTimeString()}</span>
                      <span className="font-medium text-slate-800">{a.action}</span>
                      <span className="text-xs text-slate-400">
                        by {a.actorType}{a.targetId ? ` → ${a.targetType ?? "case"} ${a.targetId}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
