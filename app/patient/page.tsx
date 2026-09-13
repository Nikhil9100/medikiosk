"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { languageNames } from "@/lib/i18n";
import type { PatientLanguage } from "@/lib/patient-flow";
import { usePatient } from "./PatientShell";

const languageMeta: Record<PatientLanguage, { native: string; secondary: string }> = {
  en: { native: "English", secondary: "English" },
  hi: { native: "हिंदी", secondary: "Hindi" },
  bn: { native: "বাংলা", secondary: "Bengali" },
  te: { native: "తెలుగు", secondary: "Telugu" },
  ta: { native: "தமிழ்", secondary: "Tamil" },
  mr: { native: "मराठी", secondary: "Marathi" },
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
            <h1>{t("welcomeTitle")}</h1>
            <p className="lead">{t("welcomeLead")}</p>
          </div>
          <div className="reference-trust-list" aria-label="MediKiosk benefits">
            <span>✓ {t("welcomeBenefit1") || "Private & secure"}</span>
            <span>✓ {t("welcomeBenefit2") || "Voice or touch"}</span>
            <span>✓ {t("welcomeBenefit3") || "Saves progress safely"}</span>
            <span>✓ {t("welcomeBenefit4") || "Doctor remains in control"}</span>
          </div>
        </div>
        <div className="language-reference-panel">
          <div className="section-kicker">{t("chooseLanguage")}</div>
          <div className="language-reference-list">
            {(Object.keys(languageNames) as PatientLanguage[]).map((key) => {
              const meta = languageMeta[key];
              const isSelected = selected === key;
              return (
                <button
                  type="button"
                  key={key}
                  className="language-reference-option"
                  aria-pressed={isSelected}
                  onClick={() => handleLanguageSelect(key)}
                >
                  <span className="language-reference-radio" aria-hidden="true">
                    {isSelected ? "●" : "○"}
                  </span>
                  <span className="language-reference-label">
                    <strong>{meta.native}</strong>
                    <small>{meta.secondary}</small>
                  </span>
                  <span className="language-reference-chevron" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="system-banner error" role="alert" style={{ marginTop: "12px" }}>
              {error}
            </div>
          )}

          <div className="reference-actions mobile-action-dock" style={{ marginTop: "16px" }}>
            <button
              className="primary reference-primary welcome-continue-btn"
              disabled={busy}
              onClick={() => void begin()}
            >
              {busy ? t("startingSecurely") : `${t("continue")} →`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
