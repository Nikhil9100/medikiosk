"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getTranslation, type TranslationKey } from "@/lib/i18n";
import {
  defaultPatientWorkflow,
  previousStep,
  type ConsentStatus,
  type PatientLanguage,
  type PatientStep,
  type PatientWorkflow,
} from "@/lib/patient-flow";
import { createClinicalFact, type ClinicalProvenance } from "@/lib/interview-engine";

const languageStorageKey = "medikiosk.patient.language";
const stepByPath: Record<string, PatientStep> = {
  "/patient": "welcome",
  "/patient/language": "language",
  "/patient/consent": "consent",
  "/patient/start": "start",
  "/patient/complaint": "complaint",
  "/patient/anatomy": "anatomy",
  "/patient/interview": "interview",
};
const stepOrder: PatientStep[] = ["language", "consent", "start", "complaint", "anatomy", "interview"];
const languageNameKeys: Record<PatientLanguage, TranslationKey> = {
  en: "languageEnglish",
  hi: "languageHindi",
  bn: "languageBengali",
  te: "languageTelugu",
  ta: "languageTamil",
  mr: "languageMarathi",
};

type PatientContextValue = {
  workflow: PatientWorkflow;
  setLanguage: (language: PatientLanguage) => void;
  setConsentStatus: (status: ConsentStatus) => void;
  setComplaint: (complaint: string) => void;
  setSelectedRegion: (region: PatientWorkflow["selectedRegion"]) => void;
  setSelectedSubregion: (subregion: PatientWorkflow["selectedSubregion"]) => void;
  setInterviewFact: (questionId: string, value: string | undefined, provenance?: ClinicalProvenance) => void;
  syncSession: (payload: Partial<Record<string, unknown>>) => Promise<void>;
  t: (key: TranslationKey) => string;
  openHelp: () => void;
};

export const PatientContext = createContext<PatientContextValue | null>(null);

function createSessionId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `session-${Date.now()}`;
}

export function PatientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [workflow, setWorkflow] = useState(defaultPatientWorkflow);
  const [isReady, setIsReady] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const currentStep = stepByPath[pathname] ?? "welcome";
  const language = workflow.language;
  const t = (key: TranslationKey) => getTranslation(language, key);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    const parsedLanguage = storedLanguage === "hi" || storedLanguage === "bn" || storedLanguage === "te" || storedLanguage === "ta" || storedLanguage === "mr"
      ? storedLanguage
      : "en";
    // Persisted browser preferences hydrate after the server-rendered shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkflow((current) => ({
      ...current,
      language: parsedLanguage,
      currentStep,
      sessionId: current.sessionId || createSessionId(),
    }));
    setIsReady(true);
  }, [currentStep]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(languageStorageKey, workflow.language);
    document.documentElement.lang = workflow.language;
  }, [isReady, workflow.language]);

  useEffect(() => {
    if (!isReady || pathname === "/patient") return;
    if ((currentStep === "start" || currentStep === "complaint" || currentStep === "anatomy" || currentStep === "interview") && workflow.consentStatus !== "ACCEPTED") {
      router.replace("/patient/consent");
    }
  }, [currentStep, isReady, pathname, router, workflow.consentStatus]);

  function setLanguage(nextLanguage: PatientLanguage) {
    setWorkflow((current) => ({ ...current, language: nextLanguage }));
  }

  function setConsentStatus(consentStatus: ConsentStatus) {
    setWorkflow((current) => ({ ...current, consentStatus }));
  }

  function setComplaint(complaint: string) {
    setWorkflow((current) => ({ ...current, complaint }));
  }

  function setSelectedRegion(region: PatientWorkflow["selectedRegion"]) {
    setWorkflow((current) => ({ ...current, selectedRegion: region }));
  }

  function setSelectedSubregion(subregion: PatientWorkflow["selectedSubregion"]) {
    setWorkflow((current) => ({ ...current, selectedSubregion: subregion }));
  }

  function setInterviewFact(questionId: string, value: string | undefined, provenance: ClinicalProvenance = "PATIENT") {
    setWorkflow((current) => ({
      ...current,
      interviewFacts: {
        ...current.interviewFacts,
        [questionId]: createClinicalFact(questionId, value, provenance),
      },
    }));
  }

  async function syncSession(payload: Partial<Record<string, unknown>>) {
    try {
      const response = await fetch("/api/patient/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
    } catch {
      // Phase 2 requires a live Supabase configuration, so the UI should remain local-safe while the project is not linked.
    }
  }

  function goBack() {
    const priorStep = previousStep(currentStep);
    router.push(priorStep === "welcome" ? "/patient" : `/patient/${priorStep}`);
  }

  const progressIndex = stepOrder.indexOf(currentStep);

  if (!isReady) {
    return <LoadingState language={workflow.language} />;
  }

  if ((currentStep === "start" || currentStep === "complaint" || currentStep === "anatomy" || currentStep === "interview") && workflow.consentStatus !== "ACCEPTED") {
    return <LoadingState language={workflow.language} />;
  }

  return (
    <PatientContext.Provider value={{ workflow, setLanguage, setConsentStatus, setComplaint, setSelectedRegion, setSelectedSubregion, setInterviewFact, syncSession, t, openHelp: () => setHelpOpen(true) }}>
      <div className="patient-app">
      <header className="patient-header">
        <div className="patient-header__inner">
          <a className="brand-lockup" href="/patient" aria-label={t("homeLabel")}>
            <span className="brand-lockup__mark" aria-hidden="true">M</span>
            <span>
              <strong>{t("brand")}</strong>
              <span>{t("serviceName")}</span>
            </span>
          </a>
          <div className="patient-header__actions">
            <button className="header-action" type="button" aria-label={t("chooseLanguage")} onClick={() => router.push("/patient/language")}>
              <span aria-hidden="true">Aa</span>
              <span>{t(languageNameKeys[language])}</span>
            </button>
            <button className="header-action" type="button" aria-label={t("needHelp")} onClick={() => setHelpOpen(true)}>
              <span aria-hidden="true">?</span>
              <span>{t("needHelp")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="patient-main">
        <div className="patient-main__inner">
          {currentStep !== "welcome" && (
            <ProgressIndicator currentStep={currentStep} progressIndex={progressIndex} t={t} />
          )}
          {children}
        </div>
      </main>

      {currentStep !== "welcome" && (
        <footer className="patient-footer">
          <button type="button" className="back-button" onClick={goBack}>
            <span aria-hidden="true">←</span> {t("consentBack")}
          </button>
        </footer>
      )}

      {helpOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="help-dialog__icon" aria-hidden="true">?</div>
            <h2 id="help-title">{t("helpTitle")}</h2>
            <p>{t("helpDescription")}</p>
            <button type="button" className="primary-button primary-button--compact" onClick={() => setHelpOpen(false)}>
              {t("close")}
            </button>
          </section>
        </div>
      )}
      </div>
    </PatientContext.Provider>
  );
}

function ProgressIndicator({ currentStep, progressIndex, t }: { currentStep: PatientStep; progressIndex: number; t: (key: TranslationKey) => string }) {
  const steps: Array<{ key: PatientStep; label: TranslationKey }> = [
    { key: "language", label: "languageStep" },
    { key: "consent", label: "consentStep" },
    { key: "start", label: "startStep" },
    { key: "complaint", label: "complaintStep" },
    { key: "anatomy", label: "anatomyStep" },
    { key: "interview", label: "interviewStep" },
  ];

  return (
    <nav className="progress" aria-label={t("progressLabel")}>
      {steps.map((step, index) => (
        <span key={step.key} className={`progress__step ${index <= progressIndex ? "progress__step--active" : ""} ${step.key === currentStep ? "progress__step--current" : ""}`}>
          <span className="progress__dot" aria-hidden="true">{index < progressIndex ? "✓" : index + 1}</span>
          <span>{t(step.label)}</span>
        </span>
      ))}
    </nav>
  );
}

function LoadingState({ language }: { language: PatientLanguage }) {
  return (
    <main className="patient-loading" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p>{getTranslation(language, "loading")}</p>
    </main>
  );
}

export function PatientErrorState({ language = "en", onRetry }: { language?: PatientLanguage; onRetry?: () => void }) {
  const t = (key: TranslationKey) => getTranslation(language, key);
  return (
    <main className="patient-loading" role="alert">
      <div className="help-dialog" style={{ textAlign: "center" }}>
        <h1>{t("errorTitle")}</h1>
        <p>{t("errorDescription")}</p>
        {onRetry && <button type="button" className="primary-button primary-button--compact" onClick={onRetry}>{t("tryAgain")}</button>}
      </div>
    </main>
  );
}

export function usePatientWorkflow() {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error("usePatientWorkflow must be used inside PatientShell");
  }
  return context;
}

export { languageStorageKey };
