"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DoctorLogin() {
  const r = useRouter();
  const [email, setEmail] = useState("doctor@medikiosk.local");
  const [password, setPassword] = useState("doctor123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          d.error ||
            (res.status === 429
              ? "Too many attempts. Try again in 5 minutes."
              : "Unable to sign in. Please verify credentials.")
        );
        setBusy(false);
        return;
      }
      if (d.staff?.role !== "DOCTOR") {
        await fetch("/api/staff/logout", { method: "POST" });
        setError("This account is not authorised for the Doctor Console (requires DOCTOR role).");
        setBusy(false);
        return;
      }
      r.replace("/doctor");
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  function fillDemo() {
    setEmail("doctor@medikiosk.local");
    setPassword("doctor123");
    setError("");
  }

  return (
    <main className="console-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="login-card" style={{ maxWidth: 460, width: "100%" }}>
        <p className="eyebrow">Clinical staff</p>
        <h1>Doctor Console</h1>
        <p className="helper">Authorised doctors only. Access is audited.</p>

        <div
          style={{
            background: "#f0faf6",
            border: "1px solid #b8e6d6",
            borderRadius: "10px",
            padding: "12px 14px",
            fontSize: "0.85rem",
            color: "#085d4b",
            margin: "14px 0 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div>
            <strong>💡 Quick Demo Access:</strong>
            <div style={{ fontFamily: "monospace", fontSize: "0.82rem", marginTop: 2 }}>
              doctor@medikiosk.local · <strong>doctor123</strong>
            </div>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={fillDemo}
            style={{
              padding: "4px 10px",
              fontSize: "0.78rem",
              background: "#ffffff",
              border: "1px solid #0b5d4b",
              color: "#0b5d4b",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ⚡ Auto-Fill Demo
          </button>
        </div>

        <form onSubmit={login} className="form-grid">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              placeholder="doctor@medikiosk.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="doctor123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="system-banner error" role="alert" style={{ marginTop: 4 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary"
            disabled={busy || !email || !password}
            style={{ marginTop: 8 }}
          >
            {busy ? "Signing in…" : "Sign in to Doctor Console →"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center", display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
          <Link href="/staff" style={{ color: "var(--ck-ink-3)", textDecoration: "none" }}>
            ← Staff Portal
          </Link>
          <Link href="/hospital/login" style={{ color: "var(--ck-blue)", textDecoration: "none" }}>
            Go to Hospital Console →
          </Link>
        </div>
      </div>
    </main>
  );
}

