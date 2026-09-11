import { z } from "zod";

export const DocumentType = z.enum([
  "PRESCRIPTION",
  "LAB_REPORT",
  "IMAGING",
  "DISCHARGE_SUMMARY",
  "VACCINATION",
  "INSURANCE",
  "OTHER",
]);

export const ProcessingStatus = z.enum([
  "RECEIVED",
  "VALIDATING",
  "READY_FOR_OCR",
  "OCR_PROCESSING",
  "OCR_COMPLETE",
  "EXTRACTION_PROCESSING",
  "EXTRACTION_COMPLETE",
  "NEEDS_REVIEW",
  "VERIFIED",
  "FAILED",
]);

export const OcrStatus = z.enum([
  "NOT_STARTED",
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
]);

export const ExtractionStatus = z.enum([
  "NOT_STARTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "MALFORMED_RESPONSE",
]);

export const ExtractionProviderState = z.enum([
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "SUCCESS",
  "MALFORMED_RESPONSE",
  "FAILED",
]);

export const FailureStage = z.enum(["OCR", "EXTRACTION"]);

export const VerificationStatus = z.enum([
  "UNVERIFIED",
  "PENDING_REVIEW",
  "VERIFIED",
  "REJECTED",
]);

export const DocumentProvenance = z.enum([
  "PATIENT",
  "SYSTEM",
  "DOCTOR",
]);

export type DocumentType = z.infer<typeof DocumentType>;
export type ProcessingStatus = z.infer<typeof ProcessingStatus>;
export type OcrStatus = z.infer<typeof OcrStatus>;
export type ExtractionStatus = z.infer<typeof ExtractionStatus>;
export type ExtractionProviderState = z.infer<typeof ExtractionProviderState>;
export type FailureStage = z.infer<typeof FailureStage>;
export type VerificationStatus = z.infer<typeof VerificationStatus>;
export type DocumentProvenance = z.infer<typeof DocumentProvenance>;

export const ExtractedFactSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().optional(),
  state: z.enum(["NOT_ASKED", "KNOWN", "UNKNOWN", "DECLINED", "DENIED"]),
  provenance: z.enum(["PATIENT", "VOICE", "TOUCH", "OCR", "AI", "DOCTOR", "SYSTEM"]),
  sourceReference: z.object({
    page: z.number().optional(),
    section: z.string().optional(),
  }).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

export const DocumentRecordSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().min(1),
  documentType: DocumentType,
  originalFilename: z.string(),
  mimeType: z.string(),
  pageCount: z.number().int().positive().optional(),
  createdAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  processingStatus: ProcessingStatus,
  provenance: DocumentProvenance,
  ocrStatus: OcrStatus,
  extractionStatus: ExtractionStatus.default("NOT_STARTED"),
  aiProviderState: ExtractionProviderState.nullable().optional(),
  failureStage: FailureStage.nullable().optional(),
  verificationStatus: VerificationStatus,
  errors: z.array(z.string()).default([]),
  extractedFacts: z.array(ExtractedFactSchema).default([]),
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
});

export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;

export type DocumentWithOcr = DocumentRecord & {
  ocrResults: Array<{
    documentId: string;
    sessionId: string;
    pages: Array<{
      pageNumber: number;
      extractedText: string;
      confidence?: number;
      boundingBoxes?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        text: string;
        confidence?: number;
      }>;
      language?: string;
    }>;
    providerMetadata: {
      provider: string;
      model?: string;
      language: string;
      createdAt: string;
    };
    handwritingDetected: boolean;
    processingDurationMs?: number;
    createdAt: string;
  }>;
};

export const DocumentUploadSchema = z.object({
  file: z.instanceof(File),
  documentType: DocumentType.optional(),
}).strict();

export type DocumentUpload = z.infer<typeof DocumentUploadSchema>;

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

export function validateFileSize(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

export function createDocumentRecord(sessionId: string, file: File, documentType?: DocumentType): DocumentRecord {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    sessionId,
    documentType: documentType ?? "OTHER",
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
    pageCount: undefined,
    createdAt: now.toISOString(),
    receivedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    processingStatus: "RECEIVED",
    provenance: "PATIENT",
    ocrStatus: "NOT_STARTED",
    extractionStatus: "NOT_STARTED",
    verificationStatus: "UNVERIFIED",
    errors: [],
    extractedFacts: [],
    sourceReference: undefined,
    ocrResults: [],
  };
}

export function transitionProcessingStatus(current: ProcessingStatus, next: ProcessingStatus): boolean {
  const allowedTransitions: Record<ProcessingStatus, ProcessingStatus[]> = {
    "RECEIVED": ["VALIDATING", "FAILED"],
    "VALIDATING": ["READY_FOR_OCR", "FAILED"],
    "READY_FOR_OCR": ["OCR_PROCESSING", "FAILED"],
    "OCR_PROCESSING": ["OCR_COMPLETE", "FAILED"],
    "OCR_COMPLETE": ["EXTRACTION_PROCESSING", "FAILED"],
    "EXTRACTION_PROCESSING": ["EXTRACTION_COMPLETE", "FAILED"],
    "EXTRACTION_COMPLETE": ["NEEDS_REVIEW", "FAILED"],
    "NEEDS_REVIEW": ["FAILED"],
    "VERIFIED": ["FAILED"],
    "FAILED": ["READY_FOR_OCR", "OCR_COMPLETE", "EXTRACTION_PROCESSING"],
  };

  return allowedTransitions[current]?.includes(next) ?? false;
}

export function createExtractedFact(
  questionId: string,
  value: string | undefined,
  provenance: DocumentProvenance = "SYSTEM",
  sourceReference?: { page?: number; section?: string },
  confidence?: number,
): ExtractedFact {
  return {
    questionId,
    value,
    state: value ? "KNOWN" : "UNKNOWN",
    provenance,
    sourceReference,
    confidence,
  };
}
