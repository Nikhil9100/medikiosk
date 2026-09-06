import { NextResponse } from "next/server";
import { createDocumentRecord, isSupportedMimeType, validateFileSize, DocumentType } from "@/lib/documents";

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

    const sessionId = "current-session";
    const document = createDocumentRecord(sessionId, file, parsedType?.data);

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
  return NextResponse.json({ documents: [] });
}
