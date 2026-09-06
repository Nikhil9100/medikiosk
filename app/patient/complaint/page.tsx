"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";

export default function PatientComplaintPage() {
  const router = useRouter();
  const { workflow, setComplaint, syncSession, t } = usePatientWorkflow();

  function updateComplaint(nextValue: string) {
    setComplaint(nextValue);
    void syncSession({ complaintText: nextValue, workflowStep: "complaint" });
  }

  return (
    <section className="flow-screen complaint-screen" aria-labelledby="complaint-title">
      <p className="eyebrow">{t("complaintStep")}</p>
      <h1 id="complaint-title">{t("complaintTitle")}</h1>
      <p className="lead-copy complaint-subtitle">{t("complaintHelper")}</p>

      <div className="complaint-card">
        <div className="complaint-card__header">
          <span className="complaint-card__voice-tag">{t("complaintVoiceReady")}</span>
        </div>
        <label htmlFor="chief-complaint" className="sr-only">
          {t("complaintPrompt")}
        </label>
        <textarea
          id="chief-complaint"
          aria-label={t("complaintPrompt")}
          value={workflow.complaint}
          onChange={(event) => updateComplaint(event.target.value)}
          placeholder={t("complaintPlaceholder")}
          rows={6}
          className="complaint-input"
        />
      </div>

      <p className="complaint-helper">{t("complaintHelper")}</p>

      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={() => router.push("/patient/anatomy")}>
          {t("complaintNext")} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
