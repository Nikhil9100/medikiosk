import { z } from "zod";

export const EvidenceCategory = z.enum([
  "DIAGNOSIS",
  "MEDICATION",
  "INVESTIGATION",
  "PROCEDURE",
  "ALLERGY",
  "MEDICAL_HISTORY",
  "CHRONOLOGY",
]);

export type EvidenceCategory = z.infer<typeof EvidenceCategory>;

export const ExtractionMethod = z.enum(["DETERMINISTIC", "AI"]);
export type ExtractionMethod = z.infer<typeof ExtractionMethod>;

export const EvidenceVerificationState = z.enum(["UNVERIFIED", "ACCEPTED", "REJECTED"]);
export type EvidenceVerificationState = z.infer<typeof EvidenceVerificationState>;

export const ExtractionProviderState = z.enum([
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "SUCCESS",
  "MALFORMED_RESPONSE",
  "FAILED",
]);

export type ExtractionProviderState = z.infer<typeof ExtractionProviderState>;

export const ExtractionStatus = z.enum([
  "NOT_STARTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "MALFORMED_RESPONSE",
]);

export type ExtractionStatus = z.infer<typeof ExtractionStatus>;

export const FailureStage = z.enum(["OCR", "EXTRACTION"]);
export type FailureStage = z.infer<typeof FailureStage>;

export const NormalizedEvidenceValueSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
  unit: z.string().optional(),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  date: z.string().optional(),
  details: z.string().optional(),
}).strict();

export type NormalizedEvidenceValue = z.infer<typeof NormalizedEvidenceValueSchema>;

export const OcrSpanSchema = z.object({
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
}).strict();

export type OcrSpan = z.infer<typeof OcrSpanSchema>;

export const ExtractionProviderMetadataSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
}).strict();

export type ExtractionProviderMetadata = z.infer<typeof ExtractionProviderMetadataSchema>;

export const ExtractedEvidenceItemSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  sessionId: z.string().min(1),
  category: EvidenceCategory,
  normalizedValue: NormalizedEvidenceValueSchema.default({}),
  originalOcrWording: z.string().min(1),
  pageNumber: z.number().int().positive(),
  ocrSpan: OcrSpanSchema.optional(),
  extractionMethod: ExtractionMethod,
  provider: ExtractionProviderMetadataSchema,
  confidence: z.number().min(0).max(1).optional(),
  verificationState: EvidenceVerificationState,
  uncertaintyNotes: z.string().optional(),
  contradictionGroupId: z.string().uuid().optional(),
}).strict();

export type ExtractedEvidenceItem = z.infer<typeof ExtractedEvidenceItemSchema>;

export const ExtractionRunSchema = z.object({
  documentId: z.string().uuid(),
  sessionId: z.string().min(1),
  items: z.array(ExtractedEvidenceItemSchema),
  extractionStatus: ExtractionStatus,
  aiProviderState: ExtractionProviderState,
  provider: ExtractionProviderMetadataSchema.optional(),
  createdAt: z.string().datetime(),
}).strict();

export type ExtractionRun = z.infer<typeof ExtractionRunSchema>;

export const EvidenceReviewPatchSchema = z.object({
  itemId: z.string().uuid(),
  verificationState: EvidenceVerificationState,
}).strict();

export type EvidenceReviewPatch = z.infer<typeof EvidenceReviewPatchSchema>;

export const ExtractionErrorCode = z.enum([
  "SESSION_NOT_FOUND",
  "DOCUMENT_NOT_FOUND",
  "ACCESS_DENIED",
  "OCR_NOT_READY",
  "OCR_RESULTS_MISSING",
  "EXTRACTION_IN_PROGRESS",
  "EXTRACTION_ALREADY_COMPLETE",
  "EXTRACTION_FAILED",
  "RETRY_NOT_ALLOWED",
  "ITEM_NOT_FOUND",
  "INVALID_REVIEW_PATCH",
]);

export type ExtractionErrorCode = z.infer<typeof ExtractionErrorCode>;

export class ExtractionError extends Error {
  constructor(
    public code: ExtractionErrorCode,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export function createUnverifiedEvidenceItem(
  input: Omit<ExtractedEvidenceItem, "verificationState" | "id"> & { id?: string },
): ExtractedEvidenceItem {
  return ExtractedEvidenceItemSchema.parse({
    ...input,
    id: input.id ?? crypto.randomUUID(),
    verificationState: "UNVERIFIED",
  });
}
