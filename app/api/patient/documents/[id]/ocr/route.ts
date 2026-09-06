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

    if (document.processingStatus === "OCR_COMPLETE") {
      return NextResponse.json({ error: "OCR already completed" }, { status: 409 });
    }

    if (document.processingStatus === "OCR_PROCESSING") {
      return NextResponse.json({ error: "OCR already in progress" }, { status: 409 });
    }

    const buffer = await documentRepository.getBuffer(document.id);
    if (!buffer) {
      return NextResponse.json({ error: "Document buffer not available" }, { status: 410 });
    }

    const updated = await documentRepository.update(document.id, {
      processingStatus: "OCR_PROCESSING",
      ocrStatus: "PROCESSING",
    });

    if (!updated) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
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
        errors: [...(document.errors ?? []), error instanceof Error ? error.message : "OCR failed"],
      });

      if (error instanceof OcrError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
      }
      return NextResponse.json({ error: "OCR failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("OCR processing failed:", error);
    if (error instanceof OcrError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "OCR processing failed" }, { status: 500 });
  }
}

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
    const documentWithOcr = await documentRepository.getDocumentWithOcr(document.id);

    if (!documentWithOcr) {
      return NextResponse.json({
        id: document.id,
        ocrStatus: document.ocrStatus,
        processingStatus: document.processingStatus,
        ocrResults: [],
      });
    }

    return NextResponse.json({
      id: documentWithOcr.id,
      ocrStatus: documentWithOcr.ocrStatus,
      processingStatus: documentWithOcr.processingStatus,
      ocrResults: documentWithOcr.ocrResults,
    });
  } catch (error) {
    console.error("OCR status fetch failed:", error);
    if (error instanceof OcrError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Unable to fetch OCR status" }, { status: 500 });
  }
}

export async function POST_RETRY(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
