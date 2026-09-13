"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { languageNames } from "@/lib/i18n";
import type { PatientLanguage } from "@/lib/patient-flow";
import { usePatient } from "./PatientShell";

const languageMeta: Record<PatientLanguage, { native: string; secondary: string; script: string }> = {
  en: { native: "English", secondary: "English", script: "Latin" },
  hi: { native: "हिन्दी", secondary: "Hindi", script: "Devanagari" },
  bn: { native: "বাংলা", secondary: "Bengali", script: "Bengali" },
  te: { native: "తెలుగు", secondary: "Telugu", script: "Telugu" },
  ta: { native: "தமிழ்", secondary: "Tamil", script: "Tamil" },
  mr: { native: "मराठी", secondary: "Marathi", script: "Devanagari" },
};

export default function PatientWelcome() {
  const router = useRouter();
  const { workflow, t, beginSession, sync, setLanguage } = usePatient();
  const [selected, setSelected] = useState<PatientLanguage>(workflow.language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin() {
    if (busy) return;
    setBusy(true);
    setError("");
    const ok = await beginSession();
    if (!ok) {
      setError(
        t("networkError") ||
          "A secure patient session could not be started. Reconnect and retry; no duplicate case will be created."
      );
      setBusy(false);
      return;
    }
    setLanguage(selected);
    if (await sync({ language: selected, workflowStep: "consent" })) {
      router.push("/patient/consent");
      return;
    }
    setError(
      t("saveFailedRetry") ||
        "Your secure visit started, but the language choice could not be saved yet. Please retry."
    );
    setBusy(false);
  }

  function handleLanguageSelect(key: PatientLanguage) {
    setSelected(key);
    setLanguage(key);
  }

  return (
    <section className="flow-card reference-card welcome-reference-card">
      <div className="welcome-reference-grid">
        <div className="welcome-intro-col">
          <div className="welcome-brand-header">
            <div className="reference-icon-badge" aria-hidden="true">
              ✚
            </div>
            <p className="eyebrow">{t("welcomeEyebrow") || "Welcome to MediKiosk"}</p>
          </div>

          <div className="welcome-text-group">
            <h1>Welcome to MediKiosk</h1>
            <p className="welcome-subhead">
              Let&apos;s prepare your information for the healthcare team.
            </p>
            <p className="lead">
              Take 3–4 minutes to tell us what is bothering you. You can tap the screen or speak naturally with the microphone.
            </p>
          </div>

          <div className="reference-trust-list" aria-label="MediKiosk benefits">
            <span>✓ {t("welcomeBenefit1") || "Private & secure"}</span>
            <span>✓ {t("welcomeBenefit2") || "Voice or touch"}</span>
            <span>✓ {t("welcomeBenefit3") || "Saves progress safely"}</span>
            <span>✓ {t("welcomeBenefit4") || "Doctor remains in control"}</span>
          </div>

          <div className="welcome-time-badge">
            ⏱️ <span>Takes about 3–4 minutes · No medical knowledge required</span>
          </div>
        </div>

        <div className="language-reference-panel">
          <div className="section-kicker">
            {t("chooseLanguage") || "Which language would you like to use?"}
          </div>

          <div className="language-reference-list" role="radiogroup" aria-label="Choose your preferred language">
            {(Object.keys(languageNames) as PatientLanguage[]).map((key) => {
              const meta = languageMeta[key];
              const isSelected = selected === key;
              return (
                <button
                  type="button"
                  key={key}
                  role="radio"
                  aria-checked={isSelected}
                  className="language-reference-option"
                  onClick={() => handleLanguageSelect(key)}
                >

                  <span className="language-reference-radio" aria-hidden="true">
                    {isSelected ? "●" : "○"}
                  </span>
                  <span className="language-reference-label">
                    <strong className="language-native-name">{meta.native}</strong>
                    <small className="language-secondary-name">{meta.secondary}</small>
                  </span>
                  <span className="language-reference-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="system-banner error" role="alert" style={{ marginTop: "12px" }}>
              {error}
            </div>
          )}

          <div className="reference-actions" style={{ marginTop: "20px" }}>
            <button
              className="primary reference-primary welcome-continue-btn"
              disabled={busy}
              onClick={() => void begin()}
              aria-label="Start preparing your visit information"
            >
              {busy ? t("startingSecurely") : "START →"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
