"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Severity } from "@/lib/patient-flow";
import type { TranslationKey } from "@/lib/i18n";
import { usePatient } from "../PatientShell";
import EmergencyModal from "@/components/ui/EmergencyModal";

type Row = {
  id: string;
  position: number;
  complaintText: string;
  severity: Severity | null;
};

const quickSymptoms: [string, TranslationKey | null, boolean][] = [
  ["Nausea", "symptomNausea", false],
  ["Vomiting", "symptomVomiting", false],
  ["Loss of appetite", "symptomLossOfAppetite", false],
  ["Bloating", "symptomBloating", false],
  ["Constipation", "symptomConstipation", false],
  ["Diarrhea", "symptomDiarrhea", false],
  ["Fever", "symptomFever", false],
  ["Fatigue", "symptomFatigue", false],
  ["Difficulty breathing", null, true],
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
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [notSure, setNotSure] = useState(false);

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

  async function add(value = text, isRedFlag = false) {
    const clean = value.trim();
    if (!clean || busy) return;

    if (isRedFlag || clean.toLowerCase().includes("breathing") || clean.toLowerCase().includes("chest")) {
      setEmergencyReason(clean);
      setShowEmergency(true);
      return;
    }

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
  const canAdd = items.filter((x) => x.position > 1).length < 4;

  return (
    <section className="flow-card reference-card symptoms-reference-card">
      <p className="eyebrow">{t("symptomsEyebrow") || "6 · Other Symptoms"}</p>
      <h1>What else are you experiencing?</h1>
      <p className="lead">
        Select any other symptoms you have noticed recently. You can choose multiple options or write your own.
      </p>

      <div className="symptom-reference-list" role="group" aria-label="Symptom choices">
        {quickSymptoms.map(([rawLabel, key, isRedFlag]) => {
          const localized = key ? t(key) || rawLabel : rawLabel;
          const isSaved =

            saved.includes(rawLabel.toLowerCase()) || saved.includes(localized.toLowerCase());
          return (
            <button
              type="button"
              key={rawLabel}
              disabled={!canAdd || busy || isSaved}
              className={`symptom-reference-option ${isRedFlag ? "red-flag-option" : ""}`}
              aria-pressed={isSaved}
              onClick={() => void add(localized, isRedFlag)}
            >
              <span>{isSaved ? "✓" : "□"}</span>
              <b>{localized}</b>
              {isRedFlag && <small className="red-flag-label">⚠️ urgent</small>}
            </button>
          );
        })}
      </div>

      {/* Mandatory first-class uncertainty buttons */}
      <div className="symptom-uncertainty-row" role="group" aria-label="Uncertainty options">
        <button
          type="button"
          className={`uncertainty-chip ${notSure ? "active" : ""}`}
          onClick={() => setNotSure(!notSure)}
          aria-pressed={notSure}
        >
          <span>❓</span>
          <strong>I&apos;M NOT SURE</strong>
        </button>

        <button
          type="button"
          className="uncertainty-chip"
          onClick={() => {
            const input = document.getElementById("extra");
            input?.focus();
          }}
        >
          <span>💬</span>
          <strong>I DON&apos;T SEE MY SYMPTOM</strong>
        </button>
      </div>


      {items.length > 0 && (
        <div className="saved-symptoms">
          <strong>{t("savedForVisit") || "Selected for your visit:"}</strong>
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
            <label htmlFor="extra">
              {t("otherSymptomLabel") || "Or type another symptom:"}
            </label>
            <textarea
              id="extra"
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("otherSymptomPlaceholder") || "e.g. Mild dizziness when standing up…"}
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
            + {busy ? t("savingSymptom") : (t("saveSymptom") || "Add symptom")}
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

      {/* Emergency safety modal */}
      <EmergencyModal
        isOpen={showEmergency}
        symptomReason={emergencyReason}
        onGetHelp={() => {}}
        onAcknowledge={() => setShowEmergency(false)}
      />
    </section>
  );
}
