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

export const BodyRegionSchema = z.enum([
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

export const BodySubregionSchema = z.enum([
  "front",
  "back",
  "left",
  "right",
  "upper",
  "lower",
  "middle",
  "heel",
  "face",
  "body",
]);

export const ClinicalFactSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().optional(),
  provenance: Provenance,
  state: ClinicalValueState,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const BodyRegionSelectionSchema = z.object({
  region: BodyRegionSchema,
  subregion: BodySubregionSchema.optional(),
}).strict();

export type ClinicalFact = z.infer<typeof ClinicalFactSchema>;
export type BodyRegion = z.infer<typeof BodyRegionSchema>;
export type BodySubregion = z.infer<typeof BodySubregionSchema>;
export type BodyRegionSelection = z.infer<typeof BodyRegionSelectionSchema>;

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

export function validateBodyRegionSelection(input: unknown) {
  return BodyRegionSelectionSchema.safeParse(input);
}
