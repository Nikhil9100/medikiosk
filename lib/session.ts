import { z } from "zod";

export const SessionStatus = z.enum(["ACTIVE", "EXPIRED", "COMPLETED"]);

export const PatientSessionRecordSchema = z.object({
  id: z.string().uuid(),
  status: SessionStatus,
  language: z.enum(["en", "hi", "bn", "te", "ta", "mr"]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type PatientSessionRecord = z.infer<typeof PatientSessionRecordSchema>;

const sessionDurationMs = 30 * 60 * 1000;

export function createSession(language: PatientSessionRecord["language"] = "en", now = new Date()): PatientSessionRecord {
  return {
    id: crypto.randomUUID(),
    status: "ACTIVE",
    language,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionDurationMs).toISOString(),
  };
}

export function isSessionActive(session: PatientSessionRecord, now = new Date()): boolean {
  return session.status === "ACTIVE" && new Date(session.expiresAt).getTime() > now.getTime();
}
