"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";

export default function PatientStartPage() {
  const router = useRouter();
  const { t } = usePatientWorkflow();

  return (
    <section className="flow-screen start-screen" aria-labelledby="start-title">
      <div className="success-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">{t("startStep")}</p>
      <h1 id="start-title">{t("startTitle")}</h1>
      <p className="lead-copy">{t("startDescription")}</p>
      <p className="supporting-note">{t("startNote")}</p>
      <button type="button" className="primary-button" onClick={() => router.push("/patient/complaint")}>
        {t("complaintNext")} <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
