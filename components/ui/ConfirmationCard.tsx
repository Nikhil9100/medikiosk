"use client";

export interface ConfirmationCardProps {
  title?: string;
  source: string;
  label?: string;
  value: string;
  question?: string;
  isUncertain?: boolean;
  confirmLabel?: string;
  editLabel?: string;
  retryLabel?: string;
  onConfirm: () => void;
  onEdit: () => void;
  onRetry?: () => void;
}

export default function ConfirmationCard({
  title,
  source,
  label,
  value,
  question = "Is this correct?",
  isUncertain = false,
  confirmLabel = "✓ THAT'S CORRECT",
  editLabel = "✎ CORRECT IT",
  retryLabel,
  onConfirm,
  onEdit,
  onRetry,
}: ConfirmationCardProps) {
  const displayTitle = title ?? (isUncertain ? "Please check this information" : "We found this information");

  return (
    <div
      className={`clinical-confirm-card ${isUncertain ? "uncertain" : ""}`}
      role="region"
      aria-label="Clinical information confirmation"
    >
      <div className="confirm-card-header">
        <div className="confirm-source-badge">
          <span className="confirm-source-icon" aria-hidden="true">
            {source.toLowerCase().includes("mic") || source.toLowerCase().includes("voice")
              ? "🎙️"
              : "📄"}
          </span>
          <span className="confirm-source-text">{source}</span>
        </div>
        <h3 className="confirm-title">{displayTitle}</h3>
      </div>

      <div className="confirm-value-container">
        {label && <span className="confirm-value-label">{label}</span>}
        <strong className="confirm-value-text">{value}</strong>
      </div>

      <p className="confirm-question">{question}</p>

      <div className="confirm-actions">
        <button
          type="button"
          className="confirm-btn-yes"
          onClick={onConfirm}
          aria-label={`${confirmLabel}: ${value}`}
        >
          {confirmLabel}
        </button>

        <button
          type="button"
          className="confirm-btn-edit"
          onClick={onEdit}
          aria-label={`${editLabel}: ${value}`}
        >
          {editLabel}
        </button>

        {onRetry && (
          <button
            type="button"
            className="confirm-btn-retry"
            onClick={onRetry}
            aria-label={retryLabel || "Try again"}
          >
            {retryLabel || "🎤 TRY AGAIN"}
          </button>
        )}
      </div>
    </div>
  );
}
