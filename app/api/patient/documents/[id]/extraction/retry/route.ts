import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentRepository } from "@/lib/ocr/document-repository";
import { ExtractionError } from "@/lib/extraction/types";
import { runExtraction } from "@/lib/extraction/engine";
import type { OcrPageInput } from "@/lib/extraction/engine";

export const runtime = "nodejs";

const sessionCookie = "medikiosk_session";

async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookie)?.value ?? null;
}

async function getAuthenticatedSession() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null };
  return { user: data.user };
}

async function verifyDocumentOwnership(documentId: string, sessionId: string) {
  const document = await documentRepository.findById(documentId);
  if (!document) {
    throw new ExtractionError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  }
  if (document.sessionId !== sessionId) {
    throw new ExtractionError("ACCESS_DENIED", "Access denied", 403);
  }
  return document;
}

const RETRYABLE_STATES = new Set(["FAILED", "MALFORMED_RESPONSE", "UNAVAILABLE"]);

/**
 * POST /api/patient/documents/[id]/extraction/retry
 * Re-run extraction after a failed or malformed attempt.
 *
 * This is intentionally separate from the OCR retry route: retrying
 * extraction never re-runs OCR.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { user } = await getAuthenticatedSession();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const sessionId = await getSessionId();
    if (!sessionId) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }

    const document = await verifyDocumentOwnership(id, sessionId);

    // Extraction retry requires completed OCR and a retryable extraction state.
    // A document whose extraction failed is left at FAILED with failureStage EXTRACTION
    // (OCR already completed), so it is retryable here and not via the OCR retry route.
    const extractionFailed =
      document.processingStatus === "FAILED" && document.failureStage === "EXTRACTION";
    if (
      document.processingStatus !== "OCR_COMPLETE" &&
      document.processingStatus !== "EXTRACTION_COMPLETE" &&
      !extractionFailed
    ) {
      throw new ExtractionError("OCR_NOT_READY", "OCR must complete before extraction", 409);
    }

    const existingRun = await documentRepository.getExtractionRun(document.id);
    if (existingRun && existingRun.extractionStatus === "COMPLETED") {
      throw new ExtractionError("EXTRACTION_ALREADY_COMPLETE", "Extraction already complete", 409);
    }
    if (existingRun && existingRun.extractionStatus === "PROCESSING") {
      throw new ExtractionError("EXTRACTION_IN_PROGRESS", "Extraction already in progress", 409);
    }
    if (existingRun && !RETRYABLE_STATES.has(existingRun.extractionStatus)) {
      throw new ExtractionError("RETRY_NOT_ALLOWED", "Extraction retry not allowed in current state", 409);
    }

    const documentWithOcr = await documentRepository.getDocumentWithOcr(document.id);
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

    await documentRepository.update(document.id, {
      processingStatus: "EXTRACTION_PROCESSING",
      extractionStatus: "PROCESSING",
      errors: [],
    });

    try {
      const { run } = await runExtraction(document.id, document.sessionId, pages);
      await documentRepository.saveExtractionRun(document.id, run);
      await documentRepository.update(document.id, {
        processingStatus: "EXTRACTION_COMPLETE",
        extractionStatus: "COMPLETED",
        aiProviderState: run.aiProviderState,
        failureStage: undefined,
      });

      return NextResponse.json({
        extractionStatus: run.extractionStatus,
        aiProviderState: run.aiProviderState,
        itemCount: run.items.length,
        items: run.items,
      });
    } catch (error) {
      await documentRepository.update(document.id, {
        processingStatus: "FAILED",
        extractionStatus: "FAILED",
        failureStage: "EXTRACTION",
        errors: [...(document.errors ?? []), error instanceof Error ? error.message : "Extraction retry failed"],
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
