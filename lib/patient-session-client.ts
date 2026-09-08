"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PatientLanguage } from "@/lib/patient-flow";
import type { ConsentStatus, PatientStep } from "@/lib/patient-flow";

const idempotencyStorageKey = "medikiosk.patient.session.idempotency";

function getIdempotencyKey() {
  const existing = window.localStorage.getItem(idempotencyStorageKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(idempotencyStorageKey, next);
  return next;
}

async function ensureAuthenticated() {
  const supabase = createSupabaseBrowserClient();
  const current = await supabase.auth.getUser();
  if (current.data.user) return supabase;
  const signedIn = await supabase.auth.signInAnonymously();
  if (signedIn.error) throw new Error("Patient authentication is unavailable");
  return supabase;
}

/**
 * Establish the patient session at the start of the patient flow.
 *
 * This is the single entry point for the app to obtain a server-side session.
 * It reuses an existing active session from the `medikiosk_session` cookie when
 * present, otherwise it creates one (which sets the cookie server-side). A
 * reused-but-expired session (410) is discarded so a fresh session is created
 * rather than resurrecting a stale idempotency key.
 */
export async function bootstrapPatientSession(language: PatientLanguage) {
  await ensureAuthenticated();
  const existingResponse = await fetch("/api/patient/session");
  if (existingResponse.ok) {
    const { session } = await existingResponse.json();
    if (session?.status === "ACTIVE") return session;
  }
  // No active session (404), an expired one (410), or a completed one: create a
  // fresh session. Discard the old idempotency key so the server does not return
  // the stale session again.
  window.localStorage.removeItem(idempotencyStorageKey);
  const response = await fetch("/api/patient/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": getIdempotencyKey() },
    body: JSON.stringify({ language }),
  });
  if (!response.ok) throw new Error("Patient session could not be established");
  const { session } = await response.json();
  return session;
}

export async function updatePatientSession(update: {
  language?: PatientLanguage;
  consentStatus?: ConsentStatus;
  workflowStep?: PatientStep;
  complaintText?: string;
  bodyRegion?: string | null;
  bodySubregion?: string | null;
  interviewData?: Record<string, unknown> | null;
  status?: "COMPLETED";
}) {
  const response = await fetch("/api/patient/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error("Patient session could not be updated");
  return response.json();
}

export async function resetPatientSession() {
  const response = await fetch("/api/patient/session/reset", { method: "POST" });
  if (!response.ok) throw new Error("Patient session could not be reset");
  window.localStorage.removeItem(idempotencyStorageKey);
  return response.json();
}
