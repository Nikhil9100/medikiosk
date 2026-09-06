"use client";

import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "./PatientShell";

export default function PatientWelcomePage() {
  const router = useRouter();
  const { t, openHelp } = usePatientWorkflow();

  return (
    <section className="welcome-screen" aria-labelledby="welcome-title">
      <div className="welcome-screen__eyebrow" aria-hidden="true">●</div>
      <p className="eyebrow">{t("serviceName")}</p>
      <h1 id="welcome-title">{t("welcomeTitle")}</h1>
      <p className="lead-copy">{t("welcomeDescription")}</p>
      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={() => router.push("/patient/language")}>
          {t("start")} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="text-button" onClick={openHelp}>
          {t("needHelp")}
        </button>
      </div>
    </section>
  );
}
