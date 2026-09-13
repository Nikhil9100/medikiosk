"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUESTIONS, nextQuestion, stateForYesNo } from "@/lib/interview-engine";
import { interviewLabel } from "@/lib/interview-localization";
import type { InterviewFact, InterviewState } from "@/lib/patient-flow";
import { usePatient } from "../PatientShell";
import EmergencyModal from "@/components/ui/EmergencyModal";
import ConfirmationCard from "@/components/ui/ConfirmationCard";

export default function Interview() {
  const router = useRouter();
  const {
    workflow,
    setWorkflow,
    sync,
    t,
    saveDraft,
    loadDraft,
    clearDraft,
  } = usePatient();

  const [facts, setFacts] = useState(workflow.interviewFacts);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    transcript: string;
    state: InterviewState;
  } | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const discard = useRef(false);

  const q = nextQuestion(facts);

  useEffect(() => {
    void loadDraft<string>("interview-answer-draft").then((d) => {
      if (d) setValue(d);
    });
    return () => {
      discard.current = true;
      abort.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
      stream.current?.getTracks().forEach((trk) => trk.stop());
      audio.current?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (value) void saveDraft("interview-answer-draft", value);
  }, [value, saveDraft]);

  async function save(
    state: InterviewState,
    raw?: string,
    prov: "PATIENT" | "VOICE" | "TOUCH" = "PATIENT"
  ) {
    if (!q || busy) return;

    // Red flag safety check
    if (q.redFlag && (state === "KNOWN" || (raw && raw.toLowerCase().includes("yes")))) {
      setEmergencyReason(interviewLabel(q.id, workflow.language, q.label));
      setShowEmergency(true);
    }

    setBusy(true);
    setError("");

    const fact: InterviewFact = {
      questionId: q.id,
      value: raw?.trim() || undefined,
      state,
      provenance: prov,
    };

    const ok = await sync({
      interviewData: { [q.id]: fact },
      workflowStep: "interview",
    });

    if (ok) {
      const next = { ...facts, [q.id]: fact };
      setFacts(next);
      setWorkflow((w) => ({ ...w, interviewFacts: next }));
      setValue("");
      setPendingConfirmation(null);
      await clearDraft("interview-answer-draft");
    } else {
      setError(t("networkError") || "Could not save this answer. Please retry.");
    }
    setBusy(false);
  }

  async function finish() {
    if (await sync({ workflowStep: "documents" })) {
      router.push("/patient/documents");
    }
  }

  async function voice() {
    if (!q) return;
    if (rec.current && rec.current.state !== "inactive") {
      rec.current.stop();
      return;
    }

    setPendingConfirmation(null);

    try {
      discard.current = false;
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const m = new MediaRecorder(s);
      rec.current = m;
      const chunks: Blob[] = [];

      m.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };

      m.onstop = async () => {
        if (timeout.current) clearTimeout(timeout.current);
        s.getTracks().forEach((x) => x.stop());
        rec.current = null;
        stream.current = null;
        setRecording(false);
        if (discard.current) return;

        try {
          abort.current = new AbortController();
          const fd = new FormData();
          fd.append("audio", new Blob(chunks, { type: m.mimeType || "audio/webm" }), "answer.webm");
          fd.append("language", workflow.language);

          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: fd,
            signal: abort.current.signal,
          });

          if (!res.ok) throw new Error();
          const d = (await res.json()) as { transcript: string };

          if (q.type === "yes_no") {
            const inferredState = stateForYesNo(d.transcript);
            setPendingConfirmation({
              transcript: d.transcript,
              state: inferredState,
            });
          } else {
            setValue(d.transcript);
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setError(t("voiceError"));
          }
        }
      };

      m.start();
      setRecording(true);
      timeout.current = setTimeout(() => {
        if (m.state !== "inactive") m.stop();
      }, 30000);
    } catch {
      setError(t("voiceError"));
    }
  }

  async function speakQuestion() {
    if (!q || speaking) return;
    setSpeaking(true);

    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: interviewLabel(q.id, workflow.language, q.label),
          language: workflow.language,
        }),
      });

      if (!res.ok) throw new Error();
      const d = (await res.json()) as { audioBase64: string; contentType: string };
      const bytes = Uint8Array.from(atob(d.audioBase64), (x) => x.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: d.contentType }));
      const a = new Audio(url);
      audio.current = a;

      a.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };

      a.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        setError(t("voiceError"));
      };

      await a.play();
    } catch {
      setSpeaking(false);
      setError(t("voiceError"));
    }
  }

  if (!q) {
    return (
      <section className="flow-card reference-card interview-reference-card">
        <div className="medi-interview-heading">
          <span className="medi-large-avatar" aria-hidden="true">👩‍⚕️</span>
          <div>
            <p className="eyebrow">{t("interviewEyebrow") || "Visit Preparation"}</p>
            <h1>{t("interviewCompleteHeading") || "All Questions Answered!"}</h1>
          </div>
        </div>
        <p className="lead">
          {t("interviewCompleteLead") || "Thank you. Your answers will help the doctor prepare before your consultation."}
        </p>
        <div className="actions">
          <button className="primary reference-primary" onClick={() => void finish()}>
            {t("continue") || "Continue to Documents"} →
          </button>
        </div>
      </section>
    );
  }

  const n = QUESTIONS.findIndex((x) => x.id === q.id) + 1;
  const label = interviewLabel(q.id, workflow.language, q.label);

  return (
    <section className="flow-card reference-card interview-reference-card">
      <div className="medi-interview-heading">
        <span className="medi-large-avatar" aria-hidden="true">👩‍⚕️</span>
        <div>
          <p className="eyebrow">
            Question {n} of {QUESTIONS.length}
          </p>
          <h1>I&apos;ll ask you a few quick questions.</h1>

        </div>
      </div>

      <div className="panel interview-question-panel">
        <small className="interview-domain-tag">{q.domain.replaceAll("_", " ")}</small>
        <h2 className="interview-current-question">{label}</h2>

        <div className="interview-audio-controls">
          <button
            type="button"
            className="secondary interview-speak-btn"
            disabled={speaking}
            onClick={() => void speakQuestion()}
            aria-label="Read question aloud with audio"
          >
            {speaking ? "🔊 Playing…" : "🔊 Read aloud"}
          </button>
        </div>

        {/* Why am I asking this? contextual drawer */}
        <div className="interview-why-block">
          <button
            type="button"
            className="interview-why-toggle"
            onClick={() => setWhyOpen(!whyOpen)}
            aria-expanded={whyOpen}
          >
            <span>💡 Why am I asking this?</span>
            <span aria-hidden="true">{whyOpen ? "▲" : "▼"}</span>
          </button>
          {whyOpen && (
            <div className="interview-why-details">
              This helps the healthcare team understand how your symptoms have changed over time and identify any safety concerns.
            </div>
          )}
        </div>

        {q.redFlag && (
          <p className="helper red-flag-helper">
            ⚠️ {t("redFlagNotice") || "This question helps identify if urgent care is required."}
          </p>
        )}
      </div>

      {/* Voice Confirmation Card */}
      {pendingConfirmation && (
        <div style={{ margin: "14px 0" }}>
          <ConfirmationCard
            source="From microphone"
            title="I heard:"
            value={pendingConfirmation.transcript}
            question="Is this what you meant?"
            confirmLabel="✓ THAT'S CORRECT"
            editLabel="✎ EDIT"
            onConfirm={() =>
              void save(pendingConfirmation.state, pendingConfirmation.transcript, "VOICE")
            }
            onEdit={() => {
              setValue(pendingConfirmation.transcript);
              setPendingConfirmation(null);
            }}
            onRetry={() => void voice()}
          />
        </div>
      )}

      {q.type === "yes_no" ? (
        <>
          <div className="choice-grid interview-choices-grid">
            <button
              type="button"
              className="choice interview-choice-btn"
              onClick={() => void save("KNOWN", "yes", "TOUCH")}
            >
              ✓ {t("yes") || "Yes"}
            </button>
            <button
              type="button"
              className="choice interview-choice-btn"
              onClick={() => void save("DENIED", "no", "TOUCH")}
            >
              ✕ {t("no") || "No"}
            </button>
            <button
              type="button"
              className="choice interview-choice-btn uncertainty"
              onClick={() => void save("UNKNOWN", undefined, "TOUCH")}
            >
              ❓ {t("unknown") || "I'm not sure"}
            </button>
            <button
              type="button"
              className="choice interview-choice-btn tell-doctor"
              onClick={() => void save("DECLINED", undefined, "TOUCH")}
            >
              💬 {t("decline") || "I'll tell the doctor"}
            </button>
          </div>

          <div className="voice-mic-bar">
            <button
              type="button"
              className={`mic-button ${recording ? "live" : ""}`}
              onClick={() => void voice()}
              aria-label={recording ? "Stop listening" : "Tap to speak your answer"}
            >
              {recording ? "■ Stop speaking" : "🎙️ Tap to speak your answer"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="answer">{t("yourAnswer") || "Your answer:"}</label>
            <textarea
              id="answer"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Speak or type your answer here…"
            />
          </div>

          <div className="actions interview-actions-row">
            <button
              type="button"
              className={`mic-button ${recording ? "live" : ""}`}
              onClick={() => void voice()}
            >
              {recording ? "■ Stop" : "🎙️ Speak"}
            </button>
            <button
              type="button"
              className="primary reference-primary"
              disabled={!value.trim() || busy}
              onClick={() => void save("KNOWN", value, "PATIENT")}
            >
              {t("saveAnswer") || "Save answer"} →
            </button>
          </div>

          <div className="uncertainty-answers-row">
            <button
              type="button"
              className="secondary uncertainty-chip"
              onClick={() => void save("UNKNOWN")}
            >
              ❓ I&apos;m not sure
            </button>
            <button
              type="button"
              className="secondary uncertainty-chip"
              onClick={() => void save("DECLINED")}
            >
              💬 I&apos;ll tell the doctor
            </button>
          </div>

        </>
      )}

      {error && (
        <div className="system-banner error" role="alert">
          {error}
        </div>
      )}

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={showEmergency}
        symptomReason={emergencyReason}
        onGetHelp={() => {}}
        onAcknowledge={() => setShowEmergency(false)}
      />
    </section>
  );
}
