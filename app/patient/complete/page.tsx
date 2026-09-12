"use client";

import { usePatient } from "../PatientShell";

export default function Complete() {
  const { workflow, reset, t } = usePatient();

  return (
    <section className="flow-card reference-card complete-reference-card">
      <div className="completion-mark" aria-hidden="true">
        ✓
      </div>
      <p className="eyebrow">{t("completeEyebrow")}</p>
      <h1>{t("completeHeading") || "Consultation Submitted Successfully!"}</h1>
      <p className="lead">{t("completeLead")}</p>

      {workflow.caseId && (
        <div className="case-reference-card">
          <span>{t("caseIdLabel")}</span>
          <strong>{workflow.caseId}</strong>
          <small>{t("caseIdHelp")}</small>
        </div>
      )}

      <div className="next-steps-card">
        <h2>{t("whatNextTitle") || "What happens next?"}</h2>
        <div>
          <b>1</b>
          <span>{t("whatNextStep1")}</span>
        </div>
        <div>
          <b>2</b>
          <span>{t("whatNextStep2")}</span>
        </div>
        <div>
          <b>3</b>
          <span>{t("whatNextStep3")}</span>
        </div>
      </div>

      <div className="reference-actions stacked-mobile">
        <button
          type="button"
          className="primary reference-primary"
          onClick={() => void reset()}
        >
          {t("startNewConsultation") || "Start New Consultation"}
        </button>
      </div>
    </section>
  );
}
