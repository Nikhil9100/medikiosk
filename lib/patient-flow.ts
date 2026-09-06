import { z } from "zod";

export const PatientLanguage = z.enum(["en", "hi", "bn", "te", "ta", "mr"]);
export const ConsentStatus = z.enum(["NOT_REVIEWED", "ACCEPTED", "DECLINED"]);
export const PatientStep = z.enum(["welcome", "language", "consent", "start", "complaint", "anatomy"]);
export const PatientBodyRegion = z.enum(["head", "chest", "abdomen", "back", "arm", "hand", "leg", "foot", "skin", "other"]);
export const PatientBodySubregion = z.enum(["front", "back", "left", "right", "upper", "lower", "middle", "face", "body"]);

export const PatientWorkflowSchema = z.object({
  language: PatientLanguage,
  currentStep: PatientStep,
  consentStatus: ConsentStatus,
  sessionId: z.string().min(1),
  complaint: z.string().default(""),
  selectedRegion: PatientBodyRegion.nullable().default(null),
  selectedSubregion: PatientBodySubregion.nullable().default(null),
});

export type PatientLanguage = z.infer<typeof PatientLanguage>;
export type ConsentStatus = z.infer<typeof ConsentStatus>;
export type PatientStep = z.infer<typeof PatientStep>;
export type PatientBodyRegion = z.infer<typeof PatientBodyRegion>;
export type PatientBodySubregion = z.infer<typeof PatientBodySubregion>;
export type PatientWorkflow = z.infer<typeof PatientWorkflowSchema>;

export const defaultPatientWorkflow: PatientWorkflow = {
  language: "en",
  currentStep: "welcome",
  consentStatus: "NOT_REVIEWED",
  sessionId: "",
  complaint: "",
  selectedRegion: null,
  selectedSubregion: null,
};

export function nextStep(step: PatientStep, consentStatus: ConsentStatus): PatientStep {
  if (step === "welcome") return "language";
  if (step === "language") return "consent";
  if (step === "consent" && consentStatus === "ACCEPTED") return "start";
  if (step === "start") return "complaint";
  if (step === "complaint") return "anatomy";
  return step;
}

export function previousStep(step: PatientStep): PatientStep {
  if (step === "language") return "welcome";
  if (step === "consent") return "language";
  if (step === "start") return "consent";
  if (step === "complaint") return "start";
  if (step === "anatomy") return "complaint";
  return "welcome";
}
