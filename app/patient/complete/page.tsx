"use client";

import { usePatient } from "../PatientShell";

export default function Complete() {
  const { workflow, reset, t } = usePatient();
  const tokenNumber = workflow.caseId || "A-104";

  return (
    <section className="flow-card reference-card complete-reference-card complete-modern-card" aria-labelledby="complete-heading">
      <div className="completion-hero">
        <div className="completion-mark" aria-hidden="true">
          ✓
        </div>
        <p className="eyebrow completion-eyebrow">
          {t("completeEyebrow") || "Intake Complete"}
        </p>
        <h1 id="complete-heading" className="completion-title">
          {t("completeHeading") || "Consultation Submitted Successfully!"}
        </h1>
        <p className="lead completion-lead">
          {t("completeLead") || "You're all set. Your symptoms and medical reports have been safely sent to the healthcare team."}
        </p>
      </div>

      <div className="case-reference-card token-highlight-card">
        <div className="token-meta">
          <span className="token-label">{t("caseIdLabel") || "Your Visit Token Number"}</span>
          <span className="token-badge">Active Queue</span>
        </div>
        <strong className="token-value" aria-label={`Token number ${tokenNumber}`}>
          {tokenNumber}
        </strong>
        <p className="token-help">
          {t("caseIdHelp") || "This number will be called when it is your turn to see the doctor."}
        </p>
      </div>

      <div className="next-steps-card plain-next-steps">
        <h2 className="next-steps-heading">
          {t("whatNextTitle") || "What happens next?"}
        </h2>
        
        <div className="next-step-row">
          <span className="step-badge" aria-hidden="true">1</span>
          <div className="step-content">
            <strong>Take a seat in the waiting area</strong>
            <p>{t("whatNextStep1") || "You can rest comfortably while the clinical team reviews your file."}</p>
          </div>
        </div>

        <div className="next-step-row">
          <span className="step-badge" aria-hidden="true">2</span>
          <div className="step-content">
            <strong>Watch the screen or listen for your token</strong>
            <p>{t("whatNextStep2") || `Keep an eye on the waiting room displays for token ${tokenNumber}.`}</p>
          </div>
        </div>

        <div className="next-step-row">
          <span className="step-badge" aria-hidden="true">3</span>
          <div className="step-content">
            <strong>Have your original cards or reports ready</strong>
            <p>{t("whatNextStep3") || "Keep any physical doctor prescriptions, lab sheets, or ID cards in hand for the consultation."}</p>
          </div>
        </div>
      </div>

      <div className="complete-reassurance-note">
        <span className="note-icon" aria-hidden="true">🛡️</span>
        <p>
          <strong>Your information is private and secure.</strong>
          <span> All answers and documents have been encrypted and sent directly to the physician console. Medi has logged out of this session.</span>
        </p>
      </div>

      <div className="reference-actions stacked-mobile complete-actions">
        <button
          type="button"
          className="primary reference-primary complete-reset-btn"
          onClick={() => void reset()}
        >
          {t("startNewConsultation") || "Start New Consultation"}
        </button>
      </div>
    </section>
  );
}

