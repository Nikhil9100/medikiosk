"use client";

import { useState } from "react";

export type MediMode = "guide" | "interviewer" | "explainer" | "safety" | "completion";

export interface MediAssistantPanelProps {
  mode?: MediMode;
  message?: string;
  whyExplanation?: string;
  stepContext?: string;
  onSpeak?: () => void;
  isSpeaking?: boolean;
}

const defaultMessages: Record<MediMode, { title: string; subtitle: string; icon: string }> = {
  guide: {
    title: "Guide",
    subtitle: "I'll help you prepare your information for the doctor.",
    icon: "🩺",
  },
  interviewer: {
    title: "Question Assistant",
    subtitle: "Answer at your own pace. You can tap or speak.",
    icon: "📋",
  },
  explainer: {
    title: "Explainer",
    subtitle: "I'm asking this because it helps the healthcare team understand your symptoms.",
    icon: "💡",
  },
  safety: {
    title: "Safety Notice",
    subtitle: "Please alert hospital staff immediately if symptoms are severe.",
    icon: "🚨",
  },
  completion: {
    title: "Visit Ready",
    subtitle: "Your information is safely prepared for the healthcare team.",
    icon: "✅",
  },
};

export default function MediAssistantPanel({
  mode = "guide",
  message,
  whyExplanation,
  stepContext,
  onSpeak,
  isSpeaking = false,
}: MediAssistantPanelProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const meta = defaultMessages[mode];
  const activeMessage = message || meta.subtitle;

  return (
    <aside
      className={`medi-panel-container mode-${mode}`}
      aria-label="Medi - Your digital visit assistant"
    >
      <div className="medi-panel-header">
        <div className="medi-brand-group">
          <div className="medi-avatar-frame" aria-hidden="true">
            <span className="medi-avatar-icon">👩‍⚕️</span>
          </div>
          <div className="medi-title-block">
            <div className="medi-name-row">
              <strong className="medi-name">Medi</strong>
              <span className={`medi-mode-chip mode-${mode}`}>
                {meta.icon} {meta.title}
              </span>
            </div>
            <span className="medi-tagline">Your digital visit assistant</span>
          </div>
        </div>

        {onSpeak && (
          <button
            type="button"
            className="medi-speak-btn"
            onClick={onSpeak}
            aria-label={isSpeaking ? "Stop read aloud" : "Read aloud with voice"}
          >
            {isSpeaking ? "■ Stop" : "🔊 Listen"}
          </button>
        )}
      </div>

      <div className="medi-bubble-card">
        <p className="medi-speech-text">{activeMessage}</p>
        {stepContext && <small className="medi-step-context">{stepContext}</small>}
      </div>

      {whyExplanation && (
        <div className="medi-why-section">
          <button
            type="button"
            className="medi-why-toggle"
            onClick={() => setWhyOpen(!whyOpen)}
            aria-expanded={whyOpen}
          >
            <span>💡 Why am I asking this?</span>
            <span className="why-toggle-chevron" aria-hidden="true">
              {whyOpen ? "▲" : "▼"}
            </span>
          </button>

          {whyOpen && (
            <div className="medi-why-content" role="region">
              <p>{whyExplanation}</p>
            </div>
          )}
        </div>
      )}

      <div className="medi-trust-footer">
        <span>🔒 Private & secure</span>
        <span>·</span>
        <span>Physician review required</span>
      </div>
    </aside>
  );
}
