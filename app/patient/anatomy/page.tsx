"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import type { PatientBodyRegion, PatientBodySubregion } from "@/lib/patient-flow";

const bodyRegions: Array<{
  key: PatientBodyRegion;
  labelKey: "head" | "chest" | "abdomen" | "back" | "arm" | "hand" | "leg" | "foot" | "skin" | "other";
  subregions: Array<{ key: PatientBodySubregion; labelKey: string }>;
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

export default function PatientAnatomyPage() {
  const router = useRouter();
  const { workflow, setSelectedRegion, setSelectedSubregion, syncSession, t } = usePatientWorkflow();
  const activeRegion = workflow.selectedRegion;

  const regionButtons = useMemo(() => bodyRegions, []);

  function handleRegionClick(region: PatientBodyRegion) {
    const nextRegion = activeRegion === region ? null : region;
    const nextSubregion = nextRegion ? bodyRegions.find((candidate) => candidate.key === nextRegion)?.subregions[0]?.key ?? null : null;
    setSelectedRegion(nextRegion);
    setSelectedSubregion(nextSubregion);
    void syncSession({
      bodyRegion: nextRegion,
      bodySubregion: nextSubregion,
      workflowStep: "anatomy",
    });
  }

  return (
    <section className="flow-screen anatomy-screen" aria-labelledby="anatomy-title">
      <p className="eyebrow">{t("anatomyStep")}</p>
      <h1 id="anatomy-title">{t("anatomyTitle")}</h1>
      <p className="lead-copy anatomy-subtitle">{t("anatomyPrompt")}</p>

      <div className="anatomy-panel" aria-live="polite">
        <div className="body-figure" aria-label={t("bodyFigureLabel")}>
          <div className="body-figure__head" data-selected={activeRegion === "head" ? "true" : "false"} />
          <div className="body-figure__torso" data-selected={activeRegion === "chest" || activeRegion === "abdomen" ? "true" : "false"} />
          <div className="body-figure__arm body-figure__arm--left" data-selected={activeRegion === "arm" ? "true" : "false"} />
          <div className="body-figure__arm body-figure__arm--right" data-selected={activeRegion === "arm" ? "true" : "false"} />
          <div className="body-figure__leg body-figure__leg--left" data-selected={activeRegion === "leg" ? "true" : "false"} />
          <div className="body-figure__leg body-figure__leg--right" data-selected={activeRegion === "leg" ? "true" : "false"} />
        </div>

        <div className="anatomy-region-list" role="list" aria-label={t("regionListLabel")}>
          {regionButtons.map((region) => (
            <button
              key={region.key}
              type="button"
              role="button"
              aria-pressed={activeRegion === region.key}
              className={`anatomy-region ${activeRegion === region.key ? "anatomy-region--selected" : ""}`}
              onClick={() => handleRegionClick(region.key)}
            >
              {t(region.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="primary-action-stack">
        <button type="button" className="primary-button" onClick={() => router.push("/patient/interview")}>
          {t("complaintNext")} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
