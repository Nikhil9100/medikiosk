import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDocumentRepository } from "./document-repository";
import { createDocumentRecord, type DocumentRecord } from "@/lib/documents";

function makeDocument(sessionId: string, filename: string): DocumentRecord {
  return createDocumentRecord(sessionId, new File(["content"], filename, { type: "application/pdf" }));
}

describe("InMemoryDocumentRepository.deleteBySessionId", () => {
  let repo: InMemoryDocumentRepository;

  beforeEach(() => {
    repo = new InMemoryDocumentRepository();
  });

  it("purges every document, buffer, OCR result and extraction run for the session", async () => {
    const docA1 = makeDocument("session-a", "a1.pdf");
    const docA2 = makeDocument("session-a", "a2.pdf");
    const docB = makeDocument("session-b", "b.pdf");

    await repo.save(docA1, new Uint8Array([1, 2, 3]).buffer as ArrayBuffer);
    await repo.save(docA2);
    await repo.save(docB);

    // Populate OCR + extraction state for one of session A's documents.
    await repo.addOcrResult(docA1.id, {
      documentId: docA1.id,
      sessionId: "session-a",
      pages: [{ pageNumber: 1, extractedText: "text", confidence: 0.9 }],
      providerMetadata: { provider: "tesseract", language: "eng", createdAt: new Date().toISOString() },
      handwritingDetected: false,
      createdAt: new Date().toISOString(),
    });
    await repo.saveExtractionRun(docA1.id, {
      documentId: docA1.id,
      sessionId: "session-a",
      items: [],
      extractionStatus: "COMPLETED",
      aiProviderState: "SUCCESS",
      createdAt: new Date().toISOString(),
    });

    const deleted = await repo.deleteBySessionId("session-a");

    expect(deleted).toBe(2);
    expect(await repo.findById(docA1.id)).toBeNull();
    expect(await repo.findById(docA2.id)).toBeNull();
    expect(await repo.getBuffer(docA1.id)).toBeNull();
    expect(await repo.getDocumentWithOcr(docA1.id)).toBeNull();
    expect(await repo.getExtractionRun(docA1.id)).toBeNull();

    // The other session's documents are untouched.
    expect(await repo.findById(docB.id)).not.toBeNull();
    expect(await repo.findBySessionId("session-b")).toHaveLength(1);
  });

  it("returns 0 when the session has no documents", async () => {
    expect(await repo.deleteBySessionId("session-empty")).toBe(0);
  });

  it("is idempotent when called repeatedly", async () => {
    const docA = makeDocument("session-a", "a.pdf");
    await repo.save(docA);

    await repo.deleteBySessionId("session-a");
    await repo.deleteBySessionId("session-a");

    expect(await repo.findBySessionId("session-a")).toHaveLength(0);
  });
});
