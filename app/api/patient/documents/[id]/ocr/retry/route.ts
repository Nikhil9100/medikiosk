import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentRepository } from "@/lib/ocr/document-repository";
import { processDocumentForOcr } from "@/lib/ocr/pipeline";
import { OcrError } from "@/lib/ocr/types";
import type { OcrResult } from "@/lib/ocr/types";

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
    throw new OcrError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  }
  if (document.sessionId !== sessionId) {
    throw new OcrError("ACCESS_DENIED", "Access denied", 403);
  }
  return document;
}

/**
 * POST /api/patient/documents/[id]/ocr/retry
 * Re-run OCR on a document whose OCR previously failed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    if (document.processingStatus !== "FAILED") {
      return NextResponse.json({ error: "Only failed OCR jobs can be retried" }, { status: 409 });
    }

    // OCR retry is only for OCR-stage failures. A document that failed at
    // extraction (failureStage EXTRACTION) already completed OCR; re-running OCR
    // here would duplicate its OCR results. Those documents retry via the
    // extraction retry route instead.
    if (document.failureStage === "EXTRACTION") {
      return NextResponse.json({ error: "OCR cannot retry after an extraction failure" }, { status: 409 });
    }

    const updated = await documentRepository.update(document.id, {
      processingStatus: "READY_FOR_OCR",
      ocrStatus: "PENDING",
      errors: [],
    });

    if (!updated) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const buffer = await documentRepository.getBuffer(document.id);
    if (!buffer) {
      return NextResponse.json({ error: "Document buffer not available" }, { status: 410 });
    }

    try {
      const result = await processDocumentForOcr({
        document: updated,
        buffer,
        language: "en",
      });

      await documentRepository.addOcrResult(document.id, result.ocrResults[0] as OcrResult);
      await documentRepository.update(document.id, {
        processingStatus: result.processingStatus,
        ocrStatus: result.ocrStatus,
      });

      return NextResponse.json({ status: result.processingStatus, ocrStatus: result.ocrStatus });
    } catch (error) {
      await documentRepository.update(document.id, {
        processingStatus: "FAILED",
        ocrStatus: "FAILED",
        failureStage: "OCR",
        errors: [...(updated.errors ?? []), error instanceof Error ? error.message : "OCR failed"],
      });

      if (error instanceof OcrError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "OCR retry failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("OCR retry failed:", error);
    if (error instanceof OcrError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "OCR retry failed" }, { status: 500 });
  }
}
