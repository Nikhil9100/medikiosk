"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";

export default function PatientConsentPage() {
  const router = useRouter();
  const { workflow, setConsentStatus, t } = usePatientWorkflow();

  function acceptConsent() {
    setConsentStatus("ACCEPTED");
    router.push("/patient/start");
  }

  function declineConsent() {
    setConsentStatus("DECLINED");
    router.push("/patient/language");
  }

  return (
    <section className="flow-screen flow-screen--consent" aria-labelledby="consent-title">
      <p className="eyebrow">{t("consentStep")}</p>
      <h1 id="consent-title">{t("consentTitle")}</h1>
      <div className="consent-panel">
        <p className="consent-panel__intro">{t("consentIntro")}</p>
        <ul>
          <li>{t("consentPointOne")}</li>
          <li>{t("consentPointTwo")}</li>
          <li>{t("consentPointThree")}</li>
        </ul>
        <details>
          <summary>{t("consentReadMore")}</summary>
          <p>{t("consentDetails")}</p>
        </details>
      </div>
      {workflow.consentStatus === "DECLINED" && (
        <p className="inline-status inline-status--warning" role="status">Please choose “{t("consentAgree")}” to continue.</p>
      )}
      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={acceptConsent}>
          {t("consentAgree")} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="text-button" onClick={declineConsent}>{t("consentBack")}</button>
      </div>
    </section>
  );
}
