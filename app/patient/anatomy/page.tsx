"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BodyRegion, Severity } from "@/lib/patient-flow";
import type { TranslationKey } from "@/lib/i18n";
import { parseAnatomyVoice, getLocaleForLanguage } from "@/lib/anatomy-voice";
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
  const [selectedRegions, setSelectedRegions] = useState<BodyRegion[]>(
    workflow.region ? [workflow.region] : []
  );
  const [selectedSubregions, setSelectedSubregions] = useState<Record<string, string[]>>({});
  const [severity, setSeverity] = useState<Severity | null>(workflow.severity);
  const [view, setView] = useState<"front" | "back">(workflow.region === "back" ? "back" : "front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Voice proposed state (transient, NOT committed until explicit confirmation)
  const [proposedRegions, setProposedRegions] = useState<BodyRegion[]>([]);
  const [proposedSubregions, setProposedSubregions] = useState<Record<string, string[]>>({});
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
        // Reset silence timer on any speech event
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
          setProposedRegions(parsed.matchedRegions);
          setProposedSubregions(parsed.matchedSubregions);
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
    if (proposedRegions.length === 0) return;
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

    setProposedRegions([]);
    setProposedSubregions({});
    setVoiceFeedback("");
  }

  function discardProposed() {
    setProposedRegions([]);
    setProposedSubregions({});
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

      <div className="reference-subheading-row">
        <h2 className="reference-subheading">{t("selectAffectedArea") || "Select affected area(s)"}</h2>
        {speechSupported && (
          <button
            type="button"
            className={`anatomy-voice-trigger ${listening ? "live" : ""}`}
            onClick={toggleVoice}
            aria-label={listening ? (t("stopRecording") || "Stop recording") : (t("speakAffectedArea") || "Speak affected area")}
            aria-pressed={listening}
          >
            <span className="anatomy-mic-icon" aria-hidden="true">{listening ? "■" : "🎙"}</span>
            <span className="anatomy-mic-label">{listening ? (t("listening") || "Listening…") : (t("speakAffectedArea") || "Speak area")}</span>
          </button>
        )}
      </div>

      {/* Voice status announcement & feedback */}
      {listening && (
        <div className="voice-status-notice listening" role="status" aria-live="polite">
          <div className="voice-wave-mini" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <span>{t("voiceListeningArea") || "Listening… speak affected area (e.g. chest, stomach, back)"}</span>
        </div>
      )}

      {!listening && voiceFeedback && (
        <div className="voice-status-notice feedback" role="status" aria-live="polite">
          <span>{voiceFeedback}</span>
        </div>
      )}

      {/* Mandatory voice confirmation strip (Propose -> Confirm workflow) */}
      {proposedRegions.length > 0 && (
        <div className="voice-confirmation-strip" role="region" aria-live="polite">
          <div className="voice-confirmation-content">
            <span className="voice-heard-badge" aria-hidden="true">🎙</span>
            <p className="voice-heard-text">
              <b>{t("voiceHeardPrefix") || "We heard:"}</b>{" "}
              <span className="voice-heard-regions">
                {proposedRegions
                  .map((rk) => {
                    const tup = regions.find(([k]) => k === rk);
                    return tup ? (t(tup[1]) || tup[2]) : rk;
                  })
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
            {/* Natural anatomical silhouette background */}
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
              className={`body-part ${region === "head" || selectedRegions.includes("head") ? "selected" : ""} ${proposedRegions.includes("head") ? "proposed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionHead")}
              aria-pressed={region === "head" || selectedRegions.includes("head")}
              onClick={() => toggleRegion("head")}
              onKeyDown={(e) => handleKey(e, "head")}
            />

            {view === "front" ? (
              <>
                {/* Front: Chest */}
                <path
                  d="M54 66 Q80 60 106 66 L110 118 L50 118 Z"
                  className={`body-part ${region === "chest" || selectedRegions.includes("chest") ? "selected" : ""} ${proposedRegions.includes("chest") ? "proposed" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("regionChest")}
                  aria-pressed={region === "chest" || selectedRegions.includes("chest")}
                  onClick={() => toggleRegion("chest")}
                  onKeyDown={(e) => handleKey(e, "chest")}
                />
                {/* Front: Abdomen */}
                <path
                  d="M50 118 L110 118 L104 176 L56 176 Z"
                  className={`body-part ${region === "abdomen" || selectedRegions.includes("abdomen") ? "selected" : ""} ${proposedRegions.includes("abdomen") ? "proposed" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("regionAbdomen")}
                  aria-pressed={region === "abdomen" || selectedRegions.includes("abdomen")}
                  onClick={() => toggleRegion("abdomen")}
                  onKeyDown={(e) => handleKey(e, "abdomen")}
                />
              </>
            ) : (
              /* Back: Upper & Lower Back */
              <path
                d="M54 66 Q80 60 106 66 L110 176 L50 176 Z"
                className={`body-part ${region === "back" || selectedRegions.includes("back") ? "selected" : ""} ${proposedRegions.includes("back") ? "proposed" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={t("regionBack")}
                aria-pressed={region === "back" || selectedRegions.includes("back")}
                onClick={() => toggleRegion("back")}
                onKeyDown={(e) => handleKey(e, "back")}
              />
            )}

            {/* Arms: Left & Right */}
            <g
              className={`body-part ${region === "arm" || selectedRegions.includes("arm") ? "selected" : ""} ${proposedRegions.includes("arm") ? "proposed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionArms")}
              aria-pressed={region === "arm" || selectedRegions.includes("arm")}
              onClick={() => toggleRegion("arm")}
              onKeyDown={(e) => handleKey(e, "arm")}
            >
              <path d="M54 68 L24 130 L14 174 L28 178 L42 136 L54 88 Z" />
              <path d="M106 68 L136 130 L146 174 L132 178 L118 136 L106 88 Z" />
            </g>

            {/* Legs: Left & Right */}
            <g
              className={`body-part ${region === "leg" || selectedRegions.includes("leg") ? "selected" : ""} ${proposedRegions.includes("leg") ? "proposed" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("regionLegs")}
              aria-pressed={region === "leg" || selectedRegions.includes("leg")}
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
