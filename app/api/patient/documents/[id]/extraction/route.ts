import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentRepository } from "@/lib/ocr/document-repository";
import { ExtractionError } from "@/lib/extraction/types";
import { EvidenceReviewPatchSchema } from "@/lib/extraction/types";
import { runExtraction } from "@/lib/extraction/engine";
import type { OcrPageInput } from "@/lib/extraction/engine";
import type { ExtractionProviderState } from "@/lib/extraction/types";

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

/**
 * POST /api/patient/documents/[id]/extraction
 * Run extraction on a document whose OCR is complete.
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

    if (document.processingStatus !== "OCR_COMPLETE") {
      throw new ExtractionError("OCR_NOT_READY", "OCR must complete before extraction", 409);
    }

    const existingRun = await documentRepository.getExtractionRun(document.id);
    if (existingRun && existingRun.extractionStatus === "PROCESSING") {
      throw new ExtractionError("EXTRACTION_IN_PROGRESS", "Extraction already in progress", 409);
    }
    if (existingRun && existingRun.extractionStatus === "COMPLETED") {
      throw new ExtractionError("EXTRACTION_ALREADY_COMPLETE", "Extraction already complete", 409);
    }

    const documentWithOcr = await documentRepository.getDocumentWithOcr(document.id);
    if (!documentWithOcr || documentWithOcr.ocrResults.length === 0) {
      throw new ExtractionError("OCR_RESULTS_MISSING", "No OCR results available", 409);
    }

    // Flatten OCR pages into extraction input.
    const pages: OcrPageInput[] = [];
    for (const result of documentWithOcr.ocrResults) {
      for (const page of result.pages) {
        pages.push({ pageNumber: page.pageNumber, extractedText: page.extractedText });
      }
    }
    if (pages.length === 0) {
      throw new ExtractionError("OCR_RESULTS_MISSING", "No OCR text available", 409);
    }

    // Mark extraction as in progress, then run.
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
        errors: [...(document.errors ?? []), error instanceof Error ? error.message : "Extraction failed"],
      });
      throw error;
    }
  } catch (error) {
    console.error("Extraction failed:", error);
    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

/**
 * GET /api/patient/documents/[id]/extraction
 * Fetch the extraction run (if any) for a document.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const run = await documentRepository.getExtractionRun(document.id);

    return NextResponse.json({
      extractionStatus: run?.extractionStatus ?? "NOT_STARTED",
      aiProviderState: (run?.aiProviderState ?? "NOT_CONFIGURED") as ExtractionProviderState,
      itemCount: run?.items.length ?? 0,
      items: run?.items ?? [],
      provider: run?.provider ?? undefined,
    });
  } catch (error) {
    console.error("Extraction status fetch failed:", error);
    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Unable to fetch extraction status" }, { status: 500 });
  }
}

/**
 * PATCH /api/patient/documents/[id]/extraction
 * Apply a single review action (Accept / Reject / Reset) to one evidence item.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ExtractionError("INVALID_REVIEW_PATCH", "Invalid request body", 400);
    }

    const parsed = EvidenceReviewPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ExtractionError("INVALID_REVIEW_PATCH", "Invalid review patch", 400);
    }

    const { itemId, verificationState } = parsed.data;

    const run = await documentRepository.getExtractionRun(document.id);
    if (!run || run.extractionStatus !== "COMPLETED") {
      throw new ExtractionError("EXTRACTION_FAILED", "No completed extraction to review", 409);
    }

    const item = run.items.find((i) => i.id === itemId);
    if (!item) {
      throw new ExtractionError("ITEM_NOT_FOUND", "Evidence item not found", 404);
    }

    const updated = await documentRepository.updateEvidenceVerification(
      document.id,
      itemId,
      verificationState,
    );

    if (!updated) {
      throw new ExtractionError("ITEM_NOT_FOUND", "Evidence item not found", 404);
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("Evidence review failed:", error);
    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Evidence review failed" }, { status: 500 });
  }
}
