import type { DocumentRecord, DocumentWithOcr } from "@/lib/documents";
import type { OcrResult } from "./types";

export interface DocumentRepository {
  save(document: DocumentRecord, buffer?: ArrayBuffer): Promise<DocumentRecord>;
  findById(id: string): Promise<DocumentRecord | null>;
  findBySessionId(sessionId: string): Promise<DocumentRecord[]>;
  update(id: string, changes: Partial<DocumentRecord>): Promise<DocumentRecord | null>;
  delete(id: string): Promise<boolean>;
  getBuffer(id: string): Promise<ArrayBuffer | null>;
  addOcrResult(documentId: string, result: OcrResult): Promise<DocumentWithOcr | null>;
  getDocumentWithOcr(documentId: string): Promise<DocumentWithOcr | null>;
  getSessionDocumentsWithOcr(sessionId: string): Promise<DocumentWithOcr[]>;
}

export class InMemoryDocumentRepository implements DocumentRepository {
  private documents = new Map<string, DocumentRecord>();
  private buffers = new Map<string, ArrayBuffer>();
  private ocrResults = new Map<string, OcrResult[]>();

  async save(document: DocumentRecord, buffer?: ArrayBuffer): Promise<DocumentRecord> {
    this.documents.set(document.id, document);
    if (buffer) {
      this.buffers.set(document.id, buffer);
    }
    return document;
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    return this.documents.get(id) ?? null;
  }

  async findBySessionId(sessionId: string): Promise<DocumentRecord[]> {
    return Array.from(this.documents.values()).filter((doc) => doc.sessionId === sessionId);
  }

  async update(id: string, changes: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const existing = this.documents.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    this.documents.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.buffers.delete(id);
    this.ocrResults.delete(id);
    return this.documents.delete(id);
  }

  async getBuffer(id: string): Promise<ArrayBuffer | null> {
    return this.buffers.get(id) ?? null;
  }

  async addOcrResult(documentId: string, result: OcrResult): Promise<DocumentWithOcr | null> {
    const document = this.documents.get(documentId);
    if (!document) return null;

    const existingResults = this.ocrResults.get(documentId) ?? [];
    const updatedResults = [...existingResults, result];
    this.ocrResults.set(documentId, updatedResults);

    return {
      ...document,
      ocrResults: updatedResults,
    };
  }

  async getDocumentWithOcr(documentId: string): Promise<DocumentWithOcr | null> {
    const document = this.documents.get(documentId);
    if (!document) return null;

    const results = this.ocrResults.get(documentId) ?? [];
    return {
      ...document,
      ocrResults: results,
    };
  }

  async getSessionDocumentsWithOcr(sessionId: string): Promise<DocumentWithOcr[]> {
    const sessionDocuments = await this.findBySessionId(sessionId);
    return Promise.all(
      sessionDocuments.map(async (doc) => {
        const results = this.ocrResults.get(doc.id) ?? [];
        return { ...doc, ocrResults: results };
      }),
    );
  }
}

export const documentRepository = new InMemoryDocumentRepository();
