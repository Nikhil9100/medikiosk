import "server-only";

import type { DocumentRecord, DocumentWithOcr } from "@/lib/documents";
import type { OcrResult } from "@/lib/ocr/types";
import type {
  DocumentRepository,
} from "@/lib/ocr/document-repository";
import type {
  ExtractedEvidenceItem,
  ExtractionRun,
  EvidenceVerificationState,
} from "@/lib/extraction/types";
import { withKioskTx } from "@/lib/db/pool";
import { PostgresDocumentRepository } from "@/lib/db/documents-pg";
import type { DocumentWithExtraction } from "@/lib/ocr/document-repository";

/**
 * Binds the durable PostgreSQL document repository to ONE kiosk session.
 *
 * Every call runs inside a session-scoped transaction, so the RLS policies
 * admit only rows for this session. Routes that already validate
 * `document.sessionId === sessionId` keep their app-level check as a second
 * line of defense; assertScope adds a third: any call that names a different
 * session id than the one this repository is bound to is refused immediately.
 */
function assertScope(requested: string, bound: string) {
  if (requested !== bound) {
    throw new Error("Document repository scope mismatch");
  }
}

export class ScopedDocumentRepository implements DocumentRepository {
  constructor(private readonly sessionId: string) {}

  private run<T>(fn: (repo: PostgresDocumentRepository) => Promise<T>): Promise<T> {
    return withKioskTx(this.sessionId, async (client) => fn(new PostgresDocumentRepository(client)));
  }

  async save(document: DocumentRecord, buffer?: ArrayBuffer): Promise<DocumentRecord> {
    if (document.sessionId !== this.sessionId) {
      throw new Error("Document session mismatch");
    }
    return this.run((repo) => repo.save(this.sessionId, document, buffer));
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    return this.run((repo) => repo.findById(this.sessionId, id));
  }

  async findBySessionId(sessionId: string): Promise<DocumentRecord[]> {
    assertScope(sessionId, this.sessionId);
    return this.run((repo) => repo.findBySessionId(this.sessionId));
  }

  async update(id: string, changes: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    return this.run((repo) => repo.update(this.sessionId, id, changes));
  }

  async delete(id: string): Promise<boolean> {
    return this.run((repo) => repo.delete(this.sessionId, id));
  }

  async getBuffer(id: string): Promise<ArrayBuffer | null> {
    return this.run((repo) => repo.getBuffer(this.sessionId, id));
  }

  async addOcrResult(documentId: string, result: OcrResult): Promise<DocumentWithOcr | null> {
    return this.run((repo) => repo.addOcrResult(this.sessionId, documentId, result));
  }

  async getDocumentWithOcr(documentId: string): Promise<DocumentWithOcr | null> {
    return this.run((repo) => repo.getDocumentWithOcr(this.sessionId, documentId));
  }

  async getSessionDocumentsWithOcr(sessionId: string): Promise<DocumentWithOcr[]> {
    assertScope(sessionId, this.sessionId);
    return this.run((repo) => repo.getSessionDocumentsWithOcr(this.sessionId));
  }

  async saveExtractionRun(documentId: string, run: ExtractionRun): Promise<ExtractionRun | null> {
    return this.run((repo) => repo.saveExtractionRun(this.sessionId, documentId, run));
  }

  async getExtractionRun(documentId: string): Promise<ExtractionRun | null> {
    return this.run((repo) => repo.getExtractionRun(this.sessionId, documentId));
  }

  async getDocumentWithExtraction(documentId: string): Promise<DocumentWithExtraction | null> {
    return this.run((repo) => repo.getDocumentWithExtraction(this.sessionId, documentId));
  }

  async updateEvidenceVerification(
    documentId: string,
    itemId: string,
    verificationState: EvidenceVerificationState,
  ): Promise<ExtractedEvidenceItem | null> {
    return this.run((repo) => repo.updateEvidenceVerification(this.sessionId, documentId, itemId, verificationState));
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    assertScope(sessionId, this.sessionId);
    return this.run((repo) => repo.deleteBySessionId(this.sessionId));
  }
}

export function scopedDocumentRepository(sessionId: string): ScopedDocumentRepository {
  return new ScopedDocumentRepository(sessionId);
}
