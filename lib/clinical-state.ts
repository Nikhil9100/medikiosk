import { z } from "zod";

export const ClinicalValueState = z.enum([
  "KNOWN",
  "UNKNOWN",
  "NOT_ASKED",
  "DECLINED",
  "DENIED",
]);

export const Provenance = z.enum([
  "PATIENT",
  "VOICE",
  "TOUCH",
  "OCR",
  "AI",
  "DOCTOR",
  "SYSTEM",
]);

export const ClinicalFactSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().min(1),
  provenance: Provenance,
  state: ClinicalValueState,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type ClinicalFact = z.infer<typeof ClinicalFactSchema>;

export type PatientSession = {
  id: string;
  patientId: string;
  language: "en" | "hi";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function createPatientSession(patientId: string): PatientSession {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    patientId,
    language: "en",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateClinicalFact(input: unknown) {
  return ClinicalFactSchema.safeParse(input);
}
