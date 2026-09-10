import { z } from "zod";
import type { DocumentRecord } from "@/lib/documents";

export const OcrLanguageCode = z.enum(["eng", "hin", "ben", "tel", "tam", "mar"]);

export type OcrLanguageCode = z.infer<typeof OcrLanguageCode>;

export const ApplicationToOcrLanguage: Record<string, OcrLanguageCode> = {
  en: "eng",
  hi: "hin",
  bn: "ben",
  te: "tel",
  ta: "tam",
  mr: "mar",
};

export function mapApplicationLanguageToOcr(language: string): OcrLanguageCode {
  const mapped = ApplicationToOcrLanguage[language];
  if (!mapped) {
    throw new Error(`Unsupported OCR language: ${language}`);
  }
  return mapped;
}

export const OcrProviderMetadataSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  language: OcrLanguageCode,
  createdAt: z.string().datetime(),
});

export type OcrProviderMetadata = z.infer<typeof OcrProviderMetadataSchema>;

export const OcrPageResultSchema = z.object({
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
  language: OcrLanguageCode.optional(),
});

export type OcrPageResult = z.infer<typeof OcrPageResultSchema>;

export const OcrResultSchema = z.object({
  documentId: z.string().uuid(),
  sessionId: z.string().min(1),
  pages: z.array(OcrPageResultSchema),
  providerMetadata: OcrProviderMetadataSchema,
  handwritingDetected: z.boolean().default(false),
  processingDurationMs: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
});

export type OcrResult = z.infer<typeof OcrResultSchema>;

export const OcrStatusSchema = z.enum(["NOT_STARTED", "PENDING", "PROCESSING", "COMPLETED", "FAILED", "NOT_CONFIGURED", "UNAVAILABLE"]);

export type OcrStatus = z.infer<typeof OcrStatusSchema>;

export type DocumentWithOcr = Omit<DocumentRecord, 'ocrResults'> & {
  ocrResults: OcrResult[];
};

export const OcrErrorCode = z.enum([
  "UNSUPPORTED_FILE",
  "EMPTY_FILE",
  "INVALID_DOCUMENT",
  "UNSUPPORTED_LANGUAGE",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "OCR_FAILED",
  "OCR_NOT_CONFIGURED",
  "HANDWRITING_UNSUPPORTED",
  "SESSION_NOT_FOUND",
  "DOCUMENT_NOT_FOUND",
  "ACCESS_DENIED",
]);

export type OcrErrorCode = z.infer<typeof OcrErrorCode>;

export class OcrError extends Error {
  constructor(
    public code: OcrErrorCode,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "OcrError";
  }
}
