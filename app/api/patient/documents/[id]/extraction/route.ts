import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { hasAcceptedConsent, consentRequiredResponse } from "@/lib/patient-consent";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { ExtractionError, EvidenceReviewPatchSchema } from "@/lib/extraction/types";
import { flagMedicationConflictWithPatientDenial, runExtraction } from "@/lib/extraction/engine";
import type { OcrPageInput } from "@/lib/extraction/engine";
import type { ExtractionProviderState } from "@/lib/extraction/types";

export const runtime = "nodejs";

async function verifyDocumentOwnership(documentId: string, sessionId: string) {
  const repository = scopedDocumentRepository(sessionId);
  const document = await repository.findById(documentId);
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
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
    if (!hasAcceptedConsent(session)) return consentRequiredResponse();
    const sessionId = session.id;
    const repository = scopedDocumentRepository(sessionId);

    const document = await verifyDocumentOwnership(id, sessionId);

    if (document.processingStatus !== "OCR_COMPLETE") {
      throw new ExtractionError("OCR_NOT_READY", "OCR must complete before extraction", 409);
    }

    const existingRun = await repository.getExtractionRun(document.id);
    if (existingRun && existingRun.extractionStatus === "PROCESSING") {
      throw new ExtractionError("EXTRACTION_IN_PROGRESS", "Extraction already in progress", 409);
    }
    if (existingRun && existingRun.extractionStatus === "COMPLETED") {
      throw new ExtractionError("EXTRACTION_ALREADY_COMPLETE", "Extraction already complete", 409);
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
      flagMedicationConflictWithPatientDenial(run, session.interviewData);
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
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
    const repository = scopedDocumentRepository(session.id);
    const document = await verifyDocumentOwnership(id, session.id);
    const run = await repository.getExtractionRun(document.id);

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
 * Patient review is explicitly NOT physician verification: decisions land in
 * the ACCEPTED/REJECTED states and remain reviewable in the doctor console.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
    const repository = scopedDocumentRepository(session.id);
    const document = await verifyDocumentOwnership(id, session.id);

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

    const run = await repository.getExtractionRun(document.id);
    if (!run || run.extractionStatus !== "COMPLETED") {
      throw new ExtractionError("EXTRACTION_FAILED", "No completed extraction to review", 409);
    }

    const item = run.items.find((i) => i.id === itemId);
    if (!item) {
      throw new ExtractionError("ITEM_NOT_FOUND", "Evidence item not found", 404);
    }

    const updated = await repository.updateEvidenceVerification(document.id, itemId, verificationState);

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
