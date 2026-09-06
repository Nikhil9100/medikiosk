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

export async function createOrReusePatientSession(language: PatientLanguage) {
  await ensureAuthenticated();
  const response = await fetch("/api/patient/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": getIdempotencyKey() },
    body: JSON.stringify({ language }),
  });
  if (!response.ok) throw new Error("Patient session could not be created");
  return response.json();
}

export async function updatePatientSession(update: {
  language?: PatientLanguage;
  consentStatus?: ConsentStatus;
  workflowStep?: PatientStep;
  complaintText?: string;
  bodyRegion?: string;
  bodySubregion?: string;
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
