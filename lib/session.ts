import { z } from "zod";
import { PatientLanguage } from "./patient-flow";

export const SessionStatus = z.enum(["ACTIVE", "EXPIRED", "COMPLETED"]);
export const SessionConsentStatus = z.enum(["NOT_REVIEWED", "ACCEPTED", "DECLINED"]);
export const SessionWorkflowStep = z.enum(["welcome", "language", "consent", "start", "complaint", "anatomy", "interview", "documents"]);
export const SessionBodyRegion = z.enum([
  "head",
  "chest",
  "abdomen",
  "back",
  "arm",
  "hand",
  "leg",
  "foot",
  "skin",
  "other",
]);
export const SessionBodySubregion = z.enum([
  "front",
  "back",
  "left",
  "right",
  "upper",
  "lower",
  "middle",
  "face",
  "body",
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const InterviewFactSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().optional(),
  state: z.enum(["NOT_ASKED", "KNOWN", "UNKNOWN", "DECLINED", "DENIED"]),
  provenance: z.enum(["PATIENT", "VOICE", "TOUCH", "OCR", "AI", "DOCTOR", "SYSTEM"]),
}).strict();

export const SessionUpdateSchema = z.object({
  language: PatientLanguage.optional(),
  consentStatus: SessionConsentStatus.optional(),
  workflowStep: SessionWorkflowStep.optional(),
  complaintText: z.string().max(2000).optional(),
  bodyRegion: SessionBodyRegion.nullable().optional(),
  bodySubregion: SessionBodySubregion.nullable().optional(),
  interviewData: z.record(z.string(), InterviewFactSchema).nullable().optional(),
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
  complaintText: z.string().nullable(),
  bodyRegion: SessionBodyRegion.nullable(),
  bodySubregion: SessionBodySubregion.nullable(),
  interviewData: z.record(z.string(), InterviewFactSchema).nullable(),
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
    complaintText: null,
    bodyRegion: null,
    bodySubregion: null,
    interviewData: null,
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
