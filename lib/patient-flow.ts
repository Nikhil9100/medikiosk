import { z } from "zod";

export const PatientLanguage = z.enum(["en", "hi", "bn", "te", "ta", "mr"]);
export const ConsentStatus = z.enum(["NOT_REVIEWED", "ACCEPTED", "DECLINED"]);
export const PatientStep = z.enum(["welcome", "language", "consent", "start", "complaint", "anatomy", "interview", "documents"]);
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
  interviewFacts: z.record(z.string(), z.object({
    questionId: z.string().min(1),
    value: z.string().optional(),
    state: z.enum(["NOT_ASKED", "KNOWN", "UNKNOWN", "DECLINED", "DENIED"]),
    provenance: z.enum(["PATIENT", "VOICE", "TOUCH", "OCR", "AI", "DOCTOR", "SYSTEM"]),
  })).default({}),
  documents: z.array(z.object({
    id: z.string().uuid(),
    documentType: z.enum(["PRESCRIPTION", "LAB_REPORT", "IMAGING", "DISCHARGE_SUMMARY", "VACCINATION", "INSURANCE", "OTHER"]),
    status: z.enum(["RECEIVED", "VALIDATING", "READY_FOR_OCR", "OCR_PROCESSING", "OCR_COMPLETE", "EXTRACTION_PROCESSING", "EXTRACTION_COMPLETE", "NEEDS_REVIEW", "VERIFIED", "FAILED"]),
    originalFilename: z.string(),
    mimeType: z.string(),
    pageCount: z.number().int().positive().optional(),
    createdAt: z.string().datetime(),
    receivedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    processingStatus: z.enum(["RECEIVED", "VALIDATING", "READY_FOR_OCR", "OCR_PROCESSING", "OCR_COMPLETE", "EXTRACTION_PROCESSING", "EXTRACTION_COMPLETE", "NEEDS_REVIEW", "VERIFIED", "FAILED"]),
    provenance: z.enum(["PATIENT", "SYSTEM", "DOCTOR"]),
    ocrStatus: z.enum(["NOT_STARTED", "PENDING", "PROCESSING", "COMPLETED", "FAILED", "NOT_CONFIGURED", "UNAVAILABLE"]),
    verificationStatus: z.enum(["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"]),
    errors: z.array(z.string()).default([]),
    extractedFacts: z.array(z.object({
      questionId: z.string().min(1),
      value: z.string().optional(),
      state: z.enum(["NOT_ASKED", "KNOWN", "UNKNOWN", "DECLINED", "DENIED"]),
      provenance: z.enum(["PATIENT", "VOICE", "TOUCH", "OCR", "AI", "DOCTOR", "SYSTEM"]),
      sourceReference: z.object({
        page: z.number().optional(),
        section: z.string().optional(),
      }).optional(),
      confidence: z.number().min(0).max(1).optional(),
    })).default([]),
    sourceReference: z.object({
      page: z.number().optional(),
      section: z.string().optional(),
    }).optional(),
    ocrResults: z.array(z.object({
      documentId: z.string().uuid(),
      sessionId: z.string().min(1),
      pages: z.array(z.object({
        pageNumber: z.number().int().positive(),
        extractedText: z.string(),
        confidence: z.number().min(0).max(1).optional(),
        boundingBoxes: z.array(z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          text: z.string(),
          confidence: z.number().min(0).max(1).optional(),
        })).optional(),
        language: z.string().optional(),
      })),
      providerMetadata: z.object({
        provider: z.string().min(1),
        model: z.string().min(1).optional(),
        language: z.string().min(1),
        createdAt: z.string().datetime(),
      }),
      handwritingDetected: z.boolean().default(false),
      processingDurationMs: z.number().int().nonnegative().optional(),
      createdAt: z.string().datetime(),
    })).default([]),
  })).default([]),
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
  interviewFacts: {},
  documents: [],
};

export function nextStep(step: PatientStep, consentStatus: ConsentStatus): PatientStep {
  if (step === "welcome") return "language";
  if (step === "language") return "consent";
  if (step === "consent" && consentStatus === "ACCEPTED") return "start";
  if (step === "start") return "complaint";
  if (step === "complaint") return "anatomy";
  if (step === "anatomy") return "interview";
  if (step === "interview") return "documents";
  return step;
}

export function previousStep(step: PatientStep): PatientStep {
  if (step === "language") return "welcome";
  if (step === "consent") return "language";
  if (step === "start") return "consent";
  if (step === "complaint") return "start";
  if (step === "anatomy") return "complaint";
  if (step === "interview") return "anatomy";
  if (step === "documents") return "interview";
  return "welcome";
}
