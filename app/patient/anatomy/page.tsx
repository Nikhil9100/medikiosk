"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BodyRegion, Severity } from "@/lib/patient-flow";
import type { TranslationKey } from "@/lib/i18n";
import { usePatient } from "../PatientShell";

const regions: [BodyRegion, TranslationKey, string][] = [
  ["head", "regionHead", "Head & Neck"],
  ["chest", "regionChest", "Chest"],
  ["abdomen", "regionAbdomen", "Abdomen"],
  ["back", "regionBack", "Back"],
  ["arm", "regionArms", "Arms & Hands"],
  ["leg", "regionLegs", "Legs & Feet"],
  ["skin", "regionSkin", "Skin"],
  ["other", "regionOther", "Other area"],
];

const severityOptions: [Severity, TranslationKey, string, string][] = [
  ["MILD", "mild", "Mild", "1–3"],
  ["MODERATE", "moderate", "Moderate", "4–6"],
  ["SEVERE", "severe", "Severe", "7–8"],
  ["VERY_SEVERE", "verySevere", "Very severe", "9–10"],
];

const hotspot: Record<BodyRegion, [number, number]> = {
  head: [80, 38],
  chest: [80, 92],
  abdomen: [80, 145],
  back: [80, 118],
  arm: [34, 126],
  hand: [22, 168],
  leg: [64, 235],
  foot: [60, 290],
  skin: [80, 120],
  other: [80, 175],
};

export default function Anatomy() {
  const router = useRouter();
  const { workflow, setWorkflow, sync, mutate, t } = usePatient();
  const [region, setRegion] = useState<BodyRegion | null>(workflow.region);
  const [severity, setSeverity] = useState<Severity | null>(workflow.severity);
  const [view, setView] = useState<"front" | "back">(workflow.region === "back" ? "back" : "front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleRegion(key: BodyRegion) {
    if (region === key) {
      setRegion(null);
    } else {
      setRegion(key);
      if (key === "back") setView("back");
      else if (key === "chest" || key === "abdomen") setView("front");
    }
  }

  function handleKey(e: React.KeyboardEvent, key: BodyRegion) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleRegion(key);
    }
  }

  async function next() {
    if (busy) return;
    setBusy(true);
    setError("");

    const mapped = await mutate("/api/patient/complaints", "PATCH", {
      primary: true,
      bodyRegion: region,
      severity,
    });

    if (!mapped.ok) {
      setError(t("networkError") || "Could not save the severity/body area. Please retry.");
      setBusy(false);
      return;
    }

    const ok = await sync({ bodyRegion: region, workflowStep: "symptoms" });
    if (ok) {
      setWorkflow((w) => ({ ...w, region, severity, currentStep: "symptoms" }));
      router.push("/patient/symptoms");
      return;
    }
    setBusy(false);
  }

  const point = region ? hotspot[region] : null;
  const showHotspot =
    point &&
    ((view === "front" && region !== "back") ||
      (view === "back" && region !== "chest" && region !== "abdomen"));

  return (
    <section className="flow-card reference-card anatomy-reference-card">
      <div className="reference-step-dots" aria-hidden="true">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span className="active">5</span>
      </div>

      <p className="eyebrow">{t("anatomyEyebrow")}</p>
      <h1>{t("rateDiscomfort") || "Rate your pain or discomfort"}</h1>

      <div className="severity-reference-grid">
        <button
          type="button"
          className="severity-reference none"
          aria-pressed={severity === null}
          onClick={() => setSeverity(null)}
        >
          <strong>{t("noPain") || "No pain"}</strong>
          <span>0</span>
        </button>
        {severityOptions.map(([value, key, fallback, range]) => (
          <button
            type="button"
            key={value}
            className={`severity-reference ${value.toLowerCase().replaceAll("_", "-")}`}
            aria-pressed={severity === value}
            onClick={() => setSeverity(value)}
          >
            <strong>{t(key) || fallback}</strong>
            <span>{range}</span>
          </button>
        ))}
      </div>

      <h2 className="reference-subheading">{t("selectAffectedArea") || "Select affected area(s)"}</h2>

      <div className="anatomy-reference-layout">
        <div className="body-map">
          <div className="body-map-view-toggle" role="tablist" aria-label="Body diagram orientation">
            <button
              type="button"
              role="tab"
              className={`view-tab ${view === "front" ? "active" : ""}`}
              aria-selected={view === "front"}
              onClick={() => setView("front")}
            >
              {t("frontView") || "Front"}
            </button>
            <button
              type="button"
              role="tab"
              className={`view-tab ${view === "back" ? "active" : ""}`}
              aria-selected={view === "back"}
              onClick={() => setView("back")}
            >
              {t("backView") || "Back"}
            </button>
          </div>

          <svg
            viewBox="0 0 160 320"
            role="group"
            aria-label={`Body diagram (${view === "front" ? "Front view" : "Back view"})`}
          >
            {/* Base silhouette outline */}
            <path
              d="M60 58 Q80 50 100 58 L111 118 L99 177 L95 300 L76 300 L72 190 L65 300 L45 300 L50 177 L39 118 Z"
              fill="#f1cdb7"
              stroke="#d7a98d"
              strokeWidth="2"
              opacity="0.3"
            />

            {/* Head & Neck */}
            <circle
              cx="80"
              cy="38"
              r="22"
              className={`body-part ${region === "head" ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionHead")}
              aria-pressed={region === "head"}
              onClick={() => toggleRegion("head")}
              onKeyDown={(e) => handleKey(e, "head")}
            />

            {view === "front" ? (
              <>
                {/* Front: Chest */}
                <path
                  d="M54 66 Q80 60 106 66 L110 118 L50 118 Z"
                  className={`body-part ${region === "chest" ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("regionChest")}
                  aria-pressed={region === "chest"}
                  onClick={() => toggleRegion("chest")}
                  onKeyDown={(e) => handleKey(e, "chest")}
                />
                {/* Front: Abdomen */}
                <path
                  d="M50 118 L110 118 L104 176 L56 176 Z"
                  className={`body-part ${region === "abdomen" ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("regionAbdomen")}
                  aria-pressed={region === "abdomen"}
                  onClick={() => toggleRegion("abdomen")}
                  onKeyDown={(e) => handleKey(e, "abdomen")}
                />
              </>
            ) : (
              /* Back: Upper & Lower Back */
              <path
                d="M54 66 Q80 60 106 66 L110 176 L50 176 Z"
                className={`body-part ${region === "back" ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={t("regionBack")}
                aria-pressed={region === "back"}
                onClick={() => toggleRegion("back")}
                onKeyDown={(e) => handleKey(e, "back")}
              />
            )}

            {/* Arms: Left & Right */}
            <g
              className={`body-part ${region === "arm" ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionArms")}
              aria-pressed={region === "arm"}
              onClick={() => toggleRegion("arm")}
              onKeyDown={(e) => handleKey(e, "arm")}
            >
              <path d="M54 68 L24 130 L14 174 L28 178 L42 136 L54 88 Z" />
              <path d="M106 68 L136 130 L146 174 L132 178 L118 136 L106 88 Z" />
            </g>

            {/* Legs: Left & Right */}
            <g
              className={`body-part ${region === "leg" ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionLegs")}
              aria-pressed={region === "leg"}
              onClick={() => toggleRegion("leg")}
              onKeyDown={(e) => handleKey(e, "leg")}
            >
              <path d="M56 176 L74 176 L72 296 L52 296 Z" />
              <path d="M86 176 L104 176 L108 296 L88 296 Z" />
            </g>

            {/* Hotspot marker */}
            {showHotspot && (
              <circle
                className="body-map-hotspot"
                cx={point[0]}
                cy={point[1]}
                r="11"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>

        <div className="body-region-list" role="group" aria-label="Body region selection list">
          {regions.map(([key, labelKey, fallback]) => (
            <button
              type="button"
              key={key}
              className="body-region-choice"
              aria-pressed={region === key}
              onClick={() => toggleRegion(key)}
            >
              <span>{region === key ? "✓" : "○"}</span>
              {t(labelKey) || fallback}
            </button>
          ))}
        </div>
      </div>

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
