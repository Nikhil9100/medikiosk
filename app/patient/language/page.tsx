"use client";

import { useRouter } from "next/navigation";
import { languageNames } from "@/lib/i18n";
import type { PatientLanguage } from "@/lib/patient-flow";
import { usePatient } from "../PatientShell";

export default function LanguagePage() {
  const router = useRouter();
  const { workflow, setLanguage, sync, t } = usePatient();

  async function next() {
    if (await sync({ language: workflow.language, workflowStep: "consent" })) {
      router.push("/patient/consent");
    }
  }

  return (
    <section className="flow-card reference-card">
      <div className="reference-icon-badge" aria-hidden="true">
        ◎
      </div>
      <p className="eyebrow">1 · {t("stepLanguage")}</p>
      <h1>{t("languageTitle")}</h1>
      <p className="lead">{t("languageSubtitle")}</p>

      <div className="language-reference-list">
        {Object.entries(languageNames).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className="language-reference-option"
            aria-pressed={workflow.language === key}
            onClick={() => setLanguage(key as PatientLanguage)}
          >
            <span className="language-reference-radio">
              {workflow.language === key ? "●" : "○"}
            </span>
            <span>
              <strong>{label}</strong>
              <small>{key.toUpperCase()}</small>
            </span>
            <span>›</span>
          </button>
        ))}
      </div>

      <div className="reference-actions">
        <button
          type="button"
          className="primary reference-primary"
          onClick={() => void next()}
        >
          {t("continue")} →
        </button>
      </div>
    </section>
  );
}
