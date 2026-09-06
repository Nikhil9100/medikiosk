"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePatientWorkflow } from "../PatientShell";
import {
  determineNextQuestion,
  patientInterviewQuestions,
  type QuestionAnswer,
} from "@/lib/interview-engine";

type AnswerDraft = {
  value: string;
  state: "NOT_ASKED" | "KNOWN" | "UNKNOWN" | "DECLINED" | "DENIED";
};

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export default function PatientInterviewPage() {
  const router = useRouter();
  const { workflow, setInterviewFact, syncSession, t } = usePatientWorkflow();
  const [draft, setDraft] = useState<AnswerDraft>({ value: "", state: "NOT_ASKED" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [voiceError, setVoiceError] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentQuestion = useMemo(() => {
    return determineNextQuestion(workflow.interviewFacts, patientInterviewQuestions);
  }, [workflow.interviewFacts]);

  const currentFact: QuestionAnswer | undefined = currentQuestion ? workflow.interviewFacts[currentQuestion.id] : undefined;

  function updateDraft(nextValue: string, nextState: AnswerDraft["state"]) {
    setDraft({ value: nextValue, state: nextState });
  }

  async function submitAnswer(questionId: string, value: string | undefined, state: AnswerDraft["state"], provenance: "PATIENT" | "VOICE" = "PATIENT") {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setInterviewFact(questionId, value, provenance);
    void syncSession({ interviewData: { [questionId]: { questionId, value, state, provenance } }, workflowStep: "interview" });
    setDraft({ value: "", state: "NOT_ASKED" });
    setTranscript("");
    setVoiceError("");
    setIsSubmitting(false);
  }

  function handleComplete() {
    void syncSession({ workflowStep: "interview" });
    router.push("/patient");
  }

  async function startListening() {
    setVoiceError("");
    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVoiceState("listening");

      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceState("processing");

        try {
          const audioBlob = new Blob(chunks, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob, "audio.webm");
          formData.append("language", workflow.language);

          const response = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Transcription failed");
          }

          const data = await response.json();
          setTranscript(data.transcript);
          setVoiceState("idle");
        } catch (error) {
          setVoiceError(error instanceof Error ? error.message : "Transcription failed");
          setVoiceState("error");
        }
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      }, 30000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setVoiceError(t("voiceMicrophoneDenied"));
      } else {
        setVoiceError(error instanceof Error ? error.message : "Microphone access failed");
      }
      setVoiceState("error");
    }
  }

  function stopListening() {
    setVoiceState("idle");
  }

  async function speakQuestion() {
    if (!currentQuestion || voiceState === "speaking") return;
    setVoiceError("");
    setVoiceState("speaking");

    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentQuestion.label, language: workflow.language }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Speech synthesis failed");
      }

      const data = await response.json();
      const audio = new Audio(`data:${data.contentType};base64,${data.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setVoiceState("idle");
      audio.onerror = () => setVoiceState("error");
      await audio.play();
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Speech synthesis failed");
      setVoiceState("error");
    }
  }

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setVoiceState("idle");
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  if (!currentQuestion) {
    return (
      <section className="flow-screen" aria-labelledby="interview-title">
        <p className="eyebrow">{t("interviewStep")}</p>
        <h1 id="interview-title">{t("interviewCompleteTitle")}</h1>
        <p className="lead-copy">{t("interviewCompleteHelper")}</p>
        <div className="primary-action-stack">
          <button type="button" className="primary-button" onClick={handleComplete}>
            {t("interviewCompleteNext")} <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  const isAnswered = currentFact !== undefined && currentFact.state !== "NOT_ASKED";
  const isFreeText = currentQuestion.type === "free_text";
  const isYesNo = currentQuestion.type === "yes_no";
  const isSingleChoice = currentQuestion.type === "single_choice";
  const isNumeric = currentQuestion.type === "numeric";
  const isDateDuration = currentQuestion.type === "date_duration";
  const canUseVoice = isFreeText || isNumeric || isDateDuration || isSingleChoice;
  const isListening = voiceState === "listening";
  const isProcessing = voiceState === "processing";
  const isSpeaking = voiceState === "speaking";

  return (
    <section className="flow-screen interview-screen" aria-labelledby="interview-title">
      <p className="eyebrow">{t("interviewStep")}</p>
      <h1 id="interview-title">{t("interviewTitle")}</h1>
      <p className="lead-copy interview-subtitle">{t("interviewHelper")}</p>

      <div className="interview-card" aria-live="polite">
        <div className="interview-card__question">
          <span className="interview-card__domain">{currentQuestion.domain.replace(/_/g, " ")}</span>
          <h2>{currentQuestion.label}</h2>
          {currentQuestion.description && <p className="interview-card__description">{currentQuestion.description}</p>}
        </div>

        <div className="interview-card__controls">
          {canUseVoice && (
            <div className="interview-voice-controls">
              <div className="interview-voice-actions">
                <button
                  type="button"
                  className={`voice-button ${isListening ? "voice-button--active" : ""}`}
                  onClick={isListening ? stopListening : startListening}
                  disabled={isSubmitting || isAnswered || isProcessing || isSpeaking}
                  aria-label={isListening ? t("voiceStop") : t("voiceListen")}
                  title={isListening ? t("voiceStop") : t("voiceListen")}
                >
                  <span aria-hidden="true">{isListening ? "●" : "🎤"}</span>
                  {isListening ? t("voiceStop") : t("voiceListen")}
                </button>
                <button
                  type="button"
                  className={`voice-button ${isSpeaking ? "voice-button--active" : ""}`}
                  onClick={isSpeaking ? stopSpeaking : speakQuestion}
                  disabled={isSubmitting || isAnswered || isListening || isProcessing}
                  aria-label={isSpeaking ? t("voiceStop") : t("voiceListen")}
                  title={isSpeaking ? t("voiceStop") : t("voiceListen")}
                >
                  <span aria-hidden="true">{isSpeaking ? "■" : "🔊"}</span>
                  {isSpeaking ? t("voiceStop") : t("voiceListen")}
                </button>
              </div>

              {(isListening || isProcessing || isSpeaking) && (
                <p className="voice-status" role="status">
                  {isListening && t("voiceListening")}
                  {isProcessing && t("voiceTranscriptReady")}
                  {isSpeaking && t("voiceSpeaking")}
                </p>
              )}

              {voiceError && (
                <p className="voice-error" role="alert">
                  {voiceError}
                </p>
              )}
            </div>
          )}

          {transcript && !isAnswered && (
            <div className="interview-voice-transcript">
              <label htmlFor="voice-transcript" className="sr-only">
                {t("voiceTranscriptPlaceholder")}
              </label>
              <textarea
                id="voice-transcript"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                className="interview-input"
                rows={3}
              />
              <div className="primary-action-stack">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => submitAnswer(currentQuestion.id, transcript, "KNOWN", "VOICE")}
                  disabled={!transcript.trim()}
                >
                  {t("voiceUseTranscript")} <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}

          {isFreeText && !transcript && (
            <div>
              <label htmlFor={`question-${currentQuestion.id}`} className="sr-only">
                {currentQuestion.label}
              </label>
              <textarea
                id={`question-${currentQuestion.id}`}
                aria-label={currentQuestion.label}
                value={draft.value}
                onChange={(event) => updateDraft(event.target.value, "KNOWN")}
                placeholder={t("interviewAnswerPlaceholder")}
                rows={4}
                className="interview-input"
                disabled={isSubmitting || isAnswered}
              />
            </div>
          )}

          {isYesNo && (
            <div className="interview-choices" role="group" aria-label={currentQuestion.label}>
              <button
                type="button"
                className={`interview-choice ${draft.state === "KNOWN" && draft.value.toLowerCase() === "yes" ? "interview-choice--selected" : ""}`}
                onClick={() => updateDraft("yes", "KNOWN")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewYes")}
              </button>
              <button
                type="button"
                className={`interview-choice ${draft.state === "DENIED" && draft.value.toLowerCase() === "no" ? "interview-choice--selected" : ""}`}
                onClick={() => updateDraft("no", "DENIED")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewNo")}
              </button>
              <button
                type="button"
                className="interview-choice interview-choice--secondary"
                onClick={() => submitAnswer(currentQuestion.id, undefined, "UNKNOWN")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewUnknown")}
              </button>
              <button
                type="button"
                className="interview-choice interview-choice--secondary"
                onClick={() => submitAnswer(currentQuestion.id, undefined, "DECLINED")}
                disabled={isSubmitting || isAnswered}
              >
                {t("interviewDeclined")}
              </button>
            </div>
          )}

          {isSingleChoice && currentQuestion.options && (
            <div className="interview-choices" role="group" aria-label={currentQuestion.label}>
              {currentQuestion.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`interview-choice ${draft.value === option.value ? "interview-choice--selected" : ""}`}
                  onClick={() => updateDraft(option.value, "KNOWN")}
                  disabled={isSubmitting || isAnswered}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {isNumeric && !transcript && (
            <div className="interview-field">
              <label htmlFor={`question-${currentQuestion.id}`} className="sr-only">
                {currentQuestion.label}
              </label>
              <input
                id={`question-${currentQuestion.id}`}
                type="number"
                aria-label={currentQuestion.label}
                value={draft.value}
                onChange={(event) => updateDraft(event.target.value, "KNOWN")}
                placeholder={t("interviewAnswerPlaceholder")}
                className="interview-input"
                disabled={isSubmitting || isAnswered}
              />
            </div>
          )}

          {isDateDuration && !transcript && (
            <div className="interview-field">
              <label htmlFor={`question-${currentQuestion.id}`} className="sr-only">
                {currentQuestion.label}
              </label>
              <input
                id={`question-${currentQuestion.id}`}
                type="text"
                aria-label={currentQuestion.label}
                value={draft.value}
                onChange={(event) => updateDraft(event.target.value, "KNOWN")}
                placeholder={t("interviewAnswerPlaceholder")}
                className="interview-input"
                disabled={isSubmitting || isAnswered}
              />
            </div>
          )}

          {isAnswered && (
            <p className="inline-status" role="status">
              {t("interviewRecorded")}
            </p>
          )}
        </div>

        <div className="primary-action-stack">
          {canUseVoice && !transcript ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => submitAnswer(currentQuestion.id, draft.value || undefined, draft.state === "NOT_ASKED" ? "KNOWN" : draft.state)}
              disabled={isSubmitting || isAnswered || !draft.value.trim()}
            >
              {t("interviewNext")} <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="patient-footer">
        <button type="button" className="back-button" onClick={() => router.push("/patient/anatomy")}>
          <span aria-hidden="true">←</span> {t("consentBack")}
        </button>
      </div>
    </section>
  );
}
