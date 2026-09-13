"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePatient } from "../PatientShell";

export default function Consent() {
  const router = useRouter();
  const { sync, setWorkflow, t } = usePatient();
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
          🛡️
        </div>
        <p className="eyebrow">{t("consentEyebrow") || "Before We Begin"}</p>
        <h1>Your Information Stays Private</h1>
        <p className="lead">
          We&apos;ll ask about your health so the healthcare team can better understand your visit.
        </p>

      </div>

      <div className="privacy-points" role="list" aria-label="Privacy commitments">
        <div role="listitem">
          <span aria-hidden="true">🛡</span>
          <p>
            <b>{t("consentPoint1Title") || "Only for your medical care"}</b>
            <small>{t("consentPoint1Desc") || "Your answers go directly to the attending clinical team for this visit."}</small>
          </p>
        </div>
        <div role="listitem">
          <span aria-hidden="true">🔒</span>
          <p>
            <b>{t("consentPoint2Title") || "Protected and access controlled"}</b>
            <small>{t("consentPoint2Desc") || "Only authorized hospital staff can review your case."}</small>
          </p>
        </div>
        <div role="listitem">
          <span aria-hidden="true">🩺</span>
          <p>
            <b>{t("consentPoint3Title") || "Your doctor remains in control"}</b>
            <small>{t("consentPoint3Desc") || "MediKiosk does not make medical diagnoses. Your doctor reviews everything."}</small>
          </p>
        </div>
        <div role="listitem">
          <span aria-hidden="true">↺</span>
          <p>
            <b>{t("consentPoint4Title") || "Connection-safe and encrypted"}</b>
            <small>{t("consentPoint4Desc") || "Your progress is saved securely on this kiosk so nothing is lost if interrupted."}</small>
          </p>
        </div>
      </div>

      <div className="consent-expandable-section">
        <button
          type="button"
          className="consent-toggle-details"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span>Need more details on how your health data is handled?</span>
          <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="consent-note" role="region">
            {t("consentNote") ||
              "By continuing, you agree to clinical intake for this visit. Optional identity information can be skipped, and MediKiosk does not replace emergency care."}
          </div>
        )}
      </div>

      {declined && (
        <div className="system-banner warning" role="status">
          {t("consentDeclinedNotice") ||
            "Consent was declined. You can review the points above and tap “I Agree and Continue” whenever you are ready."}
        </div>
      )}

      <div className="reference-actions stacked-mobile">
        <button
          className="primary reference-primary"
          disabled={busy}
          onClick={() => void accept()}
          aria-label="I Agree and Continue with visit intake"
        >
          {busy ? t("processing") : "I Agree and Continue →"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void decline()}
          aria-label="Decline consent"
        >
          {t("declineBtn") || "Decline"}
        </button>
      </div>
    </section>
  );
}
