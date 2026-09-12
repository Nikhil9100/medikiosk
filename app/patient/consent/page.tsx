"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePatient } from "../PatientShell";

export default function Consent() {
  const router = useRouter();
  const { sync, setWorkflow, t } = usePatient();
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);

  async function accept() {
    if (busy) return;
    setBusy(true);
    const ok = await sync({ consentStatus: "ACCEPTED", workflowStep: "identity" });
    if (ok) {
      setWorkflow((w) => ({ ...w, consentStatus: "ACCEPTED", currentStep: "identity" }));
      router.push("/patient/identity");
      return;
    }
    setBusy(false);
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    await sync({ consentStatus: "DECLINED", workflowStep: "consent" });
    setDeclined(true);
    setBusy(false);
  }

  return (
    <section className="flow-card reference-card consent-reference-card">
      <div className="centered-reference-heading">
        <div className="reference-icon-badge shield" aria-hidden="true">
          ⌾
        </div>
        <p className="eyebrow">{t("consentEyebrow")}</p>
        <h1>{t("consentHeading") || "Your Information Stays Private"}</h1>
        <p className="lead">{t("consentLead")}</p>
      </div>

      <div className="privacy-points">
        <div>
          <span>🛡</span>
          <p>
            <b>{t("consentPoint1Title")}</b>
            <small>{t("consentPoint1Desc")}</small>
          </p>
        </div>
        <div>
          <span>🔒</span>
          <p>
            <b>{t("consentPoint2Title")}</b>
            <small>{t("consentPoint2Desc")}</small>
          </p>
        </div>
        <div>
          <span>🩺</span>
          <p>
            <b>{t("consentPoint3Title")}</b>
            <small>{t("consentPoint3Desc")}</small>
          </p>
        </div>
        <div>
          <span>↺</span>
          <p>
            <b>{t("consentPoint4Title")}</b>
            <small>{t("consentPoint4Desc")}</small>
          </p>
        </div>
      </div>

      <div className="consent-note">{t("consentNote")}</div>

      {declined && (
        <div className="system-banner warning" role="status">
          {t("consentDeclinedNotice")}
        </div>
      )}

      <div className="reference-actions stacked-mobile">
        <button
          className="primary reference-primary"
          disabled={busy}
          onClick={() => void accept()}
        >
          {busy ? t("processing") : `${t("agreeContinue") || "I Agree and Continue"} →`}
        </button>
        <button className="secondary" disabled={busy} onClick={() => void decline()}>
          {t("declineBtn") || "Decline"}
        </button>
      </div>
    </section>
  );
}
