"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";

export default function PatientConsentPage() {
  const router = useRouter();
  const { workflow, setConsentStatus, syncSession, t } = usePatientWorkflow();

  async function acceptConsent() {
    setConsentStatus("ACCEPTED");
    // Consent is a durable record: persist it server-side before advancing.
    // On failure the session banner is shown and the patient stays on this
    // page to retry — the flow never advances on an unsaved consent.
    const saved = await syncSession({ consentStatus: "ACCEPTED" });
    if (saved) router.push("/patient/start");
  }

  function declineConsent() {
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
        <p className="inline-status inline-status--warning" role="status">{t("consentDeclined")}</p>
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
