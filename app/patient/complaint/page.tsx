"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatient } from "../PatientShell";
import EmergencyModal from "@/components/ui/EmergencyModal";
import ConfirmationCard from "@/components/ui/ConfirmationCard";

const quickConcerns = [
  { label: "Chest pain", icon: "❤️", redFlag: true },
  { label: "Fever", icon: "🌡️", redFlag: false },
  { label: "Cough", icon: "💨", redFlag: false },
  { label: "Stomach pain", icon: "🫃", redFlag: false },
  { label: "Headache", icon: "🧠", redFlag: false },
  { label: "Injury", icon: "🩹", redFlag: false },
  { label: "Something else", icon: "💬", redFlag: false },
];

const redFlagKeywords = [
  "chest pain",
  "heart attack",
  "difficulty breathing",
  "cannot breathe",
  "can't breathe",
  "severe bleeding",
  "stroke",
  "unconscious",
  "paralysis",
];

export default function Complaint() {
  const router = useRouter();
  const {
    workflow,
    setWorkflow,
    sync,
    mutate,
    t,
    saveDraft,
    loadDraft,
    clearDraft,
  } = usePatient();

  const [text, setText] = useState(workflow.complaint);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const discard = useRef(false);

  function checkRedFlag(input: string): boolean {
    const lower = input.toLowerCase();
    for (const kw of redFlagKeywords) {
      if (lower.includes(kw)) {
        setEmergencyReason(`Mentioned: "${kw}"`);
        setShowEmergency(true);
        return true;
      }
    }
    return false;
  }

  function cleanup() {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null;
    rec.current = null;
    setRecording(false);
  }

  useEffect(() => {
    void loadDraft<{ text: string }>("complaint-draft").then((d) => {
      if (d && !workflow.complaint) setText(d.text ?? "");
    });
    return () => {
      discard.current = true;
      abort.current?.abort();
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (text) void saveDraft("complaint-draft", { text });
  }, [text, saveDraft]);

  async function toggle() {
    if (recording) {
      rec.current?.stop();
      return;
    }
    setVoice("");
    setPendingConfirmation(null);
    discard.current = false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const m = new MediaRecorder(s);
      rec.current = m;
      const chunks: Blob[] = [];

      m.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };

      m.onstop = async () => {
        cleanup();
        if (discard.current) return;
        const blob = new Blob(chunks, { type: m.mimeType || "audio/webm" });
        if (!blob.size) return;

        try {
          setVoice("Understanding what you said…");
          abort.current = new AbortController();
          const fd = new FormData();
          fd.append("audio", blob, "complaint.webm");
          fd.append("language", workflow.language);

          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: fd,
            signal: abort.current.signal,
          });
          if (!res.ok) throw new Error();
          const d = (await res.json()) as { transcript: string };
          setVoice("");
          if (d.transcript && d.transcript.trim()) {
            setPendingConfirmation(d.transcript.trim());
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setVoice(
              t("voiceUnavailableTyping") ||
                "Voice needs a connection. Your typed draft remains encrypted and saved on this device."
            );
          }
        }
      };

      m.start();
      setRecording(true);
      timeout.current = setTimeout(() => {
        if (m.state !== "inactive") m.stop();
      }, 30000);
    } catch {
      cleanup();
      setVoice(t("voiceError"));
    }
  }

  function handleVoiceConfirm() {
    if (pendingConfirmation) {
      setText(pendingConfirmation);
      checkRedFlag(pendingConfirmation);
      setPendingConfirmation(null);
    }
  }

  function handleVoiceEdit() {
    if (pendingConfirmation) {
      setText(pendingConfirmation);
      setPendingConfirmation(null);
    }
  }

  function selectQuickConcern(item: typeof quickConcerns[0]) {
    if (item.label === "Something else") {
      setText("");
      return;
    }
    setText(item.label);
    if (item.redFlag) {
      setEmergencyReason(item.label);
      setShowEmergency(true);
    }
  }

  async function next() {
    const value = text.trim();
    if (!value || saving) return;

    if (checkRedFlag(value)) {
      return;
    }

    setSaving(true);

    const mutationId = crypto.randomUUID();
    const res = await mutate(
      "/api/patient/complaints",
      "POST",
      { complaintText: value, severity: null, primary: true },
      mutationId
    );

    if (!res.ok) {
      setVoice(t("networkError") || "Could not save this concern. Please retry.");
      setSaving(false);
      return;
    }

    const ok = await sync({ complaintText: value, workflowStep: "anatomy" });
    if (ok) {
      setWorkflow((w) => ({ ...w, complaint: value, currentStep: "anatomy" }));
      await clearDraft("complaint-draft");
      router.push("/patient/anatomy");
      return;
    }
    setSaving(false);
  }

  return (
    <section className="flow-card reference-card complaint-reference-card">
      <div className="reference-step-dots" aria-hidden="true">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span className="active">4</span>
        <span>5</span>
      </div>

      <p className="eyebrow">4 · What brings you here?</p>
      <h1>What brings you to the hospital today?</h1>
      <p className="lead">
        Choose a quick option below, tap the microphone to speak, or type in your own words.
      </p>

      {/* Quick selection options */}
      <div className="quick-concerns-grid" role="group" aria-label="Common reasons for visit">
        {quickConcerns.map((item) => (
          <button
            type="button"
            key={item.label}
            className={`quick-concern-chip ${text === item.label ? "active" : ""}`}
            onClick={() => selectQuickConcern(item)}
            aria-pressed={text === item.label}
          >
            <span className="concern-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Voice Capture Block */}
      <div className="voice-capture-block">
        <div className="voice-wave" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <button
          className={`reference-mic ${recording ? "live" : ""}`}
          type="button"
          onClick={() => void toggle()}
          aria-label={recording ? t("stopRecording") : t("speakConcern")}
        >
          {recording ? "■" : "🎙"}
        </button>
        <div className="voice-wave mirror" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <strong>{recording ? "Listening… speak clearly now" : "Tap the microphone to speak"}</strong>
      </div>

      {/* Clinical confirmation card for spoken input */}
      {pendingConfirmation && (
        <div style={{ margin: "16px 0" }}>
          <ConfirmationCard
            source="From microphone"
            title="I heard:"
            value={pendingConfirmation}
            question="Is this what you wanted to say?"
            confirmLabel="✓ THAT'S CORRECT"
            editLabel="✎ EDIT"
            onConfirm={handleVoiceConfirm}
            onEdit={handleVoiceEdit}
            onRetry={() => void toggle()}
          />
        </div>
      )}

      {/* Text Area */}
      <div className="field reference-textarea">
        <label htmlFor="chief" className="field-sublabel">
          Or write details in your own words:
        </label>
        <textarea
          id="chief"
          maxLength={1000}
          value={text}
          placeholder="For example: I have chest tightness that started this morning after walking..."
          onChange={(e) => setText(e.target.value)}
        />
        <span className="character-counter">{text.length}/1000</span>
      </div>

      {voice && (
        <p role="status" className="helper centered-helper">
          {voice}
        </p>
      )}

      <div className="medi-helper-card">
        <span className="medi-mini-avatar">👩‍⚕️</span>
        <p>
          <b>Medi is here to help</b>
          <small>
            You can describe your symptoms in any language. Your doctor will see this exact description.
          </small>
        </p>
      </div>

      <div className="reference-actions">
        <button
          className="primary reference-primary"
          disabled={!text.trim() || saving}
          onClick={() => void next()}
        >
          {saving ? t("processing") : "Continue →"}
        </button>
      </div>

      {/* Emergency safety modal */}
      <EmergencyModal
        isOpen={showEmergency}
        symptomReason={emergencyReason}
        onGetHelp={() => {
          // Alert staff action
        }}
        onAcknowledge={() => {
          setShowEmergency(false);
        }}
      />
    </section>
  );
}
