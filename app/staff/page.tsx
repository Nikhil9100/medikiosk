"use client";

import Link from "next/link";

export default function StaffPortal() {
  return (
    <div className="console-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="console-header">
        <div className="console-brand">
          <strong>MediKiosk · Staff & Clinician Portal</strong>
          <span>OPD Clinical & Operations Gateway</span>
        </div>
        <div>
          <Link href="/patient" className="secondary" style={{ textDecoration: "none", fontSize: "0.85rem" }}>
            ← Patient Kiosk
          </Link>
        </div>
      </header>

      <main className="console-main" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p className="eyebrow" style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ck-green)", fontWeight: 700 }}>
            Authorised Staff Only
          </p>
          <h1 style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.3rem)", color: "var(--ck-ink)", margin: "8px 0 12px" }}>
            MediKiosk Staff Consoles
          </h1>
          <p className="helper" style={{ maxWidth: 620, margin: "0 auto", fontSize: "0.95rem" }}>
            Access clinical case reviews, real-time patient queues, OPD operations monitoring, and device telemetry. Select your workspace below:
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginBottom: 36 }}>
          {/* Doctor Console Card */}
          <div
            className="panel"
            style={{
              margin: 0,
              padding: 28,
              borderRadius: 18,
              border: "1.5px solid var(--ck-line)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "var(--ck-sh-2)",
              background: "#ffffff",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: "2rem" }}>🩺</span>
                <span className="status ok">Clinician Review</span>
              </div>
              <h2 style={{ fontSize: "1.35rem", margin: "0 0 10px", color: "var(--ck-ink)" }}>
                Doctor Console
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--ck-ink-2)", lineHeight: 1.5, margin: "0 0 18px" }}>
                Prioritized clinical triage queue, chief complaint breakdown, extracted medical evidence, safety signals review, and digital physician assessment notes.
              </p>
            </div>

            <div>
              <div
                style={{
                  background: "var(--ck-surface-2)",
                  border: "1px solid var(--ck-line)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: "0.82rem",
                  color: "var(--ck-ink-2)",
                  marginBottom: 18,
                }}
              >
                <strong>Demo Doctor Credentials:</strong>
                <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: "0.8rem", color: "var(--ck-green)" }}>
                  Email: <strong>doctor@medikiosk.local</strong><br />
                  Password: <strong>doctor123</strong>
                </div>
              </div>

              <Link
                href="/doctor/login"
                className="primary"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px 20px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  textDecoration: "none",
                }}
              >
                Open Doctor Console →
              </Link>
            </div>
          </div>

          {/* Hospital Console Card */}
          <div
            className="panel"
            style={{
              margin: 0,
              padding: 28,
              borderRadius: 18,
              border: "1.5px solid var(--ck-line)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "var(--ck-sh-2)",
              background: "#ffffff",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: "2rem" }}>🏥</span>
                <span className="status high-priority">Command Centre</span>
              </div>
              <h2 style={{ fontSize: "1.35rem", margin: "0 0 10px", color: "var(--ck-ink)" }}>
                Hospital Console
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--ck-ink-2)", lineHeight: 1.5, margin: "0 0 18px" }}>
                Real-time OPD patient intake funnel, emergency triage alerts, diagnostic readiness pipeline, kiosk fleet telemetry, staff availability, and audit trail.
              </p>
            </div>

            <div>
              <div
                style={{
                  background: "var(--ck-surface-2)",
                  border: "1px solid var(--ck-line)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: "0.82rem",
                  color: "var(--ck-ink-2)",
                  marginBottom: 18,
                }}
              >
                <strong>Demo Hospital Credentials:</strong>
                <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: "0.8rem", color: "var(--ck-green)" }}>
                  Email: <strong>hospital@medikiosk.local</strong><br />
                  Password: <strong>hospital123</strong>
                </div>
              </div>

              <Link
                href="/hospital/login"
                className="primary"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px 20px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  backgroundColor: "#1f4f8b",
                }}
              >
                Open Hospital Console →
              </Link>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "0.82rem", color: "var(--ck-ink-3)", margin: 0 }}>
            🔒 Role-based access control (RBAC) enforced. Doctor accounts cannot access Hospital operations, and Hospital accounts cannot view unredacted clinical complaints.
          </p>
        </div>
      </main>
    </div>
  );
}
