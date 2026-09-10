/**
 * Shared clinical status vocabulary components.
 *
 * Status is NEVER conveyed by color alone: every badge carries an explicit
 * text label plus a distinct glyph, and the canonical vocabulary is the same
 * across the patient kiosk, doctor console, and hospital console.
 */

export const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  AWAITING_REVIEW: "Awaiting review",
  URGENT_REVIEW: "Urgent review",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const SEVERITY_LABELS: Record<string, string> = {
  MILD: "Mild",
  MODERATE: "Moderate",
  SEVERE: "Severe",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  UNVERIFIED: "Unverified",
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  ACCEPTED: "Accepted by patient",
};

export const FACT_STATE_LABELS: Record<string, string> = {
  KNOWN: "Known",
  DENIED: "Denied",
  UNKNOWN: "Unknown",
  NOT_ASKED: "Not asked",
  DECLINED: "Declined",
};

export const SIGNAL_STATUS_LABELS: Record<string, string> = {
  UNREVIEWED: "Unreviewed",
  REVIEWED: "Reviewed",
  ESCALATED: "Escalated",
  DISMISSED: "Dismissed",
};

const STATUS_GLYPHS: Record<string, string> = {
  NEW: "○",
  IN_PROGRESS: "◔",
  AWAITING_REVIEW: "◷",
  URGENT_REVIEW: "▲",
  IN_CONSULTATION: "◉",
  COMPLETED: "✓",
  CANCELLED: "✕",
};

const STATUS_STYLES: Record<string, string> = {
  NEW: "border-slate-300 bg-slate-50 text-slate-700",
  IN_PROGRESS: "border-blue-300 bg-blue-50 text-blue-800",
  AWAITING_REVIEW: "border-amber-300 bg-amber-50 text-amber-800",
  URGENT_REVIEW: "border-red-400 bg-red-50 text-red-800",
  IN_CONSULTATION: "border-indigo-300 bg-indigo-50 text-indigo-800",
  COMPLETED: "border-green-300 bg-green-50 text-green-800",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-500",
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const label = CASE_STATUS_LABELS[status] ?? status;
  const glyph = STATUS_GLYPHS[status] ?? "•";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "border-slate-300 bg-slate-50 text-slate-700"} ${className}`}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
      <span className="sr-only"> case status: </span>
    </span>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  MILD: "border-green-300 bg-green-50 text-green-800",
  MODERATE: "border-amber-300 bg-amber-50 text-amber-800",
  SEVERE: "border-red-400 bg-red-50 text-red-800",
};

export function SeverityBadge({ severity }: { severity: string }) {
  if (!severity) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[severity] ?? "border-slate-300 bg-slate-50 text-slate-700"}`}>
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}

const VERIFICATION_STYLES: Record<string, string> = {
  UNVERIFIED: "border-slate-300 bg-slate-50 text-slate-600",
  PENDING_REVIEW: "border-amber-300 bg-amber-50 text-amber-800",
  VERIFIED: "border-green-300 bg-green-50 text-green-800",
  REJECTED: "border-red-400 bg-red-50 text-red-800",
  ACCEPTED: "border-blue-300 bg-blue-50 text-blue-800",
};

const VERIFICATION_GLYPHS: Record<string, string> = {
  UNVERIFIED: "○",
  PENDING_REVIEW: "◷",
  VERIFIED: "✓",
  REJECTED: "✕",
  ACCEPTED: "☑",
};

export function VerificationBadge({ state }: { state: string }) {
  const label = VERIFICATION_LABELS[state] ?? state;
  const glyph = VERIFICATION_GLYPHS[state] ?? "•";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${VERIFICATION_STYLES[state] ?? "border-slate-300 bg-slate-50 text-slate-600"}`}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

const FACT_STYLES: Record<string, string> = {
  KNOWN: "border-green-300 bg-green-50 text-green-800",
  DENIED: "border-blue-300 bg-blue-50 text-blue-800",
  UNKNOWN: "border-amber-300 bg-amber-50 text-amber-800",
  NOT_ASKED: "border-slate-300 bg-slate-50 text-slate-500",
  DECLINED: "border-slate-300 bg-slate-100 text-slate-600",
};

export function FactStateBadge({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${FACT_STYLES[state] ?? "border-slate-300 bg-slate-50 text-slate-600"}`}>
      {FACT_STATE_LABELS[state] ?? state}
    </span>
  );
}

const SIGNAL_STYLES: Record<string, string> = {
  UNREVIEWED: "border-red-400 bg-red-50 text-red-800",
  REVIEWED: "border-green-300 bg-green-50 text-green-800",
  ESCALATED: "border-purple-300 bg-purple-50 text-purple-800",
  DISMISSED: "border-slate-300 bg-slate-100 text-slate-600",
};

export function SignalStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${SIGNAL_STYLES[status] ?? "border-slate-300 bg-slate-50 text-slate-600"}`}>
      {SIGNAL_STATUS_LABELS[status] ?? status}
    </span>
  );
}
