import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { processDocumentForOcr } from "@/lib/ocr/pipeline";
import { OcrError, mapApplicationLanguageToOcr, type OcrLanguageCode } from "@/lib/ocr/types";
import type { OcrResult } from "@/lib/ocr/types";

export const runtime = "nodejs";

const SUPPORTED_APP_LANGUAGES = new Set(["en", "hi", "bn", "te", "ta", "mr"]);

async function resolveOcrLanguage(form: FormData, sessionLanguage: string): Promise<OcrLanguageCode> {
  const requested = form.get("ocrLanguage");
  if (requested != null && requested !== "") {
    const lang = String(requested);
    if (!SUPPORTED_APP_LANGUAGES.has(lang)) {
      throw new OcrError("UNSUPPORTED_LANGUAGE", `Unsupported OCR language: ${lang}`, 400);
    }
    return mapApplicationLanguageToOcr(lang);
  }
  return mapApplicationLanguageToOcr(SUPPORTED_APP_LANGUAGES.has(sessionLanguage) ? sessionLanguage : "en");
}

async function verifyDocumentOwnership(documentId: string, sessionId: string) {
  const repository = scopedDocumentRepository(sessionId);
  const document = await repository.findById(documentId);
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
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
    const sessionId = session.id;

    const document = await verifyDocumentOwnership(id, sessionId);

    if (document.processingStatus === "OCR_COMPLETE") {
      return NextResponse.json({ error: "OCR already completed" }, { status: 409 });
    }
    if (document.processingStatus === "OCR_PROCESSING") {
      return NextResponse.json({ error: "OCR already in progress" }, { status: 409 });
    }
    if (document.processingStatus === "FAILED" && document.failureStage === "EXTRACTION") {
      return NextResponse.json({ error: "OCR cannot restart after an extraction failure" }, { status: 409 });
    }

    let ocrLanguage: OcrLanguageCode;
    try {
      ocrLanguage = await resolveOcrLanguage(await request.formData(), session.language);
    } catch (error) {
      if (error instanceof OcrError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
      }
      ocrLanguage = "eng";
    }

    const repository = scopedDocumentRepository(sessionId);
    const buffer = await repository.getBuffer(document.id);
    if (!buffer) {
      return NextResponse.json({ error: "Document buffer not available" }, { status: 410 });
    }

    const updated = await repository.update(document.id, {
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
        language: ocrLanguage,
      });

      await repository.addOcrResult(document.id, result.ocrResults[0] as OcrResult);
      await repository.update(document.id, {
        processingStatus: result.processingStatus,
        ocrStatus: result.ocrStatus,
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
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }
    const sessionId = session.id;

    const document = await verifyDocumentOwnership(id, sessionId);
    const repository = scopedDocumentRepository(sessionId);
    const documentWithOcr = await repository.getDocumentWithOcr(document.id);

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
