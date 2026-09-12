"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { localizedAssistantName } from "@/lib/i18n";
import { usePatient } from "../PatientShell";

type Citation = {
  corpus: "MODERN_MEDICINE" | "AYURVEDA";
  title: string;
  source: string;
  section: string | null;
};

type Msg = {
  id: string;
  role: "PATIENT" | "ASSISTANT";
  content: string;
  citations?: Citation[];
  safety?: Array<{ summary: string }>;
};

type ChatDraft = {
  text: string;
  mutationId: string;
};

export default function Assistant() {
  const router = useRouter();
  const { workflow, t, saveDraft, loadDraft, clearDraft, ensureSynced, connection } = usePatient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [draftMutationId, setDraftMutationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const discard = useRef(false);

  const assistantName = localizedAssistantName(workflow.language);

  async function load() {
    try {
      const r = await fetch("/api/patient/assistant/chat", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages ?? []);
      }
    } catch {
      setNote(
        t("offlineNotice") ||
          `Offline — your typed draft is preserved, but chat history with ${assistantName} requires a connection.`
      );
    }
  }

  useEffect(() => {
    void load();
    void loadDraft<ChatDraft | string>("medi-chat-draft").then((d) => {
      if (typeof d === "string") {
        setDraft(d);
        setDraftMutationId(crypto.randomUUID());
      } else if (d) {
        setDraft(d.text);
        setDraftMutationId(d.mutationId);
      } else {
        setDraftMutationId(crypto.randomUUID());
      }
    });

    return () => {
      discard.current = true;
      abort.current?.abort();
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (draft && draftMutationId) {
      void saveDraft("medi-chat-draft", { text: draft, mutationId: draftMutationId });
    }
  }, [draft, draftMutationId, saveDraft]);

  async function speakReply(msg: Msg) {
    if (speaking === msg.id) {
      audio.current?.pause();
      setSpeaking(null);
      return;
    }
    setNote("");
    setSpeaking(msg.id);

    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: msg.content.slice(0, 2500),
          language: workflow.language,
        }),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { audioBase64: string; contentType: string };
      const bytes = Uint8Array.from(atob(d.audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: d.contentType }));
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(null);
      };
      a.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(null);
        setNote(t("voiceError"));
      };
      await a.play();
    } catch {
      setSpeaking(null);
      setNote(t("voiceError"));
    }
  }

  async function send(text: string, voiceOrigin = false) {
    const message = text.trim();
    if (!message || busy) return;

    const clientMutationId = voiceOrigin
      ? crypto.randomUUID()
      : draftMutationId || crypto.randomUUID();

    if (!(await ensureSynced())) {
      setNote(
        t("reconnectBeforeSubmit") ||
          "Reconnect before sending this message. Your typed draft is encrypted and preserved on this device."
      );
      return;
    }

    setBusy(true);
    setNote("");

    try {
      const r = await fetch("/api/patient/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, clientMutationId }),
      });

      if (!r.ok) throw new Error();
      const d = (await r.json()) as {
        reply: string;
        citations: Citation[];
        safety: Array<{ summary: string }>;
      };

      if (!voiceOrigin) {
        setDraft("");
        setDraftMutationId(crypto.randomUUID());
        await clearDraft("medi-chat-draft");
      }

      await load();

      if (voiceOrigin) {
        setTimeout(
          () =>
            void speakReply({
              id: `voice-${Date.now()}`,
              role: "ASSISTANT",
              content: d.reply,
              citations: d.citations,
              safety: d.safety,
            }),
          50
        );
      }
    } catch {
      setNote(t("assistantUnavailable") || "Anaya is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }

    if (connection === "offline" || !(await ensureSynced())) {
      setNote(
        t("voiceOfflineNotice") ||
          "Voice chat requires a connection. You can type a draft now and send it after reconnecting."
      );
      return;
    }

    if (!window.MediaRecorder) {
      setNote(t("voiceError"));
      return;
    }

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
        s.getTracks().forEach((x) => x.stop());
        rec.current = null;
        stream.current = null;
        setListening(false);
        if (discard.current) return;

        try {
          setNote(t("processing"));
          abort.current = new AbortController();
          const fd = new FormData();
          fd.append("audio", new Blob(chunks, { type: m.mimeType || "audio/webm" }), "anaya.webm");
          fd.append("language", workflow.language);

          const r = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: fd,
            signal: abort.current.signal,
          });

          if (!r.ok) throw new Error();
          const d = (await r.json()) as { transcript: string };
          setNote("");
          if (d.transcript.trim()) {
            await send(d.transcript, true);
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setNote(t("voiceError"));
          }
        }
      };

      m.start();
      setListening(true);
      setTimeout(() => {
        if (m.state !== "inactive") m.stop();
      }, 30000);
    } catch {
      setNote(t("voiceError"));
    }
  }

  return (
    <section className="assistant-page reference-assistant-page" aria-labelledby="anaya-title">
      <header className="assistant-header reference-assistant-header">
        <button className="secondary" onClick={() => router.back()}>
          ← {t("back")}
        </button>
        <span className="assistant-avatar reference-female-avatar" aria-hidden="true">
          👩‍⚕️
        </span>
        <div>
          <p className="eyebrow" style={{ margin: "0 0 3px" }}>
            {assistantName} · Female voice health assistant
          </p>
          <h1 id="anaya-title" style={{ margin: 0 }}>
            {t("assistantTitle")}
          </h1>
          <p style={{ margin: 0, color: "#557069" }}>
            Voice and chat support · general information only · not a diagnosis
          </p>
        </div>
      </header>

      <ol className="assistant-thread" aria-live="polite">
        {messages.length === 0 && (
          <li className="assistant-welcome-card">
            <span className="medi-mini-avatar">👩‍⚕️</span>
            <div>
              <b>{t("assistantWelcomeGreeting") || `Namaste! I’m ${assistantName}, your health assistant.`}</b>
              <p>
                {t("assistantWelcomeDesc") ||
                  "I can help you describe symptoms and explain general health information. I cannot diagnose or prescribe."}
              </p>
            </div>
          </li>
        )}

        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.role === "ASSISTANT" ? "assistant" : "patient"}`}>
            <div className="bubble">
              <p style={{ margin: 0 }}>{m.content}</p>
              {m.safety?.[0] && <p className="urgent-box">{m.safety[0].summary}</p>}
              {m.citations?.map((c, i) => (
                <p key={i} className="citation">
                  <b>{c.corpus === "AYURVEDA" ? "Ayurveda" : "Modern Medicine"}</b> · {c.title}
                </p>
              ))}
              {m.role === "ASSISTANT" && (
                <button
                  className="secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => void speakReply(m)}
                >
                  {speaking === m.id ? `■ ${t("stop")}` : `🔊 ${t("speak")}`}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <button
          type="button"
          className={`mic-button ${listening ? "live" : ""}`}
          onClick={() => void toggleMic()}
        >
          {listening ? "■" : "🎙️"}
          <span className="sr-only">{listening ? t("stop") : t("listen")}</span>
        </button>
        <input
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("assistantHint")}
          aria-label={t("assistantComposerAria") || `Message ${assistantName}`}
        />
        <button className="primary" disabled={busy || !draft.trim()}>
          {busy ? t("processing") : t("send")}
        </button>
      </form>

      {note && (
        <p role="status" className="system-banner warning">
          {note}
        </p>
      )}
    </section>
  );
}
