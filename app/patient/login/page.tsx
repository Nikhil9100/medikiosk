"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isValidIndianMobile, maskPhoneNumber, normalizePhoneNumber } from "@/lib/phone-utils";
import { usePatient } from "../PatientShell";

export default function PatientLogin() {
  const router = useRouter();
  const { workflow, sync, setLanguage, t } = usePatient();

  const [phone, setPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);

  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");
    setInfo("");

    const norm = normalizePhoneNumber(phone);
    if (!isValidIndianMobile(norm)) {
      setError("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/patient/auth/phone/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: norm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send OTP. Please retry.");
        setBusy(false);
        return;
      }

      setStep("otp");
      setTimer(30);
      setDevOtp(data.devOtp || "123456");
      setInfo(`6-digit OTP sent to ${data.maskedPhone || maskPhoneNumber(norm)}.`);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpInputsRef.current[0]?.focus(), 100);
    } catch {
      setError("Network error sending OTP. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function handleDigitChange(index: number, val: string) {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const copy = [...otpDigits];
      copy[index] = "";
      setOtpDigits(copy);
      return;
    }

    // If pasted full OTP (e.g. 6 digits)
    if (clean.length >= 6) {
      const pasted = clean.slice(0, 6).split("");
      setOtpDigits(pasted);
      otpInputsRef.current[5]?.focus();
      return;
    }

    const copy = [...otpDigits];
    copy[index] = clean.slice(-1);
    setOtpDigits(copy);

    if (index < 5 && clean) {
      otpInputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  }

  async function handleVerifyOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");
    const enteredOtp = otpDigits.join("");
    if (enteredOtp.length !== 6) {
      setError("Please enter all 6 digits of the OTP.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/patient/auth/phone/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: normalizePhoneNumber(phone),
          otp: enteredOtp,
          language: workflow.language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid OTP code. Please retry.");
        setBusy(false);
        return;
      }

      // Sync and proceed to consent or active step
      await sync({ workflowStep: "consent" });
      router.push("/patient/consent");
    } catch {
      setError("Failed to verify OTP. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="flow-card reference-card login-reference-card" style={{ maxWidth: 540, margin: "0 auto" }}>
      <div className="centered-reference-heading">
        <div className="reference-icon-badge phone-badge" aria-hidden="true">
          📱
        </div>
        <p className="eyebrow">OPD Quick Check-in</p>
        <h1>Patient Login & Registration</h1>
        <p className="lead">Verify your mobile number to start a new OPD visit or resume your saved consultation safely.</p>
      </div>

      <div className="auth-card-tabs" style={{ display: "flex", gap: 10, margin: "18px 0 22px" }}>
        <button
          type="button"
          className="auth-tab-btn active"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1.5px solid #08785d",
            background: "#e9f7f1",
            color: "#075a48",
            fontWeight: 700,
            fontSize: "0.88rem",
          }}
        >
          📱 Mobile Number
        </button>
        <Link
          href="/patient/identity"
          className="auth-tab-btn"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1.5px solid #d9e6e2",
            background: "#ffffff",
            color: "#475953",
            fontWeight: 600,
            fontSize: "0.88rem",
            textAlign: "center",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ▣ ABHA ID
        </Link>
      </div>

      {step === "phone" ? (
        <form onSubmit={handleSendOtp} className="phone-auth-form">
          <div className="field" style={{ marginBottom: 18 }}>
            <label htmlFor="patient-phone" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
              Indian Mobile Number
            </label>
            <div
              className="phone-input-group"
              style={{
                display: "flex",
                alignItems: "center",
                border: "1.5px solid #b7d6ca",
                borderRadius: "12px",
                background: "#ffffff",
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
              }}
            >
              <span
                style={{
                  padding: "12px 14px",
                  background: "#f3f8f6",
                  borderRight: "1px solid #d5e5df",
                  fontWeight: 700,
                  color: "#113d35",
                  fontSize: "0.95rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                🇮🇳 +91
              </span>
              <input
                id="patient-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  padding: "12px 14px",
                  fontSize: "1.05rem",
                  letterSpacing: "0.04em",
                }}
                autoFocus
              />
            </div>
            <small style={{ display: "block", marginTop: 6, color: "#627872", fontSize: "0.8rem" }}>
              We will send a 6-digit one-time password (OTP) via SMS to verify your identity.
            </small>
          </div>

          {error && <div className="system-banner error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="reference-actions stacked-mobile">
            <button
              type="submit"
              className="primary reference-primary"
              disabled={busy || normalizePhoneNumber(phone).length !== 10}
              style={{ width: "100%", padding: "14px 20px", fontSize: "1rem", fontWeight: 700 }}
            >
              {busy ? "Sending OTP..." : "Get OTP via SMS →"}
            </button>
            <Link
              href="/patient"
              className="secondary"
              style={{
                width: "100%",
                padding: "12px 20px",
                textAlign: "center",
                textDecoration: "none",
                borderRadius: "12px",
                fontWeight: 600,
              }}
            >
              Cancel · Back to Welcome
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="otp-auth-form">
          <div style={{ marginBottom: 20, textAlign: "center" }}>
            <p style={{ margin: "0 0 6px", color: "#113d35", fontWeight: 600, fontSize: "0.95rem" }}>
              Enter 6-digit OTP sent to
            </p>
            <strong style={{ fontSize: "1.1rem", color: "#08785d", letterSpacing: "0.02em" }}>
              {maskPhoneNumber(phone)}
            </strong>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError("");
                setInfo("");
              }}
              style={{
                display: "inline-block",
                marginLeft: 10,
                background: "none",
                border: "none",
                color: "#0d6efd",
                fontSize: "0.82rem",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Change
            </button>
          </div>

          <div
            className="otp-digit-boxes"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "8px",
              marginBottom: "18px",
            }}
          >
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpInputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                style={{
                  width: "46px",
                  height: "54px",
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  textAlign: "center",
                  border: "2px solid #b7d6ca",
                  borderRadius: "10px",
                  background: digit ? "#f3fbf8" : "#ffffff",
                  outline: "none",
                  transition: "border-color 0.15s ease",
                }}
              />
            ))}
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
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              💡 Demo Mode OTP: <strong style={{ letterSpacing: 2 }}>{devOtp}</strong> (or <strong>123456</strong>)
            </div>
          )}

          {info && !error && (
            <div className="system-banner success" style={{ marginBottom: 16, textAlign: "center" }}>
              {info}
            </div>
          )}
          {error && <div className="system-banner error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

          <div style={{ textAlign: "center", marginBottom: 20 }}>
            {timer > 0 ? (
              <span style={{ color: "#627872", fontSize: "0.85rem" }}>
                Resend OTP in <strong>0:{timer < 10 ? `0${timer}` : timer}</strong>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendOtp()}
                disabled={busy}
                style={{
                  background: "none",
                  border: "none",
                  color: "#08785d",
                  fontWeight: 700,
                  fontSize: "0.86rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Resend OTP
              </button>
            )}
          </div>

          <div className="reference-actions stacked-mobile">
            <button
              type="submit"
              className="primary reference-primary"
              disabled={busy || otpDigits.join("").length !== 6}
              style={{ width: "100%", padding: "14px 20px", fontSize: "1rem", fontWeight: 700 }}
            >
              {busy ? "Verifying..." : "Verify OTP & Continue →"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setStep("phone");
                setError("");
              }}
              style={{ width: "100%", padding: "12px 20px", borderRadius: "12px", fontWeight: 600 }}
            >
              ← Back to Phone Number
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
