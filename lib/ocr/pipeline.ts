import type { DocumentRecord, DocumentWithOcr } from "@/lib/documents";
import type { OcrResult } from "./types";
import { createOcrProvider, createOcrProviderMetadata } from "./provider";
import { pageRenderer } from "./page-renderer";
import { mapApplicationLanguageToOcr } from "./types";
import { OcrError } from "./types";

export interface ProcessingContext {
  document: DocumentRecord;
  buffer: ArrayBuffer;
  language: string;
}

export async function processDocumentForOcr(context: ProcessingContext): Promise<DocumentWithOcr> {
  const { document, buffer, language } = context;

  if (document.processingStatus === "FAILED") {
    throw new OcrError("OCR_FAILED", "Document processing failed", 409);
  }

  const supportedMimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff"];
  if (!supportedMimeTypes.includes(document.mimeType)) {
    throw new OcrError("UNSUPPORTED_FILE", `Unsupported MIME type: ${document.mimeType}`, 400);
  }

  const ocrLanguage = mapApplicationLanguageToOcr(language);
  const provider = createOcrProvider();
  const providerMetadata = createOcrProviderMetadata(ocrLanguage);
  const startTime = Date.now();

  let renderedPages: { pageNumber: number; buffer: ArrayBuffer; mimeType: string }[];

  if (document.mimeType === "application/pdf") {
    renderedPages = await pageRenderer.renderPdf(buffer);
  } else {
    renderedPages = [{ pageNumber: 1, buffer, mimeType: document.mimeType }];
  }

  const allPageResults: OcrResult["pages"] = [];

  for (const page of renderedPages) {
    try {
      const pageResults = await provider.processImage(page.buffer, ocrLanguage, page.pageNumber);
      allPageResults.push(...pageResults);
    } catch (error) {
      throw new OcrError("OCR_FAILED", `OCR failed on page ${page.pageNumber}: ${error instanceof Error ? error.message : "Unknown error"}`, 500);
    }
  }

  const processingDurationMs = Date.now() - startTime;

  const ocrResult: OcrResult = {
    documentId: document.id,
    sessionId: document.sessionId,
    pages: allPageResults,
    providerMetadata,
    handwritingDetected: false,
    processingDurationMs,
    createdAt: new Date().toISOString(),
  };

  return {
    ...document,
    ocrResults: [ocrResult],
    ocrStatus: "COMPLETED",
    processingStatus: "OCR_COMPLETE",
    updatedAt: new Date().toISOString(),
  };
}
