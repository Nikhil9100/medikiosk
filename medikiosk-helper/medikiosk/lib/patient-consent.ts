import { NextResponse } from "next/server";

/**
 * Server-side consent enforcement for patient-scoped clinical writes.
 *
 * The UI guides patients through consent first, but the API is the source of
 * truth: no clinical information (complaints, anatomy, interview answers,
 * documents, extraction) may be recorded before the patient has ACCEPTED
 * consent. Setting the consent state itself, choosing a language, and
 * deleting data remain possible without consent.
 */

/** Workflow steps a patient may occupy before accepting consent. */
export const CONSENT_FREE_STEPS = new Set(["welcome", "language", "consent"]);

export function hasAcceptedConsent(session: { consentStatus?: string | null } | null | undefined): boolean {
  return session?.consentStatus === "ACCEPTED";
}

export function consentRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: "Consent is required before recording clinical information", code: "CONSENT_REQUIRED" },
    { status: 403 },
  );
}
