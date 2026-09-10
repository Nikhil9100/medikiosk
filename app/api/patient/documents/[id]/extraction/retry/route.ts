import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { ExtractionError } from "@/lib/extraction/types";
import { runExtraction } from "@/lib/extraction/engine";
import type { OcrPageInput } from "@/lib/extraction/engine";
import type { ExtractionStatus } from "@/lib/extraction/types";

export const runtime = "nodejs";

const RETRYABLE_STATES = new Set<ExtractionStatus>(["FAILED", "NOT_CONFIGURED", "UNAVAILABLE", "MALFORMED_RESPONSE"]);

/**
 * POST /api/patient/documents/[id]/extraction/retry
 * Re-run structured extraction for a document whose extraction previously
 * failed or never ran (OCR must already be complete).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
    const sessionId = session.id;
    const repository = scopedDocumentRepository(sessionId);

    const document = await repository.findById(id);
    if (!document) {
      throw new ExtractionError("DOCUMENT_NOT_FOUND", "Document not found", 404);
    }
    if (document.sessionId !== sessionId) {
      throw new ExtractionError("ACCESS_DENIED", "Access denied", 403);
    }

    const extractionFailed =
      document.processingStatus === "FAILED" && document.failureStage === "EXTRACTION";
    if (
      document.processingStatus !== "OCR_COMPLETE" &&
      document.processingStatus !== "EXTRACTION_COMPLETE" &&
      !extractionFailed
    ) {
      throw new ExtractionError("OCR_NOT_READY", "OCR must complete before extraction", 409);
    }

    const existingRun = await repository.getExtractionRun(document.id);
    if (existingRun && existingRun.extractionStatus === "COMPLETED") {
      throw new ExtractionError("EXTRACTION_ALREADY_COMPLETE", "Extraction already complete", 409);
    }
    if (existingRun && existingRun.extractionStatus === "PROCESSING") {
      throw new ExtractionError("EXTRACTION_IN_PROGRESS", "Extraction already in progress", 409);
    }
    if (existingRun && !RETRYABLE_STATES.has(existingRun.extractionStatus)) {
      throw new ExtractionError("RETRY_NOT_ALLOWED", "Extraction retry not allowed in current state", 409);
    }

    const documentWithOcr = await repository.getDocumentWithOcr(document.id);
    if (!documentWithOcr || documentWithOcr.ocrResults.length === 0) {
      throw new ExtractionError("OCR_RESULTS_MISSING", "No OCR results available", 409);
    }

    const pages: OcrPageInput[] = [];
    for (const result of documentWithOcr.ocrResults) {
      for (const page of result.pages) {
        pages.push({ pageNumber: page.pageNumber, extractedText: page.extractedText });
      }
    }
    if (pages.length === 0) {
      throw new ExtractionError("OCR_RESULTS_MISSING", "No OCR text available", 409);
    }

    await repository.update(document.id, {
      processingStatus: "EXTRACTION_PROCESSING",
      extractionStatus: "PROCESSING",
      errors: [],
    });

    try {
      const { run } = await runExtraction(document.id, document.sessionId, pages);
      await repository.saveExtractionRun(document.id, run);
      await repository.update(document.id, {
        processingStatus: "EXTRACTION_COMPLETE",
        extractionStatus: "COMPLETED",
        aiProviderState: run.aiProviderState,
        failureStage: null,
      });

      return NextResponse.json({
        extractionStatus: run.extractionStatus,
        aiProviderState: run.aiProviderState,
        itemCount: run.items.length,
        items: run.items,
      });
    } catch (error) {
      await repository.update(document.id, {
        processingStatus: "FAILED",
        extractionStatus: "FAILED",
        failureStage: "EXTRACTION",
        errors: [...(document.errors ?? []), error instanceof Error ? error.message : "Extraction failed"],
      });
      throw error;
    }
  } catch (error) {
    console.error("Extraction retry failed:", error);
    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Extraction retry failed" }, { status: 500 });
  }
}
