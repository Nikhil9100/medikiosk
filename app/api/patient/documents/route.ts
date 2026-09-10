import { NextResponse } from "next/server";
import { createDocumentRecord, isSupportedMimeType, validateFileSize, DocumentType } from "@/lib/documents";
import { databaseConfigured } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";

export const runtime = "nodejs";

function detectMimeType(buffer: ArrayBuffer, declaredType: string): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "image/webp";
  }
  return declaredType;
}

export async function POST(request: Request) {
  try {
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = formData.get("documentType");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const parsedType = documentType == null ? undefined : DocumentType.safeParse(documentType);
    if (documentType != null && !parsedType?.success) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }

    if (!validateFileSize(file.size)) {
      return NextResponse.json({ error: "File is too large. Maximum size is 20MB." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const detectedMimeType = detectMimeType(buffer, file.type || "application/octet-stream");

    if (!isSupportedMimeType(detectedMimeType)) {
      return NextResponse.json({ error: `Unsupported file type: ${detectedMimeType}` }, { status: 400 });
    }

    const record = createDocumentRecord(session.id, file, parsedType?.data);
    const document = await scopedDocumentRepository(session.id).save({ ...record, mimeType: detectedMimeType }, buffer);

    return NextResponse.json(
      {
        ...document,
        mimeType: detectedMimeType,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Document upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "Session storage is not configured", code: "DB_NOT_CONFIGURED" }, { status: 503 });
    }
    const session = await getActiveKioskSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 404 });
    }

    const documents = await scopedDocumentRepository(session.id).findBySessionId(session.id);
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Document fetch failed:", error);
    return NextResponse.json({ error: "Unable to fetch documents" }, { status: 500 });
  }
}
