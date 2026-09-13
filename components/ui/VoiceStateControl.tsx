"use client";

import { useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "understanding" | "heard" | "error";

export interface VoiceStateControlProps {
  language?: string;
  onTranscriptConfirmed: (transcript: string) => void;
  onManualEdit?: (initialValue: string) => void;
  promptText?: string;
}

export default function VoiceStateControl({
  language = "en",
  onTranscriptConfirmed,
  onManualEdit,
  promptText = "Tap to speak your answer",
}: VoiceStateControlProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecRef.current = null;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const supported = !!(navigator.mediaDevices && window.MediaRecorder);
      setIsSupported(supported);
    }
    return () => {
      stopRecording();
    };
  }, []);


  const startListening = async () => {
    if (!isSupported) {
      setVoiceState("error");
      setErrorMessage("Voice input is not supported on this browser. Please type your answer.");
      return;
    }

    setTranscript("");
    setErrorMessage("");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRec = new MediaRecorder(stream);
      mediaRecRef.current = mediaRec;

      mediaRec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRec.mimeType || "audio/webm",
        });

        if (audioBlob.size === 0) {
          setVoiceState("idle");
          return;
        }

        setVoiceState("understanding");

        try {
          const fd = new FormData();
          fd.append("audio", audioBlob, "voice-input.webm");
          fd.append("language", language);

          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: fd,
          });

          if (!res.ok) throw new Error("Transcription failed");
          const data = (await res.json()) as { transcript: string };

          if (data.transcript && data.transcript.trim()) {
            setTranscript(data.transcript.trim());
            setVoiceState("heard");
          } else {
            setVoiceState("error");
            setErrorMessage("We couldn't hear you clearly. Please try again or type instead.");
          }
        } catch {
          setVoiceState("error");
          setErrorMessage("We couldn't hear you clearly. Please try again or type instead.");
        }
      };

      mediaRec.start();
      setVoiceState("listening");

      // Auto stop after 20 seconds
      timeoutRef.current = setTimeout(() => {
        if (mediaRec.state !== "inactive") mediaRec.stop();
      }, 20000);
    } catch {
      setVoiceState("error");
      setErrorMessage("Microphone access was denied. Please allow microphone permissions or type instead.");
    }
  };

  const handleStop = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
  };

  const handleConfirm = () => {
    onTranscriptConfirmed(transcript);
    setVoiceState("idle");
    setTranscript("");
  };

  const handleEdit = () => {
    if (onManualEdit) {
      onManualEdit(transcript);
    }
    setVoiceState("idle");
  };

  const handleRetry = () => {
    void startListening();
  };

  return (
    <div className="voice-state-controller" role="region" aria-label="Voice input control">
      {/* State 1: IDLE / TAP TO SPEAK */}
      {voiceState === "idle" && (
        <div className="voice-stage-idle">
          <button
            type="button"
            className="voice-main-mic-btn"
            onClick={() => void startListening()}
            aria-label="Tap to speak"
          >
            <span className="voice-mic-icon" aria-hidden="true">
              🎤
            </span>
          </button>
          <span className="voice-prompt-text">{promptText}</span>
        </div>
      )}

      {/* State 2: LISTENING */}
      {voiceState === "listening" && (
        <div className="voice-stage-listening" role="status" aria-live="polite">
          <div className="voice-waveform-active" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <button
            type="button"
            className="voice-stop-btn"
            onClick={handleStop}
            aria-label="Stop recording"
          >
            <span className="voice-stop-icon" aria-hidden="true">
              ■
            </span>
            <span>Stop speaking</span>
          </button>
          <span className="voice-listening-label">Listening… Speak clearly now</span>
        </div>
      )}

      {/* State 3: UNDERSTANDING */}
      {voiceState === "understanding" && (
        <div className="voice-stage-understanding" role="status" aria-live="polite">
          <div className="voice-understanding-spinner" aria-hidden="true">
            <span className="spinner-dot" />
            <span className="spinner-dot" />
            <span className="spinner-dot" />
          </div>
          <strong className="voice-understanding-text">Understanding what you said…</strong>
          <small className="voice-understanding-sub">Medi is listening and transcribing</small>
        </div>
      )}

      {/* State 4: HEARD & CONFIRMATION */}
      {voiceState === "heard" && (
        <div className="voice-stage-heard" role="region" aria-label="Confirm spoken text">
          <div className="voice-heard-header">
            <span className="voice-heard-icon" aria-hidden="true">
              💬
            </span>
            <strong>I heard:</strong>
          </div>

          <blockquote className="voice-transcript-quote">
            &ldquo;{transcript}&rdquo;
          </blockquote>

          <p className="voice-confirm-prompt">Is this what you wanted to say?</p>

          <div className="voice-heard-actions">
            <button
              type="button"
              className="voice-action-confirm"
              onClick={handleConfirm}
              aria-label="Yes, that is correct"
            >
              ✓ THAT&apos;S CORRECT
            </button>


            <button
              type="button"
              className="voice-action-edit"
              onClick={handleEdit}
              aria-label="Edit this transcript"
            >
              ✎ EDIT
            </button>

            <button
              type="button"
              className="voice-action-retry"
              onClick={handleRetry}
              aria-label="Try speaking again"
            >
              🎤 TRY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* State 5: ERROR RECOVERY */}
      {voiceState === "error" && (
        <div className="voice-stage-error" role="alert">
          <p className="voice-error-text">{errorMessage}</p>
          <div className="voice-error-actions">
            <button
              type="button"
              className="voice-retry-btn"
              onClick={() => void startListening()}
            >
              🎤 Try again
            </button>
            <button
              type="button"
              className="voice-dismiss-btn"
              onClick={() => setVoiceState("idle")}
            >
              Type instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
