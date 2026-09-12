"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Severity } from "@/lib/patient-flow";
import type { TranslationKey } from "@/lib/i18n";
import { usePatient } from "../PatientShell";

type Row = {
  id: string;
  position: number;
  complaintText: string;
  severity: Severity | null;
};

const quickSymptoms: [string, TranslationKey][] = [
  ["Nausea", "symptomNausea"],
  ["Vomiting", "symptomVomiting"],
  ["Loss of appetite", "symptomLossOfAppetite"],
  ["Bloating", "symptomBloating"],
  ["Constipation", "symptomConstipation"],
  ["Diarrhea", "symptomDiarrhea"],
  ["Fever", "symptomFever"],
  ["Fatigue", "symptomFatigue"],
];

const severityButtons: [Severity, TranslationKey, string][] = [
  ["MILD", "mild", "Mild"],
  ["MODERATE", "moderate", "Moderate"],
  ["SEVERE", "severe", "Severe"],
  ["VERY_SEVERE", "verySevere", "Very severe"],
];

export default function Symptoms() {
  const router = useRouter();
  const {
    sync,
    mutate,
    t,
    saveDraft,
    loadDraft,
    clearDraft,
    queuedBodies,
  } = usePatient();

  const [items, setItems] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/patient/complaints", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setItems(d.complaints ?? []);
        return;
      }
    } catch {}
    const queued = await queuedBodies("/api/patient/complaints");
    const extras = queued
      .filter((b) => b.primary !== true && typeof b.complaintText === "string")
      .map((b, i) => ({
        id: `offline-${String(b.clientMutationId ?? i)}`,
        position: 2 + i,
        complaintText: String(b.complaintText),
        severity: (b.severity as Severity | null) ?? null,
      }));
    setItems((prev) => {
      const primary = prev.filter((x) => x.position === 1);
      return [...primary, ...extras];
    });
  }

  useEffect(() => {
    void load();
    void loadDraft<{ text: string; severity: Severity | null }>("symptom-draft").then((d) => {
      if (d) {
        setText(d.text ?? "");
        setSeverity(d.severity ?? null);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (text || severity) void saveDraft("symptom-draft", { text, severity });
  }, [text, severity, saveDraft]);

  async function add(value = text) {
    const clean = value.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");

    const mutationId = crypto.randomUUID();
    const payload = { complaintText: clean, severity, clientMutationId: mutationId };
    const res = await mutate("/api/patient/complaints", "POST", payload, mutationId);

    if (!res.ok) {
      setError(t("networkError") || "Could not save this symptom. Please retry.");
      setBusy(false);
      return;
    }

    const optimistic: Row = {
      id: res.queued ? `offline-${mutationId}` : String(res.data?.id ?? mutationId),
      position: items.length + 1,
      complaintText: clean,
      severity,
    };

    setItems((current) =>
      current.some((x) => x.id === optimistic.id) ? current : [...current, optimistic]
    );
    setText("");
    setSeverity(null);
    await clearDraft("symptom-draft");
    if (!res.queued) await load();
    setBusy(false);
  }

  async function next() {
    setBusy(true);
    if (await sync({ workflowStep: "interview" })) {
      router.push("/patient/interview");
      return;
    }
    setBusy(false);
  }

  const saved = items.map((x) => x.complaintText.toLowerCase());
  const canAdd = items.filter((x) => x.position > 1).length < 3;

  return (
    <section className="flow-card reference-card symptoms-reference-card">
      <p className="eyebrow">{t("symptomsEyebrow")}</p>
      <h1>{t("symptomsHeading")}</h1>
      <p className="lead">{t("symptomsLead")}</p>

      <div className="symptom-reference-list">
        {quickSymptoms.map(([rawLabel, key]) => {
          const localized = t(key) || rawLabel;
          const isSaved =
            saved.includes(rawLabel.toLowerCase()) || saved.includes(localized.toLowerCase());
          return (
            <button
              type="button"
              key={rawLabel}
              disabled={!canAdd || busy || isSaved}
              className="symptom-reference-option"
              aria-pressed={isSaved}
              onClick={() => void add(localized)}
            >
              <span>{isSaved ? "✓" : "□"}</span>
              <b>{localized}</b>
            </button>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="saved-symptoms">
          <strong>{t("savedForVisit")}</strong>
          {items.map((x) => (
            <span key={x.id}>
              {x.position === 1 ? t("mainSymptomPrefix") || "Main: " : ""}
              {x.complaintText}
              {x.id.startsWith("offline-") ? " · saved offline" : ""}
            </span>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="custom-symptom-card">
          <div className="field">
            <label htmlFor="extra">{t("otherSymptomLabel")}</label>
            <textarea
              id="extra"
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("otherSymptomPlaceholder")}
            />
          </div>

          <div className="choice-grid compact-severity">
            {severityButtons.map(([val, key, fallback]) => (
              <button
                type="button"
                key={val}
                className={`choice ${
                  val === "SEVERE" ? "severe" : val === "VERY_SEVERE" ? "very-severe" : ""
                }`}
                aria-pressed={severity === val}
                onClick={() => setSeverity(severity === val ? null : val)}
              >
                {t(key) || fallback}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="secondary full-width"
            disabled={!text.trim() || busy}
            onClick={() => void add()}
          >
            + {busy ? t("savingSymptom") : t("saveSymptom")}
          </button>
        </div>
      )}

      {error && (
        <div className="system-banner error" role="alert">
          {error}
        </div>
      )}

      <div className="reference-actions">
        <button className="secondary" onClick={() => router.back()}>
          ← {t("back")}
        </button>
        <button
          className="primary reference-primary"
          disabled={busy}
          onClick={() => void next()}
        >
          {busy ? t("processing") : `${t("next")} →`}
        </button>
      </div>
    </section>
  );
}
