import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { processDocumentForOcr } from "@/lib/ocr/pipeline";
import { OcrError, mapApplicationLanguageToOcr, type OcrLanguageCode } from "@/lib/ocr/types";
import type { OcrResult } from "@/lib/ocr/types";

export const runtime = "nodejs";

const SUPPORTED_APP_LANGUAGES = new Set(["en", "hi", "bn", "te", "ta", "mr"]);

/**
 * POST /api/patient/documents/[id]/ocr/retry
 * Re-run OCR on a document whose OCR previously failed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      throw new OcrError("DOCUMENT_NOT_FOUND", "Document not found", 404);
    }
    if (document.sessionId !== sessionId) {
      throw new OcrError("ACCESS_DENIED", "Access denied", 403);
    }

    if (document.processingStatus !== "FAILED") {
      return NextResponse.json({ error: "Only failed OCR jobs can be retried" }, { status: 409 });
    }
    if (document.failureStage === "EXTRACTION") {
      return NextResponse.json({ error: "This document failed at extraction. Use the extraction retry instead." }, { status: 409 });
    }

    let ocrLanguage: OcrLanguageCode;
    try {
      const form = await request.formData();
      const requested = form.get("ocrLanguage");
      if (requested != null && requested !== "") {
        if (!SUPPORTED_APP_LANGUAGES.has(String(requested))) {
          throw new OcrError("UNSUPPORTED_LANGUAGE", `Unsupported OCR language: ${String(requested)}`, 400);
        }
        ocrLanguage = mapApplicationLanguageToOcr(String(requested));
      } else {
        ocrLanguage = mapApplicationLanguageToOcr(SUPPORTED_APP_LANGUAGES.has(session.language) ? session.language : "en");
      }
    } catch (error) {
      if (error instanceof OcrError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
      }
      ocrLanguage = "eng";
    }

    const buffer = await repository.getBuffer(document.id);
    if (!buffer) {
      return NextResponse.json({ error: "Document buffer not available" }, { status: 410 });
    }

    const updated = await repository.update(document.id, {
      processingStatus: "OCR_PROCESSING",
      ocrStatus: "PROCESSING",
      errors: [],
    });

    if (!updated) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    try {
      const result = await processDocumentForOcr({
        document: updated,
        buffer,
        language: ocrLanguage,
      });

      await repository.addOcrResult(document.id, result.ocrResults[0] as OcrResult);
      await repository.update(document.id, {
        processingStatus: result.processingStatus,
        ocrStatus: result.ocrStatus,
        failureStage: undefined,
      });

      return NextResponse.json({ processingStatus: result.processingStatus, ocrStatus: result.ocrStatus });
    } catch (error) {
      await repository.update(document.id, {
        processingStatus: "FAILED",
        ocrStatus: "FAILED",
        failureStage: "OCR",
        errors: [...(document.errors ?? []), error instanceof Error ? error.message : "OCR failed"],
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
