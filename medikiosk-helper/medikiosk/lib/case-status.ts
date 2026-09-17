import { z } from "zod";

/**
 * ONE canonical case status vocabulary shared by the patient kiosk, the doctor
 * console, and the hospital console. Patient-facing wording is mapped from this
 * state (in i18n), never stored as a second semantic enum.
 */
export const CaseStatus = z.enum([
  "NEW",
  "IN_PROGRESS",
  "AWAITING_REVIEW",
  "URGENT_REVIEW",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
]);

export type CaseStatus = z.infer<typeof CaseStatus>;

const allowed: Record<CaseStatus, CaseStatus[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_REVIEW", "URGENT_REVIEW", "CANCELLED"],
  AWAITING_REVIEW: ["IN_CONSULTATION", "CANCELLED"],
  URGENT_REVIEW: ["IN_CONSULTATION", "CANCELLED"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionCaseStatus(current: CaseStatus, next: CaseStatus): boolean {
  return allowed[current].includes(next);
}

/**
 * Case status at patient completion: any UNREVIEWED safety signal escalates
 * the case to URGENT_REVIEW; otherwise AWAITING_REVIEW.
 */
export function caseStatusOnCompletion(hasUnreviewedSignals: boolean): CaseStatus {
  return hasUnreviewedSignals ? "URGENT_REVIEW" : "AWAITING_REVIEW";
}

export const Severity = z.enum(["MILD", "MODERATE", "SEVERE", "VERY_SEVERE"]);
export type Severity = z.infer<typeof Severity>;

export const severityRank: Record<Severity, number> = {
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3,
  VERY_SEVERE: 4,
};
