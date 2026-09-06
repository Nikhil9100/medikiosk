"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { PatientLanguage } from "@/lib/patient-flow";

export default function PatientLanguagePage() {
  const router = useRouter();
  const { workflow, setLanguage, t } = usePatientWorkflow();

  function chooseLanguage(language: PatientLanguage) {
    setLanguage(language);
    router.push("/patient/consent");
  }

  return (
    <section className="flow-screen" aria-labelledby="language-title">
      <p className="eyebrow">{t("languageStep")}</p>
      <h1 id="language-title">{t("chooseLanguage")}</h1>
      <p className="lead-copy language-subtitle">{t("chooseLanguageHindi")}</p>
      <div className="language-options" role="group" aria-label={t("chooseLanguage")}>
        <button type="button" className={`language-option ${workflow.language === "en" ? "language-option--selected" : ""}`} onClick={() => chooseLanguage("en")}>
          <span className="language-option__native">English</span>
          <span className="language-option__hint">Continue in English</span>
          {workflow.language === "en" && <span className="language-option__check" aria-label={t("languageSaved")}>✓</span>}
        </button>
        <button type="button" className={`language-option ${workflow.language === "hi" ? "language-option--selected" : ""}`} onClick={() => chooseLanguage("hi")}>
          <span className="language-option__native">हिंदी</span>
          <span className="language-option__hint">हिंदी में जारी रखें</span>
          {workflow.language === "hi" && <span className="language-option__check" aria-label={t("languageSaved")}>✓</span>}
        </button>
      </div>
    </section>
  );
}
