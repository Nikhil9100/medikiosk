"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { Severity } from "@/lib/case-status";

const SEVERITY_ORDER: Severity[] = ["MILD", "MODERATE", "SEVERE", "VERY_SEVERE"];

export default function PatientComplaintPage() {
  const router = useRouter();
  const { workflow, setComplaint, syncSession, t } = usePatientWorkflow();
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function updateComplaint(nextValue: string) {
    setComplaint(nextValue);
    void syncSession({ complaintText: nextValue, workflowStep: "complaint" });
  }

  async function submitComplaint() {
    const text = workflow.complaint.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/patient/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintText: text, severity: severity ?? undefined }),
      });
      if (!response.ok) throw new Error(`complaint ${response.status}`);
      router.push("/patient/anatomy");
    } catch {
      setSubmitError(t("complaintSubmitError"));
      setSubmitting(false);
    }
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

      <div className="severity-picker" role="group" aria-label={t("severityLabel")}>
        <span className="severity-picker__label">{t("severityLabel")}</span>
        <div className="severity-picker__options">
          {SEVERITY_ORDER.map((level) => {
            const labelKey =
              level === "MILD"
                ? "severityMild"
                : level === "MODERATE"
                  ? "severityModerate"
                  : level === "SEVERE"
                    ? "severitySevere"
                    : "severityVerySevere";
            return (
              <button
                key={level}
                type="button"
                className={`severity-option severity-option--${level.toLowerCase()} ${severity === level ? "severity-option--selected" : ""}`}
                aria-pressed={severity === level}
                onClick={() => setSeverity(severity === level ? null : level)}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="complaint-helper">{t("complaintHelper")}</p>

      <div className="primary-action-stack">
        <button
          type="button"
          className="primary-button"
          disabled={submitting || workflow.complaint.trim().length === 0}
          aria-busy={submitting}
          onClick={() => void submitComplaint()}
        >
          {t("complaintNext")} <span aria-hidden="true">→</span>
        </button>
        {submitError && (
          <p className="complaint-helper" role="alert">
            {submitError}
          </p>
        )}
      </div>
    </section>
  );
}
