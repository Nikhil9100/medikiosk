"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { TranslationKey } from "@/lib/i18n";
import type { PatientBodyRegion, PatientBodySubregion } from "@/lib/patient-flow";

type DiagramRegion = Exclude<PatientBodyRegion, "skin" | "other">;

const bodyRegions: Array<{
  key: PatientBodyRegion;
  labelKey: "head" | "chest" | "abdomen" | "back" | "arm" | "hand" | "leg" | "foot" | "skin" | "other";
  subregions: Array<{ key: PatientBodySubregion; labelKey: TranslationKey }>;
}> = [
  { key: "head", labelKey: "head", subregions: [{ key: "face", labelKey: "face" }, { key: "upper", labelKey: "upper" }] },
  { key: "chest", labelKey: "chest", subregions: [{ key: "front", labelKey: "front" }, { key: "middle", labelKey: "middle" }] },
  { key: "abdomen", labelKey: "abdomen", subregions: [{ key: "upper", labelKey: "upper" }, { key: "lower", labelKey: "lower" }] },
  { key: "back", labelKey: "back", subregions: [{ key: "back", labelKey: "back" }, { key: "middle", labelKey: "middle" }] },
  { key: "arm", labelKey: "arm", subregions: [{ key: "left", labelKey: "left" }, { key: "right", labelKey: "right" }] },
  { key: "hand", labelKey: "hand", subregions: [{ key: "left", labelKey: "left" }, { key: "right", labelKey: "right" }] },
  { key: "leg", labelKey: "leg", subregions: [{ key: "left", labelKey: "left" }, { key: "right", labelKey: "right" }] },
  { key: "foot", labelKey: "foot", subregions: [{ key: "left", labelKey: "left" }, { key: "right", labelKey: "right" }] },
  { key: "skin", labelKey: "skin", subregions: [{ key: "body", labelKey: "body" }, { key: "upper", labelKey: "upper" }] },
  { key: "other", labelKey: "other", subregions: [{ key: "body", labelKey: "body" }] },
];

const diagramRegions: DiagramRegion[] = ["head", "chest", "abdomen", "back", "arm", "hand", "leg", "foot"];

/**
 * Visual body diagram — front and back views of the same figure.
 * Regions are the canonical workflow regions (head, chest, abdomen, back,
 * arm, hand, leg, foot); skin and "other" stay in the list below the figure
 * because they are not anatomical locations.
 */
function BodyFigure({
  view,
  activeRegion,
  onRegion,
  labels,
}: {
  view: "front" | "back";
  activeRegion: PatientBodyRegion | null;
  onRegion: (region: DiagramRegion) => void;
  labels: Record<DiagramRegion, string>;
}) {
  const regionProps = (region: DiagramRegion) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": labels[region],
    "aria-pressed": activeRegion === region,
    className: `body-part ${activeRegion === region ? "body-part--selected" : ""}`,
    onClick: () => onRegion(region),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onRegion(region);
      }
    },
  });

  return (
    <svg
      className="body-figure-svg"
      viewBox="0 0 220 400"
      role="group"
      aria-label={view === "front" ? "Body area selection (front view)" : "Body area selection (back view)"}
    >
      {/* Head (both views) */}
      <g {...regionProps("head")}>
        <title>{labels.head}</title>
        <circle cx="110" cy="38" r="26" className="body-part__shape" />
        <rect x="100" y="58" width="20" height="16" className="body-part__shape" />
      </g>

      {view === "front" ? (
        <>
          {/* Chest (upper torso) */}
          <g {...regionProps("chest")}>
            <title>{labels.chest}</title>
            <path d="M70,78 Q110,66 150,78 L155,148 Q110,162 65,148 Z" className="body-part__shape" />
          </g>
          {/* Abdomen (lower torso) */}
          <g {...regionProps("abdomen")}>
            <title>{labels.abdomen}</title>
            <path d="M65,148 Q110,162 155,148 L150,212 Q110,226 70,212 Z" className="body-part__shape" />
          </g>
        </>
      ) : (
        /* Back (whole torso, back view) */
        <g {...regionProps("back")}>
          <title>{labels.back}</title>
          <path d="M70,78 Q110,66 150,78 L155,148 Q110,162 65,148 L150,212 Q110,226 70,212 Z" className="body-part__shape" />
        </g>
      )}

      {/* Arms */}
      <g {...regionProps("arm")}>
        <title>{labels.arm}</title>
        <rect x="40" y="80" width="22" height="88" rx="11" className="body-part__shape" />
        <rect x="158" y="80" width="22" height="88" rx="11" className="body-part__shape" />
      </g>

      {/* Hands */}
      <g {...regionProps("hand")}>
        <title>{labels.hand}</title>
        <ellipse cx="51" cy="186" rx="12" ry="15" className="body-part__shape" />
        <ellipse cx="169" cy="186" rx="12" ry="15" className="body-part__shape" />
      </g>

      {/* Legs */}
      <g {...regionProps("leg")}>
        <title>{labels.leg}</title>
        <rect x="76" y="216" width="28" height="138" rx="13" className="body-part__shape" />
        <rect x="116" y="216" width="28" height="138" rx="13" className="body-part__shape" />
      </g>

      {/* Feet */}
      <g {...regionProps("foot")}>
        <title>{labels.foot}</title>
        <ellipse cx="84" cy="368" rx="16" ry="10" className="body-part__shape" />
        <ellipse cx="136" cy="368" rx="16" ry="10" className="body-part__shape" />
      </g>
    </svg>
  );
}

export default function PatientAnatomyPage() {
  const router = useRouter();
  const { workflow, setSelectedRegion, setSelectedSubregion, syncSession, t } = usePatientWorkflow();
  const activeRegion = workflow.selectedRegion;
  const [view, setView] = useState<"front" | "back">("front");

  const regionButtons = useMemo(() => bodyRegions, []);
  const activeDefinition = bodyRegions.find((candidate) => candidate.key === activeRegion) ?? null;
  const labels = useMemo(
    () =>
      Object.fromEntries(diagramRegions.map((key) => [key, t(bodyRegions.find((candidate) => candidate.key === key)?.labelKey ?? "other")])) as Record<DiagramRegion, string>,
    [t]
  );

  /** Mirror the body area onto the complaint row (the doctor console reads
      region/severity from complaints, not just the session). */
  async function syncRegionToComplaint(region: PatientBodyRegion | null, subregion: PatientBodySubregion | null) {
    try {
      const listRes = await fetch("/api/patient/complaints", { cache: "no-store" });
      if (!listRes.ok) return;
      const data = (await listRes.json()) as { complaints?: { id: string }[] };
      const first = data.complaints?.[0];
      if (!first) return;
      await fetch("/api/patient/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: first.id, bodyRegion: region, bodySubregion: subregion }),
      });
    } catch {
      // Best effort: the session still carries the region for the assistant
      // and summary; the doctor console shows the complaint text regardless.
    }
  }

  function handleRegionClick(region: DiagramRegion) {
    const nextRegion: PatientBodyRegion | null = activeRegion === region ? null : region;
    const nextSubregion: PatientBodySubregion | null = nextRegion
      ? bodyRegions.find((candidate) => candidate.key === nextRegion)?.subregions[0]?.key ?? null
      : null;
    setSelectedRegion(nextRegion);
    setSelectedSubregion(nextSubregion);
    void syncSession({
      bodyRegion: nextRegion,
      bodySubregion: nextSubregion,
      workflowStep: "anatomy",
    });
    void syncRegionToComplaint(nextRegion, nextSubregion);
  }

  function handleSubregionClick(subregion: PatientBodySubregion) {
    if (!activeRegion) return;
    setSelectedSubregion(subregion);
    void syncSession({
      bodyRegion: activeRegion,
      bodySubregion: subregion,
      workflowStep: "anatomy",
    });
    void syncRegionToComplaint(activeRegion, subregion);
  }

  return (
    <section className="flow-screen anatomy-screen" aria-labelledby="anatomy-title">
      <p className="eyebrow">{t("anatomyStep")}</p>
      <h1 id="anatomy-title">{t("anatomyTitle")}</h1>
      <p className="lead-copy anatomy-subtitle">{t("anatomyPrompt")}</p>

      <div className="anatomy-panel" aria-live="polite">
        <div className="body-view-toggle" role="group" aria-label={t("bodyFigureLabel")}>
          <button
            type="button"
            className={`body-view-toggle__button ${view === "front" ? "body-view-toggle__button--active" : ""}`}
            aria-pressed={view === "front"}
            onClick={() => setView("front")}
          >
            {t("front")}
          </button>
          <button
            type="button"
            className={`body-view-toggle__button ${view === "back" ? "body-view-toggle__button--active" : ""}`}
            aria-pressed={view === "back"}
            onClick={() => setView("back")}
          >
            {t("back")}
          </button>
        </div>

        <BodyFigure view={view} activeRegion={activeRegion} onRegion={handleRegionClick} labels={labels} />

        {activeDefinition && (
          <div className="anatomy-subregions" role="group" aria-label={`${t(activeDefinition.labelKey)} – ${t("regionListLabel")}`}>
            {activeDefinition.subregions.map((subregion) => (
              <button
                key={subregion.key}
                type="button"
                className={`anatomy-subregion ${workflow.selectedSubregion === subregion.key ? "anatomy-subregion--selected" : ""}`}
                aria-pressed={workflow.selectedSubregion === subregion.key}
                onClick={() => handleSubregionClick(subregion.key)}
              >
                {t(subregion.labelKey)}
              </button>
            ))}
          </div>
        )}

        <div className="anatomy-region-list" role="list" aria-label={t("regionListLabel")}>
          {regionButtons.map((region) => (
            <button
              key={region.key}
              type="button"
              role="button"
              aria-pressed={activeRegion === region.key}
              className={`anatomy-region ${activeRegion === region.key ? "anatomy-region--selected" : ""}`}
              onClick={() => handleRegionClick(region.key as DiagramRegion)}
            >
              {t(region.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={() => router.push("/patient/symptoms")}>
          {t("complaintNext")} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
