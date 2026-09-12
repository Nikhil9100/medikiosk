"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Overview = {
  funnel: {
    kioskIntake: number;
    awaitingReview: number;
    urgent: number;
    inConsultation: number;
    completedToday: number;
    avgWaitSeconds: number;
  };
  documents: {
    uploaded: number;
    ocrProcessing: number;
    extractionProcessing: number;
    awaitingReview: number;
    failed: number;
  };
  kiosks: Array<{
    kioskId: string;
    label: string | null;
    status: string;
    lastSeen: string;
    activeSessionId: string | null;
    sessionInterrupted: boolean;
  }>;
  staff: Array<{
    id: string;
    displayName: string;
    title: string | null;
    role: string;
    activeConsultations: number;
  }>;
  cases: Array<{
    sessionId: string;
    caseId: string;
    caseStatus: string;
    unreviewedSignals: number;
    documentCount?: number;
    doctorName?: string | null;
    createdAt: string;
    completedAt?: string | null;
  }>;
};

type Audit = {
  id: string;
  actorType: string;
  actorId?: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
  "case.completed": "Case completed",
  "case.awaiting_review": "Case moved to physician review",
  "case.urgent_review": "Urgent clinical signals detected",
  "consultation.started": "Consultation started",
  "consultation.completed": "Consultation completed",
  "evidence.reviewed": "Evidence verified by physician",
  "safety_signal.reviewed": "Safety signal reviewed",
  "dashavidha.updated": "Dashavidha observation recorded",
  "identity.self_declared": "ABHA linked (self-declared)",
  "identity.skipped": "ABHA step skipped",
  "doctor_note.created": "Clinical note added",
  "kiosk.heartbeat": "Kiosk heartbeat received",
};

function formatAgo(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export default function HospitalOps() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queueFilter, setQueueFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await fetch("/api/staff/me", { cache: "no-store" });
      if (!me.ok) {
        router.replace("/hospital/login");
        return;
      }
      const md = await me.json();
      if (md.staff.role !== "HOSPITAL") {
        router.replace("/hospital/login");
        return;
      }

      const [overviewRes, auditRes] = await Promise.all([
        fetch("/api/hospital/overview", { cache: "no-store" }),
        fetch("/api/hospital/audit?limit=40", { cache: "no-store" }),
      ]);

      if (!overviewRes.ok) {
        throw new Error("HTTP_OVERVIEW_FAILED");
      }

      const overviewData = await overviewRes.json();
      setOverview(overviewData.overview);

      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAudit(auditData.audit ?? []);
      }
      setError("");
    } catch {
      setError("Hospital operations data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const filteredCases = useMemo(() => {
    if (!overview?.cases) return [];
    return overview.cases.filter((c) => {
      if (queueFilter === "URGENT" && c.caseStatus !== "URGENT_REVIEW") return false;
      if (queueFilter === "AWAITING_REVIEW" && c.caseStatus !== "AWAITING_REVIEW") return false;
      if (queueFilter === "IN_CONSULTATION" && c.caseStatus !== "IN_CONSULTATION") return false;
      if (queueFilter === "IN_PROGRESS" && c.caseStatus !== "IN_PROGRESS") return false;
      if (queueFilter === "COMPLETED" && c.caseStatus !== "COMPLETED") return false;

      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      return (
        c.caseId.toLowerCase().includes(term) ||
        (c.doctorName && c.doctorName.toLowerCase().includes(term)) ||
        c.caseStatus.toLowerCase().includes(term)
      );
    });
  }, [overview, queueFilter, searchQuery]);

  if (!overview && loading) {
    return (
      <div className="console-shell">
        <header className="console-header">
          <div className="console-brand">
            <strong>MediKiosk · Hospital Operations</strong>
            <span>Operations command centre</span>
          </div>
        </header>
        <main className="console-main">
          <div className="loading-card">Loading live operations…</div>
        </main>
      </div>
    );
  }

  if (!overview && error) {
    return (
      <div className="console-shell">
        <header className="console-header">
          <div className="console-brand">
            <strong>MediKiosk · Hospital Operations</strong>
            <span>Operations command centre</span>
          </div>
        </header>
        <main className="console-main">
          <div className="system-banner error" role="alert">
            <span>{error}</span>
            <button type="button" className="secondary inline-retry-btn" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  const o = overview!;

  return (
    <div className="console-shell">
      <header className="console-header">
        <div className="console-brand">
          <strong>MediKiosk · Hospital Operations</strong>
          <span>Operations command centre</span>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <button type="button" className="secondary" onClick={() => void load()}>
            ↻ Refresh
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              await fetch("/api/staff/logout", { method: "POST" });
              router.replace("/hospital/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="console-main">
        <div className="console-title">
          <div>
            <p className="eyebrow">OPD pre-consultation operations</p>
            <h1>Hospital command centre</h1>
            <p className="helper">
              Operational metrics below are database-derived from real-time kiosk and clinical workflow state.
            </p>
          </div>
        </div>

        {error && (
          <div className="system-banner error" role="alert">
            <span>{error}</span>
            <button type="button" className="secondary inline-retry-btn" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {/* Top Funnel Metrics */}
        <section className="stat-grid" aria-label="Hospital Funnel Overview">
          <div className="stat">
            <small>Kiosk intake</small>
            <strong>{o.funnel.kioskIntake}</strong>
          </div>
          <div className="stat">
            <small>Awaiting review</small>
            <strong>{o.funnel.awaitingReview}</strong>
          </div>
          <div className={`stat ${o.funnel.urgent > 0 ? "urgent" : ""}`}>
            <small>Urgent review</small>
            <strong>{o.funnel.urgent}</strong>
          </div>
          <div className="stat">
            <small>In consultation</small>
            <strong>{o.funnel.inConsultation}</strong>
          </div>
          <div className="stat">
            <small>Completed today</small>
            <strong>{o.funnel.completedToday}</strong>
          </div>
          <div className="stat">
            <small>Average waiting</small>
            <strong>{Math.round(o.funnel.avgWaitSeconds / 60)}m</strong>
          </div>
        </section>

        <div className="ops-grid">
          {/* OPD Review Queue */}
          <section className="panel">
            <div className="console-title" style={{ marginBottom: 12 }}>
              <div>
                <h2>OPD review queue</h2>
                <p className="helper">
                  Real-time lifecycle: Intake → Awaiting Review → In Consultation → Completed.
                </p>
              </div>
              <div className="actions" style={{ margin: 0 }}>
                <input
                  aria-label="Search cases"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Case ID / Doctor"
                  style={{
                    minHeight: 38,
                    border: "1px solid #c8d4d1",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: "0.82rem",
                  }}
                />
                <select
                  aria-label="Filter status"
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value)}
                  style={{
                    minHeight: 38,
                    border: "1px solid #c8d4d1",
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: "0.82rem",
                  }}
                >
                  <option value="ALL">All ({o.cases.length})</option>
                  <option value="URGENT">Urgent review ({o.funnel.urgent})</option>
                  <option value="AWAITING_REVIEW">Awaiting review ({o.funnel.awaitingReview})</option>
                  <option value="IN_CONSULTATION">In consultation ({o.funnel.inConsultation})</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table hospital-queue-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Safety</th>
                    <th>Documents</th>
                    <th>Waiting</th>
                    <th>Assigned Doctor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.slice(0, 20).map((c) => {
                    const isUrgent = c.caseStatus === "URGENT_REVIEW" || c.unreviewedSignals > 0;
                    return (
                      <tr key={c.sessionId}>
                        <td data-label="Case">
                          <strong>{c.caseId}</strong>
                        </td>
                        <td data-label="Priority">
                          <span className={`status ${isUrgent ? "urgent" : "ok"}`}>
                            {isUrgent ? "▲ Urgent" : "Routine"}
                          </span>
                        </td>
                        <td data-label="Status">
                          <span className={`status ${c.caseStatus === "URGENT_REVIEW" ? "urgent" : ""}`}>
                            {c.caseStatus.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td data-label="Safety">
                          {c.unreviewedSignals > 0 ? (
                            <span className="status urgent">▲ {c.unreviewedSignals} unreviewed</span>
                          ) : (
                            <span className="status ok">✓ Clear</span>
                          )}
                        </td>
                        <td data-label="Documents">
                          {(c.documentCount ?? 0) > 0 ? `${c.documentCount} files` : "—"}
                        </td>
                        <td data-label="Waiting">{formatAgo(c.createdAt)}</td>
                        <td data-label="Assigned Doctor">
                          {c.doctorName || <span className="helper">Unassigned</span>}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredCases.length === 0 && (
                    <tr className="empty-row">
                      <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>
                        No matching cases in this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Document Pipeline */}
          <section className="panel">
            <h2>Document / diagnostics readiness</h2>
            <p className="helper">
              Operational intake document status pipeline across OCR, structured extraction, and clinical review.
            </p>
            <div className="stat-grid" style={{ marginTop: 12 }}>
              <div className="stat">
                <small>Uploaded</small>
                <strong>{o.documents.uploaded}</strong>
              </div>
              <div className="stat">
                <small>OCR processing</small>
                <strong>{o.documents.ocrProcessing}</strong>
              </div>
              <div className="stat">
                <small>Extraction</small>
                <strong>{o.documents.extractionProcessing}</strong>
              </div>
              <div className="stat">
                <small>Awaiting review</small>
                <strong>{o.documents.awaitingReview}</strong>
              </div>
              <div className={`stat ${o.documents.failed > 0 ? "urgent" : ""}`}>
                <small>Failed</small>
                <strong>{o.documents.failed}</strong>
              </div>
            </div>
          </section>

          {/* Kiosk Network */}
          <section className="panel">
            <h2>Kiosk network</h2>
            <p className="helper">
              Live status and heartbeat telemetry from deployed intake kiosk terminals.
            </p>
            {o.kiosks.length === 0 ? (
              <p className="helper" style={{ padding: "16px 0" }}>
                No kiosk heartbeat has been received.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {o.kiosks.map((k) => (
                  <div className="kiosk-row" key={k.kioskId}>
                    <div>
                      <strong>{k.label || k.kioskId}</strong>
                      <div className="helper">
                        Last seen {formatAgo(k.lastSeen)}
                        {k.activeSessionId ? " · Active session in progress" : " · Idle"}
                      </div>
                    </div>
                    <span
                      className={`status ${
                        k.status === "ONLINE" ? "ok" : k.status === "ATTENTION" ? "urgent" : ""
                      }`}
                    >
                      {k.status}
                      {k.sessionInterrupted ? " · SESSION INTERRUPTED" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Clinical Staff on Duty */}
          <section className="panel">
            <h2>Clinical staff on duty</h2>
            <p className="helper">
              Authenticated medical staff currently active in this facility.
            </p>
            {o.staff.length === 0 ? (
              <p className="helper" style={{ padding: "16px 0" }}>
                No active staff sessions.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {o.staff.map((s) => (
                  <div className="staff-row" key={s.id}>
                    <div>
                      <strong>{s.displayName}</strong>
                      <div className="helper">{s.title || s.role}</div>
                    </div>
                    <span className="status ok">
                      {s.activeConsultations} active consultation
                      {s.activeConsultations === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Audit Trail */}
        <section className="panel" style={{ marginTop: 24 }}>
          <h2>Audit trail</h2>
          <p className="helper">
            Immutable log of clinical and operational access events for clinical accountability and governance.
          </p>
          <div style={{ marginTop: 14 }}>
            {audit.length === 0 ? (
              <p className="helper">No recent audit events recorded.</p>
            ) : (
              audit.slice(0, 25).map((a) => {
                const actionLabel = ACTION_DESCRIPTIONS[a.action] || a.action.replaceAll(".", " · ");
                return (
                  <div className="audit-row" key={a.id}>
                    <div>
                      <strong>{actionLabel}</strong>
                      <div className="helper">
                        {a.actorType}
                        {a.targetType ? ` → ${a.targetType}` : ""}
                        {a.targetId ? ` ${a.targetId}` : ""}
                      </div>
                    </div>
                    <time style={{ fontSize: "0.78rem", color: "#6b7f78" }}>
                      {formatAgo(a.createdAt)} ({new Date(a.createdAt).toLocaleTimeString()})
                    </time>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
