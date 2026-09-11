"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { PatientLanguage } from "@/lib/patient-flow";

const languageOptions: Array<{ code: PatientLanguage; nameKey: "languageEnglish" | "languageHindi" | "languageBengali" | "languageTelugu" | "languageTamil" | "languageMarathi"; hintKey: "englishHint" | "hindiHint" | "bengaliHint" | "teluguHint" | "tamilHint" | "marathiHint" }> = [
  { code: "en", nameKey: "languageEnglish", hintKey: "englishHint" },
  { code: "hi", nameKey: "languageHindi", hintKey: "hindiHint" },
  { code: "bn", nameKey: "languageBengali", hintKey: "bengaliHint" },
  { code: "te", nameKey: "languageTelugu", hintKey: "teluguHint" },
  { code: "ta", nameKey: "languageTamil", hintKey: "tamilHint" },
  { code: "mr", nameKey: "languageMarathi", hintKey: "marathiHint" },
];

export default function PatientLanguagePage() {
  const router = useRouter();
  const { workflow, setLanguage, syncSession, t } = usePatientWorkflow();

  function chooseLanguage(language: PatientLanguage) {
    setLanguage(language);
    void syncSession({ language });
    router.push("/patient/consent");
  }

  return (
    <section className="flow-screen" aria-labelledby="language-title">
      <p className="eyebrow">{t("languageStep")}</p>
      <h1 id="language-title">{t("chooseLanguage")}</h1>
      <p className="lead-copy language-subtitle">{t("chooseLanguageSecondary")}</p>
      <div className="language-options" role="group" aria-label={t("chooseLanguage")}>
        {languageOptions.map((option) => (
          <button key={option.code} type="button" className={`language-option ${workflow.language === option.code ? "language-option--selected" : ""}`} onClick={() => chooseLanguage(option.code)}>
            <span className="language-option__native">{t(option.nameKey)}</span>
            <span className="language-option__hint">{t(option.hintKey)}</span>
            {workflow.language === option.code && <span className="language-option__check" aria-label={t("languageSaved")}>✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
