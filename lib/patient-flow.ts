export const PATIENT_STEPS = [
  "welcome", "language", "consent", "identity", "start", "complaint",
  "anatomy", "symptoms", "interview", "documents", "complete"
] as const;
export type PatientStep = (typeof PATIENT_STEPS)[number];
export type PatientLanguage = "en" | "hi" | "bn" | "te" | "ta" | "mr";
export type ConsentStatus = "NOT_REVIEWED" | "ACCEPTED" | "DECLINED";
export type BodyRegion = "head" | "chest" | "abdomen" | "back" | "arm" | "hand" | "leg" | "foot" | "skin" | "other";
export type PatientBodyRegion = BodyRegion;
export type PatientBodySubregion = "front" | "back" | "left" | "right" | "upper" | "lower" | "middle" | "face" | "body";
export type Severity = "MILD" | "MODERATE" | "SEVERE" | "VERY_SEVERE";
export type InterviewState = "NOT_ASKED" | "KNOWN" | "UNKNOWN" | "DECLINED" | "DENIED";
export type InterviewFact = { questionId: string; value?: string; state: InterviewState; provenance: "PATIENT" | "VOICE" | "TOUCH" };
export type PatientWorkflow = {
  sessionId: string;
  caseId: string | null;
  language: PatientLanguage;
  consentStatus: ConsentStatus;
  currentStep: PatientStep;
  complaint: string;
  region: BodyRegion | null;
  severity: Severity | null;
  interviewFacts: Record<string, InterviewFact>;
  documents: Array<{ id: string; name: string; status: string; ocrStatus: string; extractionStatus: string }>;
};
export const defaultWorkflow: PatientWorkflow = {
  sessionId: "", caseId: null, language: "en", consentStatus: "NOT_REVIEWED",
  currentStep: "welcome", complaint: "", region: null, severity: null, interviewFacts: {}, documents: []
};
export const defaultPatientWorkflow = defaultWorkflow;
export const routeForStep: Record<PatientStep, string> = {
  welcome: "/patient", language: "/patient/language", consent: "/patient/consent",
  identity: "/patient/identity", start: "/patient/start", complaint: "/patient/complaint",
  anatomy: "/patient/anatomy", symptoms: "/patient/symptoms", interview: "/patient/interview",
  documents: "/patient/documents", complete: "/patient/complete"
};

export function caseToWorkflow(s: any): PatientWorkflow {
  return {
    sessionId: s.id,
    caseId: s.caseId,
    language: s.language,
    consentStatus: s.consentStatus,
    currentStep: s.workflowStep,
    complaint: s.complaintText ?? "",
    region: s.bodyRegion ?? null,
    severity: null,
    interviewFacts: s.interviewData ?? {},
    documents: [],
  };
}
