import { z } from "zod";

export const PatientLanguage = z.enum(["en", "hi", "bn", "te", "ta", "mr"]);
export const ConsentStatus = z.enum(["NOT_REVIEWED", "ACCEPTED", "DECLINED"]);
export const PatientStep = z.enum(["welcome", "language", "consent", "start"]);

export const PatientWorkflowSchema = z.object({
  language: PatientLanguage,
  currentStep: PatientStep,
  consentStatus: ConsentStatus,
  sessionId: z.string().min(1),
});

export type PatientLanguage = z.infer<typeof PatientLanguage>;
export type ConsentStatus = z.infer<typeof ConsentStatus>;
export type PatientStep = z.infer<typeof PatientStep>;
export type PatientWorkflow = z.infer<typeof PatientWorkflowSchema>;

export const defaultPatientWorkflow: PatientWorkflow = {
  language: "en",
  currentStep: "welcome",
  consentStatus: "NOT_REVIEWED",
  sessionId: "",
};

export function nextStep(step: PatientStep, consentStatus: ConsentStatus): PatientStep {
  if (step === "welcome") return "language";
  if (step === "language") return "consent";
  if (step === "consent" && consentStatus === "ACCEPTED") return "start";
  return step;
}

export function previousStep(step: PatientStep): PatientStep {
  if (step === "language") return "welcome";
  if (step === "consent") return "language";
  if (step === "start") return "consent";
  return "welcome";
}
