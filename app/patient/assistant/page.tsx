"use client";

import Image from "next/image";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [restartModalOpen, setRestartModalOpen] = useState(false);

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const discard = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLOListElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const assistantName = localizedAssistantName(workflow.language);

  const handleScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceToBottom < 90;
    isNearBottomRef.current = near;
    if (near) {
      setShowScrollBottom(false);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setShowScrollBottom(false);
    isNearBottomRef.current = true;
  };

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
      stream.current?.getTracks().forEach((trk) => trk.stop());
      audio.current?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(messages.length <= 2 ? "auto" : "smooth");
    } else if (messages.length > 0) {
      setShowScrollBottom(true);
    }
  }, [messages, busy]);

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

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setNote(
        t("offlineNotice") ||
          "Offline — your typed draft is preserved on this device. Please reconnect to chat with Anaya."
      );
      return;
    }

    const synced = await ensureSynced();
    if (!synced && typeof navigator !== "undefined" && !navigator.onLine) {
      setNote(
        t("reconnectBeforeSubmit") ||
          "Reconnect before sending this message. Your typed draft is encrypted and preserved on this device."
      );
      return;
    }

    const clientMutationId = voiceOrigin
      ? crypto.randomUUID()
      : draftMutationId || crypto.randomUUID();

    setBusy(true);
    setNote("");
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setTimeout(() => scrollToBottom("smooth"), 30);

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

  async function handleRestartChat() {
    setRestartModalOpen(false);
    audio.current?.pause();
    setSpeaking(null);
    setBusy(true);
    try {
      const r = await fetch("/api/patient/assistant/chat", { method: "DELETE" });
      if (r.ok) {
        setMessages([]);
        setDraft("");
        setDraftMutationId(crypto.randomUUID());
        await clearDraft("medi-chat-draft");
        setNote(t("anayaRestartSuccess") || "Conversation restarted.");
        setTimeout(() => setNote(""), 3500);
      } else {
        throw new Error();
      }
    } catch {
      setNote("Unable to restart conversation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
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
        s.getTracks().forEach((trk) => trk.stop());
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

  // Step context helper
  const step = workflow.currentStep;
  const showStepContext = step === "anatomy" || step === "interview" || step === "documents" || step === "complete" || step === "symptoms" || step === "complaint";

  return (
    <section className="assistant-page reference-assistant-page" aria-labelledby="anaya-title" style={{ position: "relative" }}>
      <header className="assistant-header reference-assistant-header">
        <div className="assistant-header-main">
          <button className="secondary anaya-back-btn" onClick={() => router.back()} aria-label="Go back">
            ← {t("back")}
          </button>
          <span className="assistant-avatar reference-female-avatar" aria-hidden="true">
            <Image src="/anaya-avatar.png" alt="" width={40} height={40} style={{borderRadius:"50%",objectFit:"cover",display:"block"}} />
          </span>
          <div className="assistant-header-meta">
            <h1 id="anaya-title" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#0f3e34", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>{assistantName}</span>
              <span className="assistant-status-dot" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981", flex: "none" }} title="Online" aria-hidden="true" />
            </h1>
            <p className="anaya-header-sub" style={{ margin: "2px 0 0", color: "#557069", fontSize: "0.78rem" }} title={t("anayaHeaderEyebrow") || "Female voice health assistant"}>
              {t("anayaHeaderSub") || "Voice and chat support · general information only"}
            </p>
          </div>
        </div>

        <div className="anaya-header-actions">
          <button
            type="button"
            className="secondary anaya-menu-trigger"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            ☰ {t("anayaMainMenu")}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              className="secondary anaya-restart-trigger"
              onClick={() => setRestartModalOpen(true)}
              title={t("anayaRestartTitle")}
              aria-label={t("anayaRestartTitle") || "Restart conversation"}
            >
              🔄 <span className="anaya-restart-text">{t("anayaMenuRestartChat")}</span>
            </button>
          )}
        </div>
      </header>

      <ol ref={threadRef} onScroll={handleScroll} className="assistant-thread" aria-live="polite">
        {messages.length === 0 ? (
          <li className="anaya-starter-container">
            <div className="assistant-welcome-card reference-welcome-hero">
              <span className="medi-mini-avatar" aria-hidden="true"><Image src="/anaya-avatar.png" alt="" width={48} height={48} style={{borderRadius:"50%",objectFit:"cover",display:"block"}} /></span>
              <div>
                <b style={{ fontSize: "1.02rem", color: "#0f3e34", display: "block", marginBottom: 3 }}>
                  {t("assistantWelcomeGreeting") || "Namaste! How can I help with your visit today?"}
                </b>
                <p style={{ margin: "0 0 6px", fontSize: "0.86rem", color: "#4f6962" }}>
                  {t("anayaWelcomeSubtitle") || "Speak with the mic or type any question below."}
                </p>
                <small className="helper" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#5d7870", fontSize: "0.78rem" }}>
                  <span>ℹ️</span> {t("assistantDisclaimer")}
                </small>
              </div>
            </div>

            {showStepContext && (
              <div className="anaya-step-banner">
                <span className="anaya-step-icon" aria-hidden="true">
                  {step === "anatomy" ? "📍" : step === "interview" ? "📝" : step === "documents" ? "📄" : "✅"}
                </span>
                <div className="anaya-step-content">
                  <p className="anaya-step-label">
                    {step === "anatomy" && "Current Step: Severity & Area"}
                    {step === "interview" && "Current Step: Guided Health Questions"}
                    {step === "documents" && "Current Step: Medical Documents"}
                    {step === "complete" && "Current Step: Ready for Doctor"}
                  </p>
                  <button
                    type="button"
                    className="anaya-step-chip"
                    onClick={() => {
                      if (step === "anatomy") void send(t("anayaStepPromptAnatomy"));
                      else if (step === "interview") void send(t("anayaStepPromptInterview"));
                      else if (step === "documents") void send(t("anayaStepPromptDocuments"));
                      else if (step === "complete") void send(t("anayaStepPromptComplete"));
                    }}
                  >
                    💡 {step === "anatomy" && t("anayaStepPromptAnatomy")}
                    {step === "interview" && t("anayaStepPromptInterview")}
                    {step === "documents" && t("anayaStepPromptDocuments")}
                    {step === "complete" && t("anayaStepPromptComplete")}
                  </button>
                </div>
              </div>
            )}

            <div className="anaya-starter-section">
              <h2 className="anaya-starter-heading" style={{ fontSize: "0.95rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#2d5e52", margin: "4px 0 2px" }}>
                {t("anayaWelcomeTitle")}
              </h2>
              <div className="anaya-starter-grid">
                <button
                  type="button"
                  className="anaya-starter-card"
                  onClick={() => void send(t("anayaStarterSymptomsPrompt"))}
                >
                  <span className="anaya-card-icon" aria-hidden="true">🩺</span>
                  <div className="anaya-card-text">
                    <strong>{t("anayaStarterSymptomsTitle")}</strong>
                    <p>{t("anayaStarterSymptomsDesc")}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="anaya-starter-card"
                  onClick={() => void send(t("anayaStarterDoctorPrepPrompt"))}
                >
                  <span className="anaya-card-icon" aria-hidden="true">📋</span>
                  <div className="anaya-card-text">
                    <strong>{t("anayaStarterDoctorPrepTitle")}</strong>
                    <p>{t("anayaStarterDoctorPrepDesc")}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="anaya-starter-card"
                  onClick={() => void send(t("anayaStarterDocumentsPrompt"))}
                >
                  <span className="anaya-card-icon" aria-hidden="true">📄</span>
                  <div className="anaya-card-text">
                    <strong>{t("anayaStarterDocumentsTitle")}</strong>
                    <p>{t("anayaStarterDocumentsDesc")}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="anaya-starter-card"
                  onClick={() => void send(t("anayaStarterWhereItHurtsPrompt"))}
                >
                  <span className="anaya-card-icon" aria-hidden="true">📍</span>
                  <div className="anaya-card-text">
                    <strong>{t("anayaStarterWhereItHurtsTitle")}</strong>
                    <p>{t("anayaStarterWhereItHurtsDesc")}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="anaya-starter-card"
                  onClick={() => void send(t("anayaStarterGeneralHealthPrompt"))}
                >
                  <span className="anaya-card-icon" aria-hidden="true">🌿</span>
                  <div className="anaya-card-text">
                    <strong>{t("anayaStarterGeneralHealthTitle")}</strong>
                    <p>{t("anayaStarterGeneralHealthDesc")}</p>
                  </div>
                </button>

                <button
                  type="button"
                  className="anaya-starter-card"
                  onClick={() => {
                    setDraft(t("anayaStarterSomethingElsePrompt"));
                    inputRef.current?.focus();
                  }}
                >
                  <span className="anaya-card-icon" aria-hidden="true">💬</span>
                  <div className="anaya-card-text">
                    <strong>{t("anayaStarterSomethingElseTitle")}</strong>
                    <p>{t("anayaStarterSomethingElseDesc")}</p>
                  </div>
                </button>
              </div>
            </div>
          </li>
        ) : (
          messages.map((m, idx) => {
            const isLastAssistant = m.role === "ASSISTANT" && idx === messages.length - 1;
            return (
              <li key={m.id} className={`msg assistant-message ${m.role === "ASSISTANT" ? "assistant assistant-message--assistant" : "patient assistant-message--patient"}`}>
                <div className="bubble assistant-bubble">
                  {m.role === "ASSISTANT" && (
                    <div className="assistant-sender-tag" style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", fontSize: "0.8rem", fontWeight: 700, color: "#0c8264" }}>
                      <span aria-hidden="true">👩‍⚕️</span>
                      <span>{assistantName}</span>
                    </div>
                  )}
                  <p style={{ margin: 0, whiteSpace: "pre-line" }}>{m.content}</p>
                  {m.safety?.[0] && !m.content.includes(m.safety[0].summary) && (
                    <div className="urgent-box assistant-safety" role="alert">{m.safety[0].summary}</div>
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <ul className="assistant-citations" style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
                      {m.citations.map((c, i) => (
                        <li key={i} className={`citation ${c.corpus === "AYURVEDA" ? "assistant-citations__corpus--ayurveda" : "assistant-citations__corpus--modern"}`}>
                          <b>{c.corpus === "AYURVEDA" ? "Ayurveda" : "Modern Medicine"}</b> · {c.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.role === "ASSISTANT" && (
                    <div className="anaya-msg-actions">
                      <button
                        className="secondary anaya-speak-btn"
                        onClick={() => void speakReply(m)}
                        aria-label={speaking === m.id ? t("stop") : t("speak")}
                      >
                        {speaking === m.id ? `■ ${t("stop")}` : `🔊 ${t("speak")}`}
                      </button>
                    </div>
                  )}

                  {isLastAssistant && (
                    <div className="anaya-quick-chips" aria-label="Suggested follow-up actions">
                      <button
                        type="button"
                        className="anaya-quick-chip"
                        onClick={() => void send(t("anayaChipTellMore"))}
                      >
                        {t("anayaChipTellMore")}
                      </button>
                      <button
                        type="button"
                        className="anaya-quick-chip"
                        onClick={() => void send(t("anayaChipWhenStarted"))}
                      >
                        {t("anayaChipWhenStarted")}
                      </button>
                      <button
                        type="button"
                        className="anaya-quick-chip"
                        onClick={() => void send(t("anayaChipHowSevere"))}
                      >
                        {t("anayaChipHowSevere")}
                      </button>
                      <button
                        type="button"
                        className="anaya-quick-chip nav-chip"
                        onClick={() => router.push("/patient/anatomy")}
                      >
                        {t("anayaChipOpenAnatomy")}
                      </button>
                      <button
                        type="button"
                        className="anaya-quick-chip menu-chip"
                        onClick={() => setMenuOpen(true)}
                      >
                        {t("anayaChipMainMenu")}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })
        )}
        {busy && (
          <li className="msg assistant assistant-message assistant-message--assistant" aria-live="polite">
            <div className="bubble assistant-bubble typing-bubble" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#25534b" }}>
              <div className="typing-dots" aria-hidden="true">
                <span /><span /><span />
              </div>
              <em style={{ fontStyle: "normal", fontSize: "0.86rem", fontWeight: 600, color: "#0c8264" }}>
                {assistantName} · {t("processing")}
              </em>
            </div>
          </li>
        )}
        <div ref={bottomRef} style={{ height: 1, minHeight: 1 }} aria-hidden="true" />
      </ol>

      {showScrollBottom && (
        <button
          type="button"
          className="anaya-scroll-bottom-pill"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Scroll to newest messages"
          style={{
            position: "absolute",
            bottom: "84px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0b5d4b",
            color: "white",
            border: "1px solid #148068",
            borderRadius: "999px",
            padding: "8px 16px",
            fontSize: "0.82rem",
            fontWeight: 700,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            cursor: "pointer",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          ↓ {t("newMessages") || "New messages"}
        </button>
      )}

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
          ref={inputRef}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("assistantHint")}
          aria-label={t("assistantComposerAria") || `Message ${assistantName}`}
          className="assistant-input"
        />
        <button className="primary anaya-send-btn" disabled={busy || !draft.trim()}>
          {busy ? t("processing") : t("send")}
        </button>
      </form>

      {note && (
        <p role="status" className="system-banner warning">
          {note}
        </p>
      )}

      {/* Main Menu Drawer / Modal */}
      {menuOpen && (
        <div className="anaya-drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <div
            className="anaya-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="anaya-menu-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="anaya-drawer-header">
              <h2 id="anaya-menu-title" style={{ margin: 0, fontSize: "1.25rem", color: "#113d35" }}>
                {t("anayaMainMenu")}
              </h2>
              <button
                type="button"
                className="secondary anaya-close-btn"
                onClick={() => setMenuOpen(false)}
                aria-label={t("anayaCloseMenu")}
              >
                ✕
              </button>
            </div>
            <div className="anaya-menu-list">
              <button
                type="button"
                className="anaya-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void send(t("anayaStarterSymptomsPrompt"));
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">🩺</span>
                <span>{t("anayaMenuDescribeSymptoms")}</span>
              </button>

              <button
                type="button"
                className="anaya-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void send(t("anayaStarterDoctorPrepPrompt"));
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">📋</span>
                <span>{t("anayaMenuDoctorPrep")}</span>
              </button>

              <button
                type="button"
                className="anaya-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/patient/anatomy");
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">📍</span>
                <span>{t("anayaMenuWhereItHurts")}</span>
              </button>

              <button
                type="button"
                className="anaya-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/patient/documents");
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">📄</span>
                <span>{t("anayaMenuDocumentHelp")}</span>
              </button>

              <button
                type="button"
                className="anaya-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void send(t("anayaStarterGeneralHealthPrompt"));
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">🌿</span>
                <span>{t("anayaMenuGeneralHealth")}</span>
              </button>

              <button
                type="button"
                className="anaya-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void send("How do I use voice input on this kiosk?");
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">🎙️</span>
                <span>{t("anayaMenuVoiceHelp")}</span>
              </button>

              <button
                type="button"
                className="anaya-menu-item restart-item"
                onClick={() => {
                  setMenuOpen(false);
                  setRestartModalOpen(true);
                }}
              >
                <span className="anaya-menu-icon" aria-hidden="true">🔄</span>
                <span>{t("anayaMenuRestartChat")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Chat Confirmation Modal */}
      {restartModalOpen && (
        <div className="anaya-modal-backdrop" onClick={() => setRestartModalOpen(false)}>
          <div
            className="anaya-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="anaya-restart-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="anaya-modal-icon" aria-hidden="true">🔄</div>
            <h3 id="anaya-restart-title" style={{ margin: "0 0 8px", color: "#113d35", fontSize: "1.3rem" }}>
              {t("anayaRestartTitle")}
            </h3>
            <p style={{ margin: "0 0 20px", color: "#475953", fontSize: "0.92rem", lineHeight: 1.5 }}>
              {t("anayaRestartDesc")}
            </p>
            <div className="anaya-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setRestartModalOpen(false)}
              >
                {t("anayaRestartCancel")}
              </button>
              <button
                type="button"
                className="primary anaya-btn-danger"
                onClick={() => void handleRestartChat()}
                disabled={busy}
              >
                {busy ? t("processing") : t("anayaRestartConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
