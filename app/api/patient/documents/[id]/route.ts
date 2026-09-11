import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db/pool";
import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";

export const runtime = "nodejs";

/**
 * DELETE /api/patient/documents/[id]
 *
 * Deletes the document, its OCR results, and its extraction run for the
 * caller's session. Clinical evidence rows survive with document_id set to
 * NULL so the physician keeps a traceable, re-reviewable record (provenance
 * stays intact) — deletion never rewrites or erases verified evidence.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const document = await repository.findById(id);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (document.sessionId !== session.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const deleted = await repository.delete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("Document delete failed:", error);
    return NextResponse.json({ error: "Unable to delete document" }, { status: 500 });
  }
}
