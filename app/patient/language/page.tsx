"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { PatientLanguage } from "@/lib/patient-flow";

const languageOptions: Array<{ code: PatientLanguage; native: string; hint: string }> = [
  { code: "en", native: "English", hint: "Continue in English" },
  { code: "hi", native: "हिंदी", hint: "हिंदी में जारी रखें" },
  { code: "bn", native: "বাংলা", hint: "বাংলায় চালিয়ে যান" },
  { code: "te", native: "తెలుగు", hint: "తెలుగులో కొనసాగించండి" },
  { code: "ta", native: "தமிழ்", hint: "தமிழில் தொடரவும்" },
  { code: "mr", native: "मराठी", hint: "मराठीत सुरू ठेवा" },
];

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
        {languageOptions.map((option) => (
          <button key={option.code} type="button" className={`language-option ${workflow.language === option.code ? "language-option--selected" : ""}`} onClick={() => chooseLanguage(option.code)}>
            <span className="language-option__native">{option.native}</span>
            <span className="language-option__hint">{option.hint}</span>
            {workflow.language === option.code && <span className="language-option__check" aria-label={t("languageSaved")}>✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
