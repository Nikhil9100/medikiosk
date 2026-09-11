"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { TranslationKey } from "@/lib/i18n";
import type { Severity } from "@/lib/case-status";
import type { PatientBodyRegion } from "@/lib/patient-flow";

type ComplaintRow = {
  id: string;
  position: number;
  complaintText: string;
  bodyRegion: PatientBodyRegion | null;
  severity: Severity | null;
};

const SEVERITY_ORDER: Severity[] = ["MILD", "MODERATE", "SEVERE", "VERY_SEVERE"];
const MAX_EXTRA_SYMPTOMS = 3;

const REGION_KEYS: Array<{ key: PatientBodyRegion; labelKey: TranslationKey }> = [
  { key: "head", labelKey: "head" },
  { key: "chest", labelKey: "chest" },
  { key: "abdomen", labelKey: "abdomen" },
  { key: "back", labelKey: "back" },
  { key: "arm", labelKey: "arm" },
  { key: "hand", labelKey: "hand" },
  { key: "leg", labelKey: "leg" },
  { key: "foot", labelKey: "foot" },
  { key: "skin", labelKey: "skin" },
  { key: "other", labelKey: "other" },
];

function severityLabelKey(level: Severity): TranslationKey {
  return level === "MILD"
    ? "severityMild"
    : level === "MODERATE"
      ? "severityModerate"
      : level === "SEVERE"
        ? "severitySevere"
        : "severityVerySevere";
}

/**
 * "Other symptoms" step (between anatomy and interview).
 *
 * The chief complaint is captured on the complaint step; here the patient may
 * add up to MAX_EXTRA_SYMPTOMS additional symptoms, each with its own
 * severity and (optional) body area. Each addition is persisted immediately
 * via POST /api/patient/complaints (position auto-increments server-side), so
 * a kiosk session drop never loses data. Safety-signal detection, the doctor
 * console and the queue complaint counts all consume every complaint row.
 */
export default function PatientSymptomsPage() {
  const router = useRouter();
  const { syncSession, t } = usePatientWorkflow();
  const [complaints, setComplaints] = useState<ComplaintRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftSeverity, setDraftSeverity] = useState<Severity | null>(null);
  const [draftRegion, setDraftRegion] = useState<PatientBodyRegion | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadComplaints = useCallback(async () => {
    try {
      const res = await fetch("/api/patient/complaints", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { complaints?: ComplaintRow[] };
        setComplaints(data.complaints ?? []);
      } else {
        setComplaints([]);
      }
    } catch {
      setComplaints([]);
    }
  }, []);

  useEffect(() => {
    // Mount-time fetch of the session's complaint rows (server is the source
    // of truth for what the patient has already added).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadComplaints();
  }, [loadComplaints]);

  const chief = complaints?.find((c) => c.position === 1) ?? null;
  const extras = (complaints ?? []).filter((c) => c.position > 1);
  const atLimit = extras.length >= MAX_EXTRA_SYMPTOMS;

  async function saveSymptom() {
    const text = draftText.trim();
    if (!text || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/patient/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintText: text,
          severity: draftSeverity ?? undefined,
          bodyRegion: draftRegion ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`symptom ${res.status}`);
      setDraftText("");
      setDraftSeverity(null);
      setDraftRegion(null);
      setAdding(false);
      await loadComplaints();
    } catch {
      setError(t("symptomSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function removeSymptom(id: string) {
    setError("");
    try {
      const res = await fetch("/api/patient/complaints", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error) setError(data.error);
        throw new Error(`remove ${res.status}`);
      }
      await loadComplaints();
    } catch (removeError) {
      if (!(removeError instanceof Error && removeError.message.startsWith("remove"))) {
        setError(t("symptomRemoveError"));
      }
    }
  }

  function continueToInterview() {
    void syncSession({ workflowStep: "symptoms" });
    router.push("/patient/interview");
  }

  return (
    <section className="flow-screen symptoms-screen" aria-labelledby="symptoms-title">
      <p className="eyebrow">{t("symptomsStep")}</p>
      <h1 id="symptoms-title">{t("symptomsTitle")}</h1>
      <p className="lead-copy symptoms-subtitle">{t("symptomsPrompt")}</p>

      {chief && (
        <div className="symptoms-chief">
          <span className="symptoms-chief__label">{t("symptomsChiefLabel")}</span>
          <p className="symptoms-chief__text">{chief.complaintText}</p>
        </div>
      )}

      <ul className="symptoms-list" aria-label={t("symptomsListLabel")}>
        {extras.map((symptom) => (
          <li key={symptom.id} className="symptom-card symptom-card--saved">
            <p className="symptom-card__text">{symptom.complaintText}</p>
            <div className="symptom-card__meta">
              {symptom.severity && (
                <span className={`symptom-card__tag symptom-card__tag--${symptom.severity.toLowerCase()}`}>
                  {t(severityLabelKey(symptom.severity))}
                </span>
              )}
              {symptom.bodyRegion && <span className="symptom-card__tag">{t(symptom.bodyRegion)}</span>}
              <button
                type="button"
                className="symptom-card__remove"
                onClick={() => void removeSymptom(symptom.id)}
              >
                {t("symptomsRemove")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="symptom-card symptom-card--draft">
          <label htmlFor="symptom-input" className="sr-only">
            {t("symptomPrompt")}
          </label>
          <textarea
            id="symptom-input"
            aria-label={t("symptomPrompt")}
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder={t("symptomPrompt")}
            rows={3}
            className="symptom-card__input"
          />
          <div className="severity-picker" role="group" aria-label={t("severityLabel")}>
            <span className="severity-picker__label">{t("severityLabel")}</span>
            <div className="severity-picker__options">
              {SEVERITY_ORDER.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`severity-option severity-option--${level.toLowerCase()} ${draftSeverity === level ? "severity-option--selected" : ""}`}
                  aria-pressed={draftSeverity === level}
                  onClick={() => setDraftSeverity(draftSeverity === level ? null : level)}
                >
                  {t(severityLabelKey(level))}
                </button>
              ))}
            </div>
          </div>
          <div className="symptom-card__regions" role="group" aria-label={t("symptomRegionOptional")}>
            <span className="severity-picker__label">{t("symptomRegionOptional")}</span>
            <div className="anatomy-region-list" role="list">
              {REGION_KEYS.map(({ key, labelKey }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={draftRegion === key}
                  className={`anatomy-region ${draftRegion === key ? "anatomy-region--selected" : ""}`}
                  onClick={() => setDraftRegion(draftRegion === key ? null : key)}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="symptom-card__actions">
            <button
              type="button"
              className="primary-button symptom-card__save"
              disabled={saving || draftText.trim().length === 0}
              aria-busy={saving}
              onClick={() => void saveSymptom()}
            >
              {t("symptomAdd")}
            </button>
            <button type="button" className="back-button" onClick={() => setAdding(false)}>
              {t("close")}
            </button>
          </div>
        </div>
      )}

      {!adding && !atLimit && (
        <button type="button" className="back-button symptoms-add" onClick={() => setAdding(true)}>
          + {t("symptomAdd")}
        </button>
      )}
      {atLimit && <p className="complaint-helper symptoms-limit">{t("symptomsLimit")}</p>}

      {error && (
        <p className="complaint-helper" role="alert">
          {error}
        </p>
      )}

      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={continueToInterview}>
          {t("complaintNext")} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
