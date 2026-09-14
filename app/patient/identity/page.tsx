"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatAbhaNumber, validAbhaAddress, validAbhaNumber } from "@/lib/patient-identity";
import type { VerifiedAbdmProfile } from "@/lib/abdm";
import { usePatient } from "../PatientShell";

export default function Identity() {
  const router = useRouter();
  const { mutate, sync, ensureSynced, connection, t } = usePatient();

  // Verification mode: "otp" (ABDM OTP) or "manual" (self-declaration)
  const [mode, setMode] = useState<"otp" | "manual">("otp");

  // Manual / Self-declared fields
  const [number, setNumber] = useState("");
  const [address, setAddress] = useState("");

  // ABDM OTP verification flow
  const [abdmInput, setAbdmInput] = useState("");
  const [abdmStep, setAbdmStep] = useState<"input" | "otp" | "verified">("input");
  const [txnId, setTxnId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [maskedMobile, setMaskedMobile] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [verifiedProfile, setVerifiedProfile] = useState<VerifiedAbdmProfile | null>(null);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // ABDM Step 1: Send OTP
  async function handleSendAbdmOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");

    const clean = abdmInput.trim();
    if (!clean) {
      setError("Please enter your 14-digit ABHA Number or @abdm Address.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/patient/auth/abha/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to initiate ABDM verification.");
        setBusy(false);
        return;
      }

      setTxnId(data.txnId);
      setMaskedMobile(data.maskedMobile || "");
      setDevOtp(data.devOtp || "123456");
      setAbdmStep("otp");
    } catch {
      setError("Network error communicating with ABDM Gateway.");
    } finally {
      setBusy(false);
    }
  }

  // ABDM Step 2: Verify OTP
  async function handleVerifyAbdmOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");

    if (otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit OTP code.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/patient/auth/abha/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txnId, otp: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid ABDM OTP code.");
        setBusy(false);
        return;
      }

      setVerifiedProfile(data.profile);
      setAbdmStep("verified");
    } catch {
      setError("Failed to verify ABDM OTP. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  // Proceed with verified profile
  async function handleProceedVerified() {
    if (busy) return;
    setBusy(true);
    if (await sync({ workflowStep: "complaint" })) {
      router.push("/patient/complaint");
      return;
    }
    setBusy(false);
  }

  // Manual submit or skip
  async function submit(skip = false) {
    if (busy) return;
    setBusy(true);
    setError("");

    if (!skip && number && !validAbhaNumber(number)) {
      setError(t("abhaInvalidNumber") || "Enter a valid 14-digit ABHA number or leave it blank.");
      setBusy(false);
      return;
    }

    if (!skip && address && !validAbhaAddress(address)) {
      setError(
        t("abhaInvalidAddress") || "Enter a valid ABHA address ending in @abdm or leave it blank."
      );
      setBusy(false);
      return;
    }

    if (!skip && connection === "offline") {
      setError(
        "For privacy, full ABHA values are never cached offline. Reconnect to save them, or continue without ABHA."
      );
      setBusy(false);
      return;
    }

    let ok = false;
    if (!skip && !(await ensureSynced())) {
      setError(
        "Reconnect before saving ABHA. Full ABHA values are never cached offline."
      );
      setBusy(false);
      return;
    }

    if (skip) {
      const res = await mutate("/api/patient/identity", "POST", { skip: true });
      ok = res.ok;
    } else {
      try {
        const res = await fetch("/api/patient/identity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            abhaNumber: number || undefined,
            abhaAddress: address || undefined,
          }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
    }

    if (!ok) {
      setError(
        skip
          ? t("saveFailedRetry") || "Could not save the skip choice. Please retry."
          : "Identity details could not be saved safely. Your full ABHA value was not cached."
      );
      setBusy(false);
      return;
    }

    if (await sync({ workflowStep: "complaint" })) {
      setNumber("");
      setAddress("");
      router.push("/patient/complaint");
      return;
    }
    setBusy(false);
  }

  return (
    <section className="flow-card reference-card identity-reference-card">
      <div className="centered-reference-heading">
        <div className="reference-icon-badge id-card" aria-hidden="true">
          ▣
        </div>
        <p className="eyebrow">{t("identityEyebrow") || "3 · ABHA (Optional)"}</p>
        <h1>
          {t("identityHeading")}{" "}
          <span className="soft-title">{t("identityOptional") || "(Optional)"}</span>
        </h1>
        <p className="lead">{t("identityLead")}</p>
      </div>

      <div className="abha-info-card">
        <strong>{t("abhaCardTitle")}</strong>
        <span>{t("abhaCardDesc")}</span>
      </div>

      {/* Mode Switcher */}
      <div
        className="abha-mode-switcher"
        style={{
          display: "flex",
          gap: 8,
          margin: "18px 0",
          padding: 4,
          background: "#edf4f1",
          borderRadius: 12,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode("otp");
            setError("");
          }}
          style={{
            flex: 1,
            padding: "9px 12px",
            borderRadius: 9,
            border: "none",
            background: mode === "otp" ? "#ffffff" : "transparent",
            color: mode === "otp" ? "#075a48" : "#4e6760",
            fontWeight: 700,
            fontSize: "0.85rem",
            boxShadow: mode === "otp" ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
            cursor: "pointer",
          }}
        >
          🔐 Verify via ABDM OTP
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("manual");
            setError("");
          }}
          style={{
            flex: 1,
            padding: "9px 12px",
            borderRadius: 9,
            border: "none",
            background: mode === "manual" ? "#ffffff" : "transparent",
            color: mode === "manual" ? "#075a48" : "#4e6760",
            fontWeight: 700,
            fontSize: "0.85rem",
            boxShadow: mode === "manual" ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
            cursor: "pointer",
          }}
        >
          📝 Self-Declare Manually
        </button>
      </div>

      {mode === "otp" ? (
        <div className="abdm-otp-container">
          {abdmStep === "input" && (
            <form onSubmit={handleSendAbdmOtp}>
              <div className="field" style={{ marginBottom: 16 }}>
                <label htmlFor="abdm-identifier" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                  ABHA Number (14 digits) or ABHA Address
                </label>
                <input
                  id="abdm-identifier"
                  placeholder="e.g. 14-1234-5678-9821 or yourname@abdm"
                  value={abdmInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAbdmInput(v.includes("@") ? v : formatAbhaNumber(v));
                  }}
                  autoCapitalize="none"
                  style={{ width: "100%", padding: "12px 14px", fontSize: "1rem", borderRadius: "10px", border: "1.5px solid #b7d6ca" }}
                />
                <small style={{ display: "block", marginTop: 6, color: "#627872", fontSize: "0.8rem" }}>
                  An OTP will be sent to the mobile number registered with your ABHA ID.
                </small>
              </div>

              {error && <div className="system-banner error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

              <div className="reference-actions stacked-mobile mobile-action-dock">
                <button
                  type="submit"
                  className="primary reference-primary"
                  disabled={busy || !abdmInput.trim()}
                >
                  {busy ? "Sending ABDM OTP..." : "Get OTP via ABDM →"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  {t("continueWithoutAbha") || "Continue without ABHA"}
                </button>
              </div>
            </form>
          )}

          {abdmStep === "otp" && (
            <form onSubmit={handleVerifyAbdmOtp}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <p style={{ margin: "0 0 4px", color: "#113d35", fontWeight: 600 }}>Enter 6-digit ABDM OTP</p>
                <small style={{ color: "#557069" }}>
                  Sent to registered mobile {maskedMobile ? `(${maskedMobile})` : ""}
                </small>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  style={{
                    width: "100%",
                    maxWidth: 220,
                    margin: "0 auto",
                    display: "block",
                    padding: "12px",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    textAlign: "center",
                    letterSpacing: "0.25em",
                    borderRadius: "10px",
                    border: "2px solid #08785d",
                    background: "#f7fcf9",
                  }}
                  autoFocus
                />
              </div>

              {devOtp && (
                <div
                  style={{
                    background: "#fdf8ea",
                    border: "1px solid #fae19c",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "0.82rem",
                    color: "#775404",
                    marginBottom: 14,
                    textAlign: "center",
                  }}
                >
                  💡 Demo ABDM OTP: <strong>{devOtp}</strong> (or <strong>123456</strong>)
                </div>
              )}

              {error && <div className="system-banner error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

              <div className="reference-actions stacked-mobile mobile-action-dock">
                <button
                  type="submit"
                  className="primary reference-primary"
                  disabled={busy || otpCode.trim().length !== 6}
                >
                  {busy ? "Verifying..." : "Verify & Link ABHA →"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setAbdmStep("input");
                    setOtpCode("");
                    setError("");
                  }}
                >
                  ← Back to ABHA Input
                </button>
              </div>
            </form>
          )}

          {abdmStep === "verified" && verifiedProfile && (
            <div className="verified-abdm-card" style={{ background: "#f0faf6", border: "1.5px solid #a4dbc7", borderRadius: 14, padding: "18px", margin: "14px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ background: "#08785d", color: "white", padding: "4px 10px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 700 }}>
                  ✓ ABHA Verified
                </span>
                <span style={{ fontSize: "0.75rem", color: "#4f6e65" }}>ABDM Milestone 1 Compliant</span>
              </div>
              <h3 style={{ margin: "0 0 6px", color: "#0f3e34", fontSize: "1.15rem" }}>
                {verifiedProfile.name}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.85rem", color: "#36574f" }}>
                <div>
                  <strong>ABHA Address:</strong><br />
                  {verifiedProfile.abhaAddressMasked || "Linked"}
                </div>
                <div>
                  <strong>ABHA Number:</strong><br />
                  {verifiedProfile.abhaLast4 ? `**-****-****-${verifiedProfile.abhaLast4}` : "Verified"}
                </div>
              </div>

              <div className="reference-actions stacked-mobile mobile-action-dock" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="primary reference-primary"
                  disabled={busy}
                  onClick={() => void handleProceedVerified()}
                >
                  {busy ? "Saving..." : "Continue with Verified ABHA →"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="form-grid reference-form">
            <div className="field">
              <label htmlFor="abha-number">{t("abhaNumberLabel")}</label>
              <input
                id="abha-number"
                inputMode="numeric"
                maxLength={17}
                placeholder={t("abhaNumberPlaceholder")}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="abha-address">{t("abhaAddressLabel")}</label>
              <input
                id="abha-address"
                autoCapitalize="none"
                placeholder={t("abhaAddressPlaceholder")}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="system-banner error" role="alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}

          <div className="reference-actions stacked-mobile mobile-action-dock">
            <button
              className="primary reference-primary"
              disabled={busy}
              onClick={() => void submit(false)}
            >
              {busy ? t("processing") : `${t("continueWithAbha") || "Continue with ABHA"} →`}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              {t("continueWithoutAbha") || "Continue without ABHA"}
            </button>
          </div>
        </div>
      )}

      <div className="privacy-inline" style={{ marginTop: 18 }}>
        🔒 {t("abhaOfflineNote") || "Full ABHA values are never cached in the offline recovery draft."}
      </div>
    </section>
  );
}
