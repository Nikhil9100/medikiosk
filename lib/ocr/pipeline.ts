import type { DocumentRecord, DocumentWithOcr } from "@/lib/documents";
import type { OcrResult } from "./types";
import { createOcrProvider, createOcrProviderMetadata } from "./provider";
import { pageRenderer } from "./page-renderer";
import { OcrError } from "./types";
import type { OcrLanguageCode } from "./types";

export interface ProcessingContext {
  document: DocumentRecord;
  buffer: ArrayBuffer;
  /** Tesseract language code, already mapped from the application language by the caller. */
  language: OcrLanguageCode;
}

/** Hard ceiling per page so a wedged OCR worker can never hold a request (or a document) forever. */
const OCR_PAGE_TIMEOUT_MS = 180_000;

async function withOcrPageTimeout<T>(promise: Promise<T>, pageNumber: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`OCR timed out on page ${pageNumber} after ${Math.round(OCR_PAGE_TIMEOUT_MS / 1000)}s`)),
          OCR_PAGE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  const ocrLanguage = language;
  const provider = createOcrProvider();
  const providerMetadata = createOcrProviderMetadata(ocrLanguage);
  const startTime = Date.now();

  let renderedPages: { pageNumber: number; buffer: ArrayBuffer; mimeType: string }[];

  try {
    if (document.mimeType === "application/pdf") {
      renderedPages = await pageRenderer.renderPdf(buffer);
    } else {
      renderedPages = [{ pageNumber: 1, buffer, mimeType: document.mimeType }];
    }

    const allPageResults: OcrResult["pages"] = [];

    for (const page of renderedPages) {
      try {
        const pageResults = await withOcrPageTimeout(
          provider.processImage(page.buffer, ocrLanguage, page.pageNumber),
          page.pageNumber,
        );
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
  } finally {
    // Release the OCR worker even on timeout/error so a wedged worker thread
    // can never leak (this sandbox is RAM-capped and the worker is per-document).
    await provider.dispose().catch(() => {});
  }
}
