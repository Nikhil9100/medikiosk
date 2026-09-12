"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Staff = {
  id?: string;
  displayName: string;
  email: string;
  role: string;
  title?: string | null;
};

type Case = {
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
  createdAt: string;
  completedAt?: string | null;
  doctorId?: string | null;
  doctorName: string | null;
};

function formatWaitTime(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d`;
}

export default function DoctorQueue() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    try {
      const me = await fetch("/api/staff/me", { cache: "no-store" });
      if (!me.ok) {
        router.replace("/doctor/login");
        return;
      }
      const md = await me.json();
      if (md.staff.role !== "DOCTOR") {
        router.replace("/doctor/login");
        return;
      }
      setStaff(md.staff);

      const res = await fetch("/api/staff/queue", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("HTTP_FAILED");
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.cases ?? [];
      setCases(list);
      setError("");
    } catch {
      setError("Unable to load the clinical queue.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    return cases.filter((c) => {
      if (filter === "URGENT_REVIEW" && c.caseStatus !== "URGENT_REVIEW") return false;
      if (filter === "AWAITING_REVIEW" && c.caseStatus !== "AWAITING_REVIEW") return false;
      if (filter === "IN_CONSULTATION" && c.caseStatus !== "IN_CONSULTATION") return false;
      if (filter === "MY_CASES" && (!staff?.id || c.doctorId !== staff.id)) return false;

      if (!q) return true;
      const term = q.toLowerCase();
      return (
        c.caseId.toLowerCase().includes(term) ||
        (c.primaryComplaint && c.primaryComplaint.toLowerCase().includes(term)) ||
        (c.doctorName && c.doctorName.toLowerCase().includes(term))
      );
    });
  }, [cases, filter, q, staff]);

  const urgentCount = cases.filter((c) => c.caseStatus === "URGENT_REVIEW").length;
  const awaitingCount = cases.filter((c) => c.caseStatus === "AWAITING_REVIEW").length;
  const inConsultCount = cases.filter((c) => c.caseStatus === "IN_CONSULTATION").length;
  const myCasesCount = staff?.id ? cases.filter((c) => c.doctorId === staff.id).length : 0;

  return (
    <div className="console-shell">
      <header className="console-header">
        <div className="console-brand">
          <strong>MediKiosk · Clinical Review</strong>
          <span>Physician review workspace · Hospital OPD</span>
        </div>
        <div className="console-user">
          {staff && (
            <span className="staff-badge">
              <strong>{staff.displayName}</strong>
              <small>{staff.title || "Physician"}</small>
            </span>
          )}
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              await fetch("/api/staff/logout", { method: "POST" });
              router.replace("/doctor/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="console-main">
        <div className="console-title">
          <div>
            <p className="eyebrow">OPD pre-consultation</p>
            <h1>Clinical case queue</h1>
            <p className="helper">
              Urgent cases are always surfaced first. Refreshes every 30 seconds.
            </p>
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <button type="button" className="secondary" onClick={() => void load()}>
              ↻ Refresh
            </button>
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

        <section className="stat-grid" aria-label="Queue Summary Metrics">
          <div className={`stat ${urgentCount > 0 ? "urgent" : ""}`}>
            <small>Urgent review</small>
            <strong>{urgentCount}</strong>
          </div>
          <div className="stat">
            <small>Awaiting review</small>
            <strong>{awaitingCount}</strong>
          </div>
          <div className="stat">
            <small>In consultation</small>
            <strong>{inConsultCount}</strong>
          </div>
          <div className="stat">
            <small>My active cases</small>
            <strong>{myCasesCount}</strong>
          </div>
          <div className="stat">
            <small>Total active queue</small>
            <strong>{cases.length}</strong>
          </div>
        </section>

        <section className="panel">
          <div className="console-title">
            <div>
              <h2>Patients awaiting clinical action</h2>
              <p className="helper">
                Select any patient to review history, extracted evidence, safety signals, and begin consultation.
              </p>
            </div>
            <div className="actions" style={{ margin: 0 }}>
              <input
                aria-label="Search cases"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search case ID / complaint"
                style={{
                  minHeight: 44,
                  border: "1px solid #c8d4d1",
                  borderRadius: 10,
                  padding: "8px 12px",
                }}
              />
              <select
                aria-label="Filter status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  minHeight: 44,
                  border: "1px solid #c8d4d1",
                  borderRadius: 10,
                  padding: "8px 12px",
                }}
              >
                <option value="ALL">All active ({cases.length})</option>
                <option value="URGENT_REVIEW">Urgent review ({urgentCount})</option>
                <option value="AWAITING_REVIEW">Awaiting review ({awaitingCount})</option>
                <option value="IN_CONSULTATION">In consultation ({inConsultCount})</option>
                <option value="MY_CASES">My active cases ({myCasesCount})</option>
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table doctor-queue-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Case</th>
                  <th>Primary complaint</th>
                  <th>Severity</th>
                  <th>Safety</th>
                  <th>Documents</th>
                  <th>Waiting</th>
                  <th>Doctor</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const isUrgent = c.caseStatus === "URGENT_REVIEW" || c.unreviewedSignals > 0;
                  const isMine = staff?.id && c.doctorId === staff.id;

                  return (
                    <tr key={c.sessionId}>
                      <td data-label="Priority">
                        <span className={`status ${isUrgent ? "urgent" : "ok"}`}>
                          {isUrgent ? "▲ Urgent" : "Routine"}
                        </span>
                      </td>
                      <td data-label="Case">
                        <Link href={`/doctor/case/${c.sessionId}`}>
                          <strong>{c.caseId}</strong>
                        </Link>
                        <div className="helper">{c.language.toUpperCase()}</div>
                      </td>
                      <td data-label="Primary complaint">
                        <span>{c.primaryComplaint || "Not provided"}</span>
                        {c.complaintCount > 1 && (
                          <small className="extra-complaints-tag">
                            {" "}+{c.complaintCount - 1} more
                          </small>
                        )}
                      </td>
                      <td data-label="Severity">
                        {c.topSeverity ? (
                          <span className={`severity-tag ${c.topSeverity.toLowerCase()}`}>
                            {c.topSeverity.replaceAll("_", " ")}
                          </span>
                        ) : (
                          <span className="helper">—</span>
                        )}
                      </td>
                      <td data-label="Safety">
                        {c.unreviewedSignals > 0 ? (
                          <span className="status urgent">▲ {c.unreviewedSignals} unreviewed</span>
                        ) : (
                          <span className="status ok">✓ Clear</span>
                        )}
                      </td>
                      <td data-label="Documents">
                        {c.documentCount > 0 ? (
                          <span>
                            {c.documentCount} {c.documentCount === 1 ? "file" : "files"}
                            {c.documentsProcessing > 0 && (
                              <small className="helper"> · {c.documentsProcessing} reading</small>
                            )}
                          </span>
                        ) : (
                          <span className="helper">None</span>
                        )}
                      </td>
                      <td data-label="Waiting">{formatWaitTime(c.createdAt)}</td>
                      <td data-label="Doctor">
                        {isMine ? (
                          <span className="status ok">Assigned to me</span>
                        ) : c.doctorName ? (
                          <span>{c.doctorName}</span>
                        ) : (
                          <span className="helper">Unassigned</span>
                        )}
                      </td>
                      <td data-label="Action">
                        <Link
                          href={`/doctor/case/${c.sessionId}`}
                          className={`primary ${isUrgent ? "urgent-action" : ""}`}
                          style={{
                            padding: "6px 14px",
                            fontSize: "0.82rem",
                            borderRadius: 8,
                            textDecoration: "none",
                            display: "inline-block",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.caseStatus === "IN_CONSULTATION" ? "In Consultation" : "Review Case"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {shown.length === 0 && !loading && (
                  <tr className="empty-row">
                    <td colSpan={9} style={{ textAlign: "center", padding: "28px" }}>
                      {error ? "Unable to load cases due to a connection error." : "No matching cases."}
                    </td>
                  </tr>
                )}

                {loading && shown.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={9} style={{ textAlign: "center", padding: "28px" }}>
                      Loading clinical queue…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
