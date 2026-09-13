"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BodyRegion, Severity } from "@/lib/patient-flow";
import type { TranslationKey } from "@/lib/i18n";
import { parseAnatomyVoice, getLocaleForLanguage } from "@/lib/anatomy-voice";
import { usePatient } from "../PatientShell";
import type { PatientBodyRegion, PatientBodySubregion } from "@/lib/patient-flow";
import { LazarusLocationSelectorWrapper as LazarusLocationSelector } from "@/components/lazarus/LazarusLocationSelectorWrapper";

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

// [severity, i18nKey, fallback label, numeric range, face icon]
const severityOptions: [Severity, TranslationKey, string, string, string][] = [
  ["MILD", "mild", "Mild", "1–3", "🙂"],
  ["MODERATE", "moderate", "Moderate", "4–6", "😐"],
  ["SEVERE", "severe", "Severe", "7–8", "😟"],
  ["VERY_SEVERE", "verySevere", "Very severe", "9–10", "😣"],
];

const subregionsByRegion: Record<string, { key: TranslationKey; fallback: string }[]> = {
  head: [
    { key: "subregionFace", fallback: "Face" },
    { key: "subregionScalp", fallback: "Scalp / Top of head" },
    { key: "subregionNeck", fallback: "Neck" },
    { key: "subregionEye", fallback: "Eye area" },
    { key: "subregionEar", fallback: "Ear area" },
    { key: "subregionThroat", fallback: "Throat / Mouth" },
  ],
  chest: [
    { key: "subregionCenterChest", fallback: "Center chest" },
    { key: "subregionLeftChest", fallback: "Left chest" },
    { key: "subregionRightChest", fallback: "Right chest" },
  ],
  abdomen: [
    { key: "subregionUpperAbdomen", fallback: "Upper abdomen (stomach)" },
    { key: "subregionLowerAbdomen", fallback: "Lower abdomen" },
    { key: "subregionLeftAbdomen", fallback: "Left abdomen" },
    { key: "subregionRightAbdomen", fallback: "Right abdomen" },
    { key: "subregionNavel", fallback: "Navel / Center" },
    { key: "subregionPelvicArea", fallback: "Pelvic area" },
    { key: "subregionGroin", fallback: "Groin" },
  ],
  back: [
    { key: "subregionUpperBack", fallback: "Upper back" },
    { key: "subregionMidBack", fallback: "Middle back" },
    { key: "subregionLowerBack", fallback: "Lower back / Lumbar" },
  ],
  arm: [
    { key: "subregionShoulder", fallback: "Shoulder" },
    { key: "subregionUpperArm", fallback: "Upper arm" },
    { key: "subregionElbow", fallback: "Elbow" },
    { key: "subregionForearm", fallback: "Forearm" },
    { key: "subregionWristHand", fallback: "Wrist & Hand" },
  ],
  leg: [
    { key: "subregionHip", fallback: "Hip" },
    { key: "subregionThigh", fallback: "Thigh" },
    { key: "subregionKnee", fallback: "Knee" },
    { key: "subregionCalf", fallback: "Calf" },
    { key: "subregionAnkleFoot", fallback: "Ankle & Foot" },
  ],
  skin: [
    { key: "subregionSkinRash", fallback: "Skin rash / irritation" },
  ],
  other: [
    { key: "subregionGeneralOther", fallback: "Other / Whole body" },
  ],
};

export default function Anatomy() {
  const router = useRouter();
  const { workflow, setWorkflow, sync, mutate, t } = usePatient();
  const [selectedRegions, setSelectedRegions] = useState<BodyRegion[]>(
    workflow.region ? [workflow.region] : []
  );
  const [selectedSubregions, setSelectedSubregions] = useState<Record<string, string[]>>({});
  const [severity, setSeverity] = useState<Severity | null>(workflow.severity);
  const [view, setView] = useState<"front" | "back">(workflow.region === "back" ? "back" : "front");
  const [mode, setMode] = useState<"diagram" | "lazarus">("diagram");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Voice proposed state (transient, NOT committed until explicit confirmation)
  const [proposedRegions, setProposedRegions] = useState<BodyRegion[]>([]);
  const [proposedSubregions, setProposedSubregions] = useState<Record<string, string[]>>({});
  const [proposedSeverity, setProposedSeverity] = useState<Severity | "NONE" | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);

  const recRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const supported = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
      setSpeechSupported(supported);
    }
    return () => {
      stopVoice();
    };
  }, []);

  const region = selectedRegions.length > 0 ? selectedRegions[selectedRegions.length - 1] : null;

  function stopVoice() {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
      recRef.current = null;
    }
    setListening(false);
  }

  function startListening() {
    stopVoice();
    setVoiceFeedback("");

    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechSupported(false);
      setVoiceFeedback(t("voiceUnsupported") || "Voice input is not supported in this browser. Please use tap/click.");
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = getLocaleForLanguage(workflow.language);
      rec.continuous = false;
      rec.interimResults = true;

      rec.onstart = () => {
        setListening(true);
        setVoiceFeedback("");
        // Safety max duration timeout: 10s
        maxTimeoutRef.current = setTimeout(() => {
          stopVoice();
        }, 10000);
        // Silence timeout: 2.5s
        silenceTimeoutRef.current = setTimeout(() => {
          stopVoice();
        }, 3000);
      };

      rec.onresult = (e: any) => {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = setTimeout(() => {
          stopVoice();
        }, 2500);

        let transcript = "";
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript + " ";
        }

        const parsed = parseAnatomyVoice(transcript, workflow.language);
        if (parsed.isMatched) {
          if (parsed.matchedRegions.length > 0) {
            setProposedRegions(parsed.matchedRegions);
            setProposedSubregions(parsed.matchedSubregions);
          }
          if (parsed.matchedSeverity) {
            setProposedSeverity(parsed.matchedSeverity);
          }
          setVoiceFeedback("");
        } else if (e.results[0]?.isFinal) {
          setVoiceFeedback(t("voiceNoMatch") || "We didn't catch that — try again or tap the body area.");
        }
      };

      rec.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "permission-denied") {
          setVoiceFeedback(
            t("voiceMicDenied") ||
              "Microphone access was denied. You can select your affected areas by tapping below."
          );
        } else if (e.error === "no-speech") {
          setVoiceFeedback(t("voiceNoMatch") || "We didn't catch that — try again or tap the body area.");
        }
        stopVoice();
      };

      rec.onend = () => {
        setListening(false);
      };

      recRef.current = rec;
      rec.start();
    } catch {
      setListening(false);
      setVoiceFeedback(t("voiceNoMatch") || "We didn't catch that — try again or tap the body area.");
    }
  }

  function toggleVoice() {
    if (listening) {
      stopVoice();
    } else {
      startListening();
    }
  }

  function confirmProposed() {
    if (proposedRegions.length === 0 && proposedSeverity === null) return;

    if (proposedRegions.length > 0) {
      setSelectedRegions((prev) => Array.from(new Set([...prev, ...proposedRegions])));
      setSelectedSubregions((prev) => {
        const next = { ...prev };
        for (const [rk, subs] of Object.entries(proposedSubregions)) {
          next[rk] = Array.from(new Set([...(next[rk] || []), ...subs]));
        }
        return next;
      });
      if (proposedRegions.includes("back")) {
        setView("back");
      } else if (proposedRegions.includes("chest") || proposedRegions.includes("abdomen")) {
        setView("front");
      }
    }

    if (proposedSeverity !== null) {
      // "NONE" means "no pain" - maps to severity null
      setSeverity(proposedSeverity === "NONE" ? null : proposedSeverity);
    }

    setProposedRegions([]);
    setProposedSubregions({});
    setProposedSeverity(null);
    setVoiceFeedback("");
  }

  function discardProposed() {
    setProposedRegions([]);
    setProposedSubregions({});
    setProposedSeverity(null);
    setVoiceFeedback("");
  }

  function toggleRegion(key: BodyRegion) {
    // Clear any pending proposed voice state on manual interaction
    if (proposedRegions.length > 0) {
      discardProposed();
    }

    if (selectedRegions.includes(key)) {
      setSelectedRegions((prev) => prev.filter((r) => r !== key));
      setSelectedSubregions((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setSelectedRegions((prev) => [...prev, key]);
      if (key === "back") setView("back");
      else if (key === "chest" || key === "abdomen") setView("front");
    }
  }

  function toggleSubregion(regionKey: BodyRegion, subKey: string) {
    if (proposedRegions.length > 0) {
      discardProposed();
    }

    setSelectedSubregions((prev) => {
      const current = prev[regionKey] || [];
      const updated = current.includes(subKey)
        ? current.filter((s) => s !== subKey)
        : [...current, subKey];
      return { ...prev, [regionKey]: updated };
    });
  }

  function clearAllSelections() {
    setSelectedRegions([]);
    setSelectedSubregions({});
    discardProposed();
  }

  function handleLazarusSelection(
    newRegion: PatientBodyRegion | null,
    newSubregion: PatientBodySubregion | null,
  ) {
    if (newRegion) {
      setSelectedRegions([newRegion]);
      if (newSubregion) {
        setSelectedSubregions({ [newRegion]: [newSubregion] });
      } else {
        setSelectedSubregions({});
      }
    } else {
      setSelectedRegions([]);
      setSelectedSubregions({});
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

  const isHeadSelected = region === "head" || selectedRegions.includes("head");
  const isChestSelected = region === "chest" || selectedRegions.includes("chest");
  const isAbdomenSelected = region === "abdomen" || selectedRegions.includes("abdomen");
  const isBackSelected = region === "back" || selectedRegions.includes("back");
  const isArmSelected = region === "arm" || selectedRegions.includes("arm");
  const isLegSelected = region === "leg" || selectedRegions.includes("leg");

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
      <div className="severity-section-header">
        <h1>{t("rateDiscomfort") || "Rate your pain or discomfort"}</h1>
        {speechSupported && (
          <button
            type="button"
            className={`anatomy-voice-trigger severity-voice-trigger ${listening ? "live" : ""}`}
            onClick={toggleVoice}
            aria-label={
              listening
                ? (t("stopRecording") || "Stop recording")
                : (t("speakSeverityOrArea") || "Speak pain level or area")
            }
            aria-pressed={listening}
          >
            <span className="anatomy-mic-icon" aria-hidden="true">{listening ? "■" : "🎙"}</span>
            <span className="anatomy-mic-label">
              {listening ? (t("listening") || "Listening…") : (t("speakSeverityShort") || "Speak level")}
            </span>
          </button>
        )}
      </div>

      <div className="severity-reference-grid" role="group" aria-label={t("rateDiscomfort") || "Rate your pain or discomfort"}>
        <button
          type="button"
          className={`severity-reference none${proposedSeverity === "NONE" ? " proposed" : ""}`}
          aria-pressed={severity === null}
          aria-label={`${t("noPain") || "No pain"} — 0`}
          onClick={() => { setSeverity(null); setProposedSeverity(null); }}
        >
          <span className="severity-face" aria-hidden="true">😌</span>
          <strong>{t("noPain") || "No pain"}</strong>
          <span className="severity-range">0</span>
        </button>
        {severityOptions.map(([value, key, fallback, range, face]) => (
          <button
            type="button"
            key={value}
            className={`severity-reference ${value.toLowerCase().replaceAll("_", "-")}${proposedSeverity === value ? " proposed" : ""}`}
            aria-pressed={severity === value}
            aria-label={`${t(key) || fallback} — ${range}`}
            onClick={() => { setSeverity(value); setProposedSeverity(null); }}
          >
            <span className="severity-face" aria-hidden="true">{face}</span>
            <strong>{t(key) || fallback}</strong>
            <span className="severity-range">{range}</span>
          </button>
        ))}
      </div>

      {/* Voice listening hint for severity */}
      {listening && (
        <div className="voice-status-notice listening" role="status" aria-live="polite">
          <div className="voice-wave-mini" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <span>{t("voiceListeningSeverityAndArea") || "Listening… say your pain level (e.g. 'mild', 'seven') or area (e.g. 'chest', 'back')"}</span>
        </div>
      )}

      {!listening && voiceFeedback && (
        <div className="voice-status-notice feedback" role="status" aria-live="polite">
          <span>{voiceFeedback}</span>
        </div>
      )}

      {/* Mandatory voice confirmation strip — shown when either severity or region is proposed */}
      {(proposedRegions.length > 0 || proposedSeverity !== null) && (
        <div className="voice-confirmation-strip" role="region" aria-live="polite">
          <div className="voice-confirmation-content">
            <span className="voice-heard-badge" aria-hidden="true">🎙</span>
            <p className="voice-heard-text">
              <b>{t("voiceHeardPrefix") || "We heard:"}</b>{" "}
              <span className="voice-heard-regions">
                {[
                  proposedSeverity !== null
                    ? (proposedSeverity === "NONE"
                        ? (t("noPain") || "No pain")
                        : (() => {
                            const tup = severityOptions.find(([v]) => v === proposedSeverity);
                            return tup ? (t(tup[1]) || tup[2]) : proposedSeverity;
                          })())
                    : null,
                  ...proposedRegions.map((rk) => {
                    const tup = regions.find(([k]) => k === rk);
                    return tup ? (t(tup[1]) || tup[2]) : rk;
                  }),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              . {t("voiceHeardQuestion") || "Is this correct?"}
            </p>
          </div>
          <div className="voice-confirmation-actions">
            <button
              type="button"
              className="voice-confirm-btn"
              onClick={confirmProposed}
            >
              ✓ {t("voiceConfirmBtn") || "Confirm"}
            </button>
            <button
              type="button"
              className="voice-edit-btn"
              onClick={discardProposed}
            >
              {t("voiceEditManuallyBtn") || "Edit manually"}
            </button>
          </div>
        </div>
      )}

      <div className="reference-subheading-row">
        <h2 className="reference-subheading">{t("selectAffectedArea") || "Select affected area(s)"}</h2>
      </div>

      {/* Selected areas chips */}
      {selectedRegions.length > 0 && (
        <div className="selected-areas-bar" role="region" aria-label={t("selectedAreas") || "Selected areas"}>
          <div className="selected-chips-list">
            {selectedRegions.map((regKey) => {
              const regTuple = regions.find(([k]) => k === regKey);
              const label = regTuple ? (t(regTuple[1]) || regTuple[2]) : regKey;
              const subs = selectedSubregions[regKey] || [];
              return (
                <span key={regKey} className="anatomy-selected-chip">
                  <strong>{label}</strong>
                  {subs.length > 0 && (
                    <small>
                      ({subs.map((s) => t(s as TranslationKey) || s).join(", ")})
                    </small>
                  )}
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove ${label}`}
                    onClick={() => toggleRegion(regKey)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <button
            type="button"
            className="clear-all-chip-btn"
            onClick={clearAllSelections}
          >
            {t("clearAll") || "Clear all"}
          </button>
        </div>
      )}

      {/* View Mode Toolbar: Standard 2D Diagram vs Precision Pinpoint */}
      <div className="body-view-toggle" role="group" aria-label={t("standardDiagram") || "Body selection mode"}>
        <button
          type="button"
          className={`body-view-toggle__button ${mode === "diagram" ? "body-view-toggle__button--active" : ""}`}
          aria-pressed={mode === "diagram"}
          onClick={() => setMode("diagram")}
        >
          {t("standardDiagram")}
        </button>
        <button
          type="button"
          className={`body-view-toggle__button ${mode === "lazarus" ? "body-view-toggle__button--active" : ""}`}
          aria-pressed={mode === "lazarus"}
          onClick={() => setMode("lazarus")}
        >
          🔍 {t("pinpointSelector")}
        </button>
      </div>

      <div className="anatomy-reference-layout">
        {mode === "lazarus" ? (
          <LazarusLocationSelector
            activeRegion={region}
            activeSubregion={region && selectedSubregions[region] ? (selectedSubregions[region][0] as PatientBodySubregion) : null}
            onSelectionChange={handleLazarusSelection}
            onClose={() => setMode("diagram")}
            labels={{
              pinpointTitle: t("pinpointSelector"),
              zoomInstruction: t("zoomInstruction"),
              zoomIn: t("zoomIn"),
              zoomOut: t("zoomOut"),
              flipToBack: t("backView") || "Back",
              flipToFront: t("frontView") || "Front",
              cancel: t("cancelPinpoint"),
              confirm: t("confirmSelection"),
              selectedLocation: t("selectedLocationLabel"),
              noAreaSelected: t("noAreaSelected"),
            }}
          />
        ) : (
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
            {/* Soft ground floor shadow */}
            <ellipse cx="80" cy="310" rx="46" ry="4.5" fill="rgba(0,0,0,0.05)" />

            {/* Proportional natural anatomical underlay silhouette */}
            <path
              d="M80 14 C70 14 67 21 67 31 C67 40 71 47 73 52 C73 54 71 58 71 66 L49 72 C41 74 38 80 37 90 L31 126 C30 134 26 148 24 162 C23 168 20 174 20 180 C20 186 24 188 27 186 C31 184 33 178 34 172 C37 158 41 144 43 134 L48 100 L54 164 C52 176 53 194 54 212 C55 220 54 226 55 232 C56 244 52 256 53 268 C54 280 57 288 58 296 L53 302 C52 304 54 306 58 306 L71 306 C74 306 74 303 72 298 C70 290 69 282 69 270 C69 258 73 246 73 234 C73 226 71 220 72 212 C73 194 75 178 76 168 C78 164 82 164 84 168 C85 178 87 194 88 212 C89 220 87 226 87 234 C87 246 91 258 91 270 C91 282 90 290 88 298 C86 303 86 306 89 306 L102 306 C106 306 108 304 107 302 L102 296 C103 288 106 280 107 268 C108 256 104 244 105 232 C106 226 105 220 106 212 C107 194 108 176 106 164 L112 100 L117 134 C119 144 123 158 126 172 C127 178 129 184 133 186 C136 188 140 186 140 180 C140 174 137 168 136 162 C134 148 130 134 129 126 L123 90 C122 80 119 74 112 72 L89 66 C89 58 87 54 87 52 C89 47 93 40 93 31 C93 21 90 14 80 14 Z"
              fill="#f4eee9"
              stroke="#e0d6cd"
              strokeWidth="2"
              opacity="0.5"
              pointerEvents="none"
            />

            {/* Head & Neck */}
            <path
              d="M80 14 C70 14 67 21 67 31 C67 40 71 47 73 52 C73 54 71 58 71 66 L89 66 C89 58 87 54 87 52 C89 47 93 40 93 31 C93 21 90 14 80 14 Z"
              className={`body-part ${isHeadSelected ? "selected" : ""} ${proposedRegions.includes("head") ? "proposed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionHead")}
              aria-pressed={isHeadSelected}
              onClick={() => toggleRegion("head")}
              onKeyDown={(e) => handleKey(e, "head")}
            />

            {view === "front" ? (
              <>
                {/* Front: Chest */}
                <path
                  d="M71 66 L49 72 C45 74 44 80 46 90 L50 114 L110 114 L114 90 C116 80 115 74 111 72 L89 66 Z"
                  className={`body-part ${isChestSelected ? "selected" : ""} ${proposedRegions.includes("chest") ? "proposed" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("regionChest")}
                  aria-pressed={isChestSelected}
                  onClick={() => toggleRegion("chest")}
                  onKeyDown={(e) => handleKey(e, "chest")}
                />
                {/* Front: Abdomen & Pelvis */}
                <path
                  d="M50 114 C48 124 51 132 53 140 C55 148 50 156 54 164 C56 168 62 168 76 168 C78 164 82 164 84 168 C98 168 104 168 106 164 C110 156 105 148 107 140 C109 132 112 124 110 114 Z"
                  className={`body-part ${isAbdomenSelected ? "selected" : ""} ${proposedRegions.includes("abdomen") ? "proposed" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("regionAbdomen")}
                  aria-pressed={isAbdomenSelected}
                  onClick={() => toggleRegion("abdomen")}
                  onKeyDown={(e) => handleKey(e, "abdomen")}
                />
              </>
            ) : (
              /* Back: Posterior Torso */
              <path
                d="M71 66 L49 72 C45 74 44 80 46 90 L50 114 C48 124 51 132 53 140 C55 148 50 156 54 164 C56 168 62 168 76 168 C78 164 82 164 84 168 C98 168 104 168 106 164 C110 156 105 148 107 140 C109 132 112 124 110 114 L114 90 C116 80 115 74 111 72 L89 66 Z"
                className={`body-part ${isBackSelected ? "selected" : ""} ${proposedRegions.includes("back") ? "proposed" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={t("regionBack")}
                aria-pressed={isBackSelected}
                onClick={() => toggleRegion("back")}
                onKeyDown={(e) => handleKey(e, "back")}
              />
            )}

            {/* Arms & Hands (Left & Right) */}
            <g
              className={`body-part ${isArmSelected ? "selected" : ""} ${proposedRegions.includes("arm") ? "proposed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionArms")}
              aria-pressed={isArmSelected}
              onClick={() => toggleRegion("arm")}
              onKeyDown={(e) => handleKey(e, "arm")}
            >
              {/* Left Arm */}
              <path d="M48 72 C41 74 38 80 37 90 L31 126 C30 134 26 148 24 162 C23 168 20 174 20 180 C20 186 24 188 27 186 C31 184 33 178 34 172 C37 158 41 144 43 134 L48 100 C49 92 48 82 48 72 Z" />
              {/* Right Arm */}
              <path d="M112 72 C119 74 122 80 123 90 L129 126 C130 134 134 148 136 162 C137 168 140 174 140 180 C140 186 136 188 133 186 C129 184 127 178 126 172 C123 158 119 144 117 134 L112 100 C111 92 112 82 112 72 Z" />
            </g>

            {/* Legs & Feet (Left & Right) */}
            <g
              className={`body-part ${isLegSelected ? "selected" : ""} ${proposedRegions.includes("leg") ? "proposed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionLegs")}
              aria-pressed={isLegSelected}
              onClick={() => toggleRegion("leg")}
              onKeyDown={(e) => handleKey(e, "leg")}
            >
              {/* Left Leg */}
              <path d="M54 164 C52 176 53 194 54 212 C55 220 54 226 55 232 C56 244 52 256 53 268 C54 280 57 288 58 296 L53 302 C52 304 54 306 58 306 L71 306 C74 306 74 303 72 298 C70 290 69 282 69 270 C69 258 73 246 73 234 C73 226 71 220 72 212 C73 194 75 178 76 168 Z" />
              {/* Right Leg */}
              <path d="M106 164 C108 176 107 194 106 212 C105 220 106 226 105 232 C104 244 108 256 107 268 C106 280 103 288 102 296 L107 302 C108 304 106 306 102 306 L89 306 C86 306 86 303 88 298 C90 290 91 282 91 270 C91 258 87 246 87 234 C87 226 89 220 88 212 C87 194 85 178 84 168 Z" />
            </g>

            {/* Region Checkmark Badges for all Selected Areas */}
            {isHeadSelected && (
              <g className="region-check-badge" transform="translate(80, 36)" pointerEvents="none">
                <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {view === "front" && isChestSelected && (
              <g className="region-check-badge" transform="translate(80, 92)" pointerEvents="none">
                <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {view === "front" && isAbdomenSelected && (
              <g className="region-check-badge" transform="translate(80, 140)" pointerEvents="none">
                <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {view === "back" && isBackSelected && (
              <g className="region-check-badge" transform="translate(80, 116)" pointerEvents="none">
                <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {isArmSelected && (
              <>
                <g className="region-check-badge" transform="translate(28, 142)" pointerEvents="none">
                  <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                  <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                <g className="region-check-badge" transform="translate(132, 142)" pointerEvents="none">
                  <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                  <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </>
            )}

            {isLegSelected && (
              <>
                <g className="region-check-badge" transform="translate(63, 238)" pointerEvents="none">
                  <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                  <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                <g className="region-check-badge" transform="translate(97, 238)" pointerEvents="none">
                  <circle r="8.5" fill="#0c8264" stroke="#ffffff" strokeWidth="1.8" />
                  <path d="M-3 0.5 L-0.8 2.8 L3.2 -2" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </>
            )}
          </svg>
        </div>
        )}

        <div className="body-region-list" role="group" aria-label="Body region selection list">
          {regions.map(([key, labelKey, fallback]) => {
            const isSelected = selectedRegions.includes(key);
            const isProposed = proposedRegions.includes(key);
            const subList = subregionsByRegion[key] || [];
            const activeSubs = selectedSubregions[key] || [];

            return (
              <div key={key} className="body-region-item-wrap">
                <button
                  type="button"
                  className={`body-region-choice ${isSelected ? "selected" : ""} ${isProposed ? "proposed" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => toggleRegion(key)}
                >
                  <span>{isSelected ? "✓" : isProposed ? "◌" : "○"}</span>
                  <span className="body-region-choice-label">{t(labelKey) || fallback}</span>
                  {isProposed && (
                    <span className="proposed-badge" aria-hidden="true">
                      {t("voiceProposedTag") || "(heard)"}
                    </span>
                  )}
                </button>

                {/* Subregions drawer for selected region */}
                {isSelected && subList.length > 0 && (
                  <div className="subregion-pills-list" role="group" aria-label={`Subregions for ${t(labelKey) || fallback}`}>
                    {subList.map(({ key: subKey, fallback: subFallback }) => {
                      const isSubSelected = activeSubs.includes(subKey);
                      return (
                        <button
                          type="button"
                          key={subKey}
                          className={`subregion-pill ${isSubSelected ? "active" : ""}`}
                          aria-pressed={isSubSelected}
                          onClick={() => toggleSubregion(key, subKey)}
                        >
                          {isSubSelected ? "✓ " : "+ "}
                          {t(subKey) || subFallback}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
