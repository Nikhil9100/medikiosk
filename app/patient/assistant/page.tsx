"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "@/app/patient/PatientShell";

type AssistantCitation = {
  corpus: "MODERN_MEDICINE" | "AYURVEDA";
  title: string;
  section: string;
  source: string;
};

type AssistantMessage = {
  id: string;
  role: "patient" | "assistant";
  content: string;
  intent?: string;
  citations?: AssistantCitation[];
  safety?: { type: string; summary: string }[];
};

type ChatState = {
  messages: AssistantMessage[];
  loading: boolean;
  error: string | null;
};

export default function AssistantPage() {
  const router = useRouter();
  const { workflow, t } = usePatientWorkflow();
  const language = workflow.language;
  const [chat, setChat] = useState<ChatState>({ messages: [], loading: true, error: null });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/patient/assistant/chat", { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setChat({ messages: [], loading: false, error: "session" });
          return;
        }
        if (!res.ok) throw new Error(`chat ${res.status}`);
        // Persisted rows use the canonical uppercase roles; the UI model is lowercase.
        const data = (await res.json()) as {
          messages: { id: string; role: string; content: string; intent?: string; citations?: AssistantCitation[]; safety?: { type: string; summary: string }[] }[];
        };
        if (!cancelled) setChat({
          messages: data.messages.map((m) => ({ ...m, role: m.role === "ASSISTANT" ? "assistant" : "patient" })),
          loading: false,
          error: null,
        });
      } catch {
        if (!cancelled) setChat({ messages: [], loading: false, error: "network" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || message.length > 2000 || sending) return;
    setSending(true);
    setVoiceNote(null);
    const optimisticId = `pending-${Date.now()}`;
    setChat((current) => ({
      ...current,
      loading: false,
      messages: [...current.messages, { id: optimisticId, role: "patient", content: message }],
    }));
    try {
      const res = await fetch("/api/patient/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(`assistant ${res.status}`);
      const data = (await res.json()) as { reply: string; intent: string; citations: AssistantCitation[]; safety: { type: string; summary: string }[] };
      setChat((current) => ({
        ...current,
        error: null,
        messages: [
          ...current.messages.filter((m) => m.id !== optimisticId),
          { id: `assistant-${Date.now()}`, role: "assistant", content: data.reply, intent: data.intent, citations: data.citations, safety: data.safety },
        ],
      }));
    } catch {
      setChat((current) => ({ ...current, error: "network", messages: current.messages.filter((m) => m.id !== optimisticId) }));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function toggleListening() {
    if (listening) {
      recorderRef.current?.stop();
      setListening(false);
      return;
    }
    const MediaRecorderCtor = window.MediaRecorder;
    if (!MediaRecorderCtor) {
      setVoiceNote(t("voiceError"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorderCtor(stream);
      const parts: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) parts.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        const blob = new Blob(parts, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        try {
          const form = new FormData();
          form.append("audio", blob, "speech.webm");
          form.append("language", language);
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          if (!res.ok) throw new Error(`transcribe ${res.status}`);
          const data = (await res.json()) as { text: string };
          if (data.text.trim()) await send(data.text);
        } catch {
          setVoiceNote(t("voiceError"));
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      setVoiceNote(t("voiceMicrophoneDenied"));
    }
  }

  const speakReply = useCallback(
    async (message: AssistantMessage) => {
      if (speakingId === message.id) {
        audioRef.current?.pause();
        audioRef.current = null;
        setSpeakingId(null);
        return;
      }
      setVoiceNote(null);
      setSpeakingId(message.id);
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message.content.slice(0, 2500), language }),
        });
        if (!res.ok) throw new Error(`speak ${res.status}`);
        const data = (await res.json()) as { audioBase64: string; contentType: string };
        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: data.contentType })));
        audioRef.current = audio;
        audio.onended = () => setSpeakingId((current) => (current === message.id ? null : current));
        await audio.play();
      } catch {
        setVoiceNote(t("voiceError"));
        setSpeakingId(null);
      }
    },
    [language, speakingId, t]
  );

  if (chat.error === "session") {
    return (
      <div className="assistant-page">
        <p className="assistant-state">{t("errorDescription")}</p>
        <button type="button" className="primary-button primary-button--compact" onClick={() => router.push("/patient")}>
          {t("consentBack")}
        </button>
      </div>
    );
  }

  return (
    <div className="assistant-page">
      <div className="assistant-header">
        <button type="button" className="assistant-back" onClick={() => router.push("/patient")}>
          <span aria-hidden="true">←</span> {t("consentBack")}
        </button>
        <div className="assistant-header__identity">
          <span className="assistant-avatar" aria-hidden="true">M</span>
          <div>
            <h1>{t("assistantTitle")}</h1>
            <p>{t("assistantHint")}</p>
          </div>
        </div>
      </div>

      <ol className="assistant-thread" ref={listRef} aria-live="polite">
        {chat.loading && (
          <li className="assistant-state" role="status">{t("loading")}</li>
        )}
        {!chat.loading && chat.messages.length === 0 && (
          <li className="assistant-empty">{t("assistantHint")}</li>
        )}
        {chat.messages.map((message) => (
          <li key={message.id} className={`assistant-message assistant-message--${message.role}`}>
            <div className="assistant-bubble">
              <p>{message.content}</p>
              {message.role === "assistant" && message.safety && message.safety.length > 0 && (
                <p className="assistant-safety" role="alert">{message.safety[0].summary}</p>
              )}
              {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                <ul className="assistant-citations">
                  {message.citations.map((citation) => (
                    <li key={`${citation.corpus}-${citation.title}`} title={citation.source}>
                      <span className={`assistant-citations__corpus assistant-citations__corpus--${citation.corpus === "AYURVEDA" ? "ayurveda" : "modern"}`}>
                        {citation.corpus === "AYURVEDA" ? "AYU" : "MED"}
                      </span>
                      {citation.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {message.role === "assistant" && (
              <button type="button" className="assistant-speak" aria-pressed={speakingId === message.id} onClick={() => void speakReply(message)}>
                <span aria-hidden="true">{speakingId === message.id ? "■" : "🔊"}</span>
                {t("voiceListen")}
              </button>
            )}
          </li>
        ))}
        {chat.error === "network" && (
          <li className="assistant-error" role="alert">{t("errorDescription")}</li>
        )}
      </ol>

      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <button type="button" className={`assistant-mic ${listening ? "assistant-mic--active" : ""}`} aria-pressed={listening} aria-label={t("voiceListen")} onClick={() => void toggleListening()}>
          <span aria-hidden="true">🎤</span>
        </button>
        <input
          ref={inputRef}
          className="assistant-input"
          type="text"
          value={draft}
          maxLength={2000}
          disabled={chat.loading}
          placeholder={t("assistantHint")}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={t("assistantTitle")}
        />
        <button type="submit" className="primary-button primary-button--compact" disabled={chat.loading || sending || draft.trim().length === 0}>
          {sending ? t("loading") : t("assistantSend")}
        </button>
      </form>
      {voiceNote && <p className="assistant-voice-note" role="status">{voiceNote}</p>}
    </div>
  );
}
