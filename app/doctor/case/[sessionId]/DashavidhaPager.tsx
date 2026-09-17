"use client";

import React, { useMemo, useState } from "react";
import { DASHAVIDHA, type DashavidhaKey } from "@/lib/dashavidha";
import { DashavidhaIcon, DASHAVIDHA_META } from "./dashavidha-icons";

export type DashavidhaStage = {
  id: string;
  number: number;
  title: string;
  sanskrit: string;
  shortTitle: string;
  description: string;
  keys: DashavidhaKey[];
};

export const DASHAVIDHA_STAGES: DashavidhaStage[] = [
  {
    id: "constitution",
    number: 1,
    title: "Constitution & Morbidity",
    sanskrit: "प्रकृति एवं विकृति",
    shortTitle: "1. Constitution",
    description: "Assess innate doshic baseline vs. current pathological deviation.",
    keys: ["prakriti", "vikriti"],
  },
  {
    id: "tissues",
    number: 2,
    title: "Structural Frame & Tissues",
    sanskrit: "धातु एवं शरीर रचना",
    shortTitle: "2. Anatomy & Tissue",
    description: "Tissue excellence (Sapta Dhatus), skeletal compactness, and body proportions.",
    keys: ["sara", "samhanana", "pramana"],
  },
  {
    id: "capacities",
    number: 3,
    title: "Vital Capacities & Agni",
    sanskrit: "अग्नि, सात्म्य एवं व्यायाम",
    shortTitle: "3. Vitality & Agni",
    description: "Metabolic fire (Agni), adaptability/suitability, and physical endurance.",
    keys: ["satmya", "ahara_shakti", "vyayama_shakti"],
  },
  {
    id: "mind_age",
    number: 4,
    title: "Psyche & Lifespan",
    sanskrit: "सत्त्व एवं वय",
    shortTitle: "4. Mind & Age",
    description: "Psychological resilience (Sattva) and chronological stage of life (Vaya).",
    keys: ["sattva", "vaya"],
  },
];

type ViewMode = "stages" | "focus" | "all";

export type DashavidhaPagerProps = {
  sessionId: string;
  assessed: Map<string, any>;
  saving: string;
  setSaving: (k: string) => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
};

export function DashavidhaPager({
  sessionId,
  assessed,
  saving,
  setSaving,
  onSaved,
  onError,
}: DashavidhaPagerProps) {
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("stages");
  const [savedSuccessKey, setSavedSuccessKey] = useState<string | null>(null);

  // Overall stats
  const totalCount = DASHAVIDHA.length; // 10
  const observedCount = useMemo(() => {
    let count = 0;
    for (const [key] of DASHAVIDHA) {
      const row = assessed.get(key);
      if (row?.state === "OBSERVED" || (row?.value && row.value.trim().length > 0)) {
        count++;
      }
    }
    return count;
  }, [assessed]);

  const percentComplete = Math.round((observedCount / totalCount) * 100);

  // Stage assessment counts
  const stageStats = useMemo(() => {
    return DASHAVIDHA_STAGES.map((stg) => {
      let done = 0;
      for (const k of stg.keys) {
        const row = assessed.get(k);
        if (row?.state === "OBSERVED" || (row?.value && row.value.trim().length > 0)) {
          done++;
        }
      }
      return { total: stg.keys.length, done };
    });
  }, [assessed]);

  // Save observation
  async function handleSave(key: string, moveToNext = false) {
    const el = document.getElementById(`d-${key}`) as HTMLTextAreaElement | null;
    const value = el?.value?.trim() ?? "";
    setSaving(key);

    try {
      const r = await fetch(`/api/staff/case/${sessionId}/dashavidha`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          observation: key,
          state: value ? "OBSERVED" : "NOT_ASSESSED",
          value: value || null,
        }),
      });

      if (r.ok) {
        await onSaved();
        setSavedSuccessKey(key);
        setTimeout(() => setSavedSuccessKey((curr) => (curr === key ? null : curr)), 2000);

        if (moveToNext) {
          if (viewMode === "focus") {
            setFocusIdx((curr) => (curr < totalCount - 1 ? curr + 1 : curr));
          } else if (viewMode === "stages") {
            // Check if current key is last in active stage
            const currentStage = DASHAVIDHA_STAGES[activeStageIdx];
            const keyIndexInStage = currentStage.keys.indexOf(key as DashavidhaKey);
            if (keyIndexInStage === currentStage.keys.length - 1 && activeStageIdx < DASHAVIDHA_STAGES.length - 1) {
              setActiveStageIdx((curr) => curr + 1);
            }
          }
        }
      } else {
        onError("Dashavidha observation was not saved.");
      }
    } catch {
      onError("Failed to connect while saving observation.");
    } finally {
      setSaving("");
    }
  }

  // Render a single parameter card
  function renderCard(key: string, label: string, help: string, isFocusedMode = false) {
    const row = assessed.get(key);
    const isObserved = row?.state === "OBSERVED" || !!row?.value?.trim();
    const meta = DASHAVIDHA_META[key] ?? {
      sanskrit: label,
      english: help,
      clinicalFocus: help,
      bgGradient: "linear-gradient(135deg, #e6f4f0 0%, #d1ebe3 100%)",
    };
    const isSavingThis = saving === key;
    const isSavedSuccess = savedSuccessKey === key;

    return (
      <div
        className={`dash-item-visual ${isFocusedMode ? "focus-item" : ""} ${isObserved ? "is-observed" : ""}`}
        key={key}
      >
        <div className="dash-header-row">
          <div className="dash-icon-box" style={{ background: meta.bgGradient }}>
            <DashavidhaIcon name={key} size={isFocusedMode ? 48 : 42} />
          </div>
          <div className="dash-title-group">
            <span className="dash-sanskrit">{meta.sanskrit}</span>
            <span className="dash-english">{meta.english}</span>
          </div>
          <span className={`dash-badge ${isObserved ? "observed" : "unassessed"}`}>
            {isObserved ? "✓ Observed" : "Not Assessed"}
          </span>
        </div>

        <p className="dash-clinical-helper">{meta.clinicalFocus}</p>

        <textarea
          aria-label={`${label} observation`}
          defaultValue={row?.value ?? ""}
          id={`d-${key}`}
          placeholder={`Enter clinical findings or observations for ${label}…`}
          rows={isFocusedMode ? 3 : 2}
        />

        <div className="dash-actions">
          {isSavedSuccess && <span className="dash-save-feedback">Saved ✓</span>}
          <button
            type="button"
            className="dash-save-btn secondary"
            disabled={isSavingThis}
            onClick={() => void handleSave(key, false)}
          >
            {isSavingThis ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="dash-save-btn primary"
            disabled={isSavingThis}
            onClick={() => void handleSave(key, true)}
            title="Save and advance to the next parameter"
          >
            {isSavingThis ? "Saving…" : "Save & Next →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-pager-container">
      {/* 1. Header & Progress Bar */}
      <div className="dash-pager-header">
        <div className="dash-progress-meta">
          <div className="dash-progress-title-row">
            <span className="dash-progress-label">Clinical Examination Progress</span>
            <span className="dash-progress-pill">
              <strong>{observedCount}</strong> of {totalCount} Assessed ({percentComplete}%)
            </span>
          </div>
          <div className="dash-progress-track">
            <div
              className="dash-progress-fill"
              style={{ width: `${percentComplete}%` }}
              aria-valuenow={percentComplete}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="dash-mode-switcher" role="tablist" aria-label="View Mode">
          <button
            type="button"
            className={`dash-mode-btn ${viewMode === "stages" ? "active" : ""}`}
            onClick={() => setViewMode("stages")}
            title="View grouped by 4 classical clinical stages"
          >
            📑 Paged Stages
          </button>
          <button
            type="button"
            className={`dash-mode-btn ${viewMode === "focus" ? "active" : ""}`}
            onClick={() => setViewMode("focus")}
            title="Step through 1 parameter at a time"
          >
            🎯 Focus Stepper
          </button>
          <button
            type="button"
            className={`dash-mode-btn ${viewMode === "all" ? "active" : ""}`}
            onClick={() => setViewMode("all")}
            title="Show all 10 cards at once"
          >
            ⊞ View All (10)
          </button>
        </div>
      </div>

      {/* 2. MODE A: PAGED STAGES VIEW (Default) */}
      {viewMode === "stages" && (
        <div className="dash-stages-container">
          {/* Stage Tab Navigation Pills */}
          <div className="dash-stage-tabs" role="tablist">
            {DASHAVIDHA_STAGES.map((stg, idx) => {
              const { done, total } = stageStats[idx];
              const isActive = activeStageIdx === idx;
              const isAllDone = done === total;

              return (
                <button
                  key={stg.id}
                  type="button"
                  className={`dash-stage-tab ${isActive ? "active" : ""} ${isAllDone ? "complete" : ""}`}
                  onClick={() => setActiveStageIdx(idx)}
                >
                  <span className="tab-stage-num">Stage {stg.number}</span>
                  <span className="tab-stage-name">{stg.title}</span>
                  <span className={`tab-stage-badge ${isAllDone ? "badge-done" : ""}`}>
                    {done}/{total} {isAllDone ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Stage Header & Card Grid */}
          <div className="dash-stage-content">
            <div className="dash-stage-banner">
              <div className="stage-banner-left">
                <span className="stage-number-tag">
                  Stage {DASHAVIDHA_STAGES[activeStageIdx].number} of 4
                </span>
                <h4>{DASHAVIDHA_STAGES[activeStageIdx].title}</h4>
                <p>{DASHAVIDHA_STAGES[activeStageIdx].description}</p>
              </div>
              <div className="stage-banner-nav">
                <button
                  type="button"
                  className="stage-nav-btn"
                  disabled={activeStageIdx === 0}
                  onClick={() => setActiveStageIdx((c) => Math.max(0, c - 1))}
                  title="Previous stage"
                >
                  ← Previous Stage
                </button>
                <button
                  type="button"
                  className="stage-nav-btn next"
                  disabled={activeStageIdx === DASHAVIDHA_STAGES.length - 1}
                  onClick={() =>
                    setActiveStageIdx((c) => Math.min(DASHAVIDHA_STAGES.length - 1, c + 1))
                  }
                  title="Next stage"
                >
                  Next Stage →
                </button>
              </div>
            </div>

            {/* Paged Grid: Only 2 or 3 items at a time! */}
            <div className="dash-grid paged-grid">
              {DASHAVIDHA_STAGES[activeStageIdx].keys.map((key) => {
                const found = DASHAVIDHA.find(([k]) => k === key);
                if (!found) return null;
                const [, label, help] = found;
                return renderCard(key, label, help, false);
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. MODE B: FOCUS STEPPER (1-by-1 walkthrough) */}
      {viewMode === "focus" && (
        <div className="dash-focus-container">
          {/* Quick Step Bar */}
          <div className="dash-focus-steps-bar">
            {DASHAVIDHA.map(([key, label], idx) => {
              const row = assessed.get(key);
              const isObs = row?.state === "OBSERVED" || !!row?.value?.trim();
              const isCurr = focusIdx === idx;

              return (
                <button
                  key={key}
                  type="button"
                  className={`dash-step-chip ${isCurr ? "current" : ""} ${isObs ? "observed" : ""}`}
                  onClick={() => setFocusIdx(idx)}
                  title={`${idx + 1}. ${label} (${isObs ? "Observed" : "Not Assessed"})`}
                >
                  <span className="step-num">{idx + 1}</span>
                  <span className="step-label">{label}</span>
                  <span className="step-dot" />
                </button>
              );
            })}
          </div>

          {/* Stepper Card */}
          <div className="dash-focus-card-wrap">
            <div className="dash-focus-nav-row">
              <button
                type="button"
                className="stage-nav-btn"
                disabled={focusIdx === 0}
                onClick={() => setFocusIdx((c) => Math.max(0, c - 1))}
              >
                ← Previous ({focusIdx > 0 ? DASHAVIDHA[focusIdx - 1][1] : ""})
              </button>
              <span className="focus-counter">
                Parameter <strong>{focusIdx + 1}</strong> of 10
              </span>
              <button
                type="button"
                className="stage-nav-btn next"
                disabled={focusIdx === totalCount - 1}
                onClick={() => setFocusIdx((c) => Math.min(totalCount - 1, c + 1))}
              >
                Next ({focusIdx < totalCount - 1 ? DASHAVIDHA[focusIdx + 1][1] : ""}) →
              </button>
            </div>

            {renderCard(
              DASHAVIDHA[focusIdx][0],
              DASHAVIDHA[focusIdx][1],
              DASHAVIDHA[focusIdx][2],
              true
            )}
          </div>
        </div>
      )}

      {/* 4. MODE C: VIEW ALL (10) GRID */}
      {viewMode === "all" && (
        <div className="dash-grid all-grid">
          {DASHAVIDHA.map(([key, label, help]) => renderCard(key, label, help, false))}
        </div>
      )}
    </div>
  );
}
