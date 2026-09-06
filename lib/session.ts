import { z } from "zod";
import { PatientLanguage } from "./patient-flow";

export const SessionStatus = z.enum(["ACTIVE", "EXPIRED", "COMPLETED"]);
export const SessionConsentStatus = z.enum(["NOT_REVIEWED", "ACCEPTED", "DECLINED"]);
export const SessionWorkflowStep = z.enum(["welcome", "language", "consent", "start"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SessionUpdateSchema = z.object({
  language: PatientLanguage.optional(),
  consentStatus: SessionConsentStatus.optional(),
  workflowStep: SessionWorkflowStep.optional(),
  status: z.literal("COMPLETED").optional(),
}).strict();

export const PatientSessionRecordSchema = z.object({
  id: z.string().uuid(),
  status: SessionStatus,
  language: PatientLanguage,
  consentStatus: SessionConsentStatus,
  consentVersion: z.string().nullable(),
  consentTimestamp: z.string().datetime().nullable(),
  workflowStep: SessionWorkflowStep,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export type PatientSessionRecord = z.infer<typeof PatientSessionRecordSchema>;

const sessionDurationMs = 30 * 60 * 1000;

export function createSession(language: PatientSessionRecord["language"] = "en", now = new Date()): PatientSessionRecord {
  return {
    id: crypto.randomUUID(),
    status: "ACTIVE",
    language,
    consentStatus: "NOT_REVIEWED",
    consentVersion: null,
    consentTimestamp: null,
    workflowStep: "welcome",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionDurationMs).toISOString(),
    completedAt: null,
  };
}

export function isSessionActive(session: PatientSessionRecord, now = new Date()): boolean {
  return session.status === "ACTIVE" && new Date(session.expiresAt).getTime() > now.getTime();
}

export function canTransitionStatus(current: SessionStatus, next: SessionStatus): boolean {
  return current === "ACTIVE" && (next === "EXPIRED" || next === "COMPLETED");
}
