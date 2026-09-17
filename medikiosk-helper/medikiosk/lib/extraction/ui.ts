/**
 * Client-facing helpers for rendering extracted evidence in the review UI.
 * These are pure, dependency-free functions used by the documents page.
 */

import type { EvidenceCategory } from "./types";

export const EVIDENCE_CATEGORY_ORDER: EvidenceCategory[] = [
  "DIAGNOSIS",
  "MEDICATION",
  "INVESTIGATION",
  "PROCEDURE",
  "ALLERGY",
  "MEDICAL_HISTORY",
  "CHRONOLOGY",
];

/** Maps an EvidenceCategory to its translation key. */
export function evidenceCategoryKey(category: EvidenceCategory): string {
  switch (category) {
    case "DIAGNOSIS":
      return "evidenceCategoryDiagnosis";
    case "MEDICATION":
      return "evidenceCategoryMedication";
    case "INVESTIGATION":
      return "evidenceCategoryInvestigation";
    case "PROCEDURE":
      return "evidenceCategoryProcedure";
    case "ALLERGY":
      return "evidenceCategoryAllergy";
    case "MEDICAL_HISTORY":
      return "evidenceCategoryMedicalHistory";
    case "CHRONOLOGY":
      return "evidenceCategoryChronology";
    default:
      return "evidenceCategoryMedicalHistory";
  }
}

/** Maps an extraction method to its translation key. */
export function evidenceMethodKey(method: "DETERMINISTIC" | "AI"): string {
  return method === "AI" ? "evidenceMethodAi" : "evidenceMethodDeterministic";
}

/** Format a normalized evidence value as a short display string. */
export function formatEvidenceValue(value: {
  name?: string;
  value?: string;
  unit?: string;
  dose?: string;
  frequency?: string;
  date?: string;
  details?: string;
}): string {
  if (value.name) {
    const parts = [value.name];
    if (value.dose) parts.push(value.dose);
    if (value.frequency) parts.push(value.frequency);
    if (value.value) parts.push(value.value);
    return parts.join(" · ");
  }
  if (value.details) return value.details;
  if (value.date) return value.date;
  if (value.value) {
    return value.unit ? `${value.value} ${value.unit}` : value.value;
  }
  return "";
}
