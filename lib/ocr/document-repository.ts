import type { DocumentRecord, DocumentWithOcr } from "@/lib/documents";
import type { OcrResult } from "./types";
import type { ExtractedEvidenceItem, ExtractionRun, EvidenceVerificationState } from "@/lib/extraction/types";

export type DocumentWithExtraction = DocumentRecord & {
  ocrResults: OcrResult[];
  extractionRun: ExtractionRun | null;
};

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
  saveExtractionRun(documentId: string, run: ExtractionRun): Promise<ExtractionRun | null>;
  getExtractionRun(documentId: string): Promise<ExtractionRun | null>;
  getDocumentWithExtraction(documentId: string): Promise<DocumentWithExtraction | null>;
  updateEvidenceVerification(
    documentId: string,
    itemId: string,
    verificationState: EvidenceVerificationState,
  ): Promise<ExtractedEvidenceItem | null>;
  deleteBySessionId(sessionId: string): Promise<number>;
}

export class InMemoryDocumentRepository implements DocumentRepository {
  private documents = new Map<string, DocumentRecord>();
  private buffers = new Map<string, ArrayBuffer>();
  private ocrResults = new Map<string, OcrResult[]>();
  private extractionRuns = new Map<string, ExtractionRun>();

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
    this.extractionRuns.delete(id);
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

  async saveExtractionRun(documentId: string, run: ExtractionRun): Promise<ExtractionRun | null> {
    const document = this.documents.get(documentId);
    if (!document) return null;
    this.extractionRuns.set(documentId, run);
    return run;
  }

  async getExtractionRun(documentId: string): Promise<ExtractionRun | null> {
    return this.extractionRuns.get(documentId) ?? null;
  }

  async getDocumentWithExtraction(documentId: string): Promise<DocumentWithExtraction | null> {
    const document = this.documents.get(documentId);
    if (!document) return null;
    return {
      ...document,
      ocrResults: this.ocrResults.get(documentId) ?? [],
      extractionRun: this.extractionRuns.get(documentId) ?? null,
    };
  }

  async updateEvidenceVerification(
    documentId: string,
    itemId: string,
    verificationState: EvidenceVerificationState,
  ): Promise<ExtractedEvidenceItem | null> {
    const run = this.extractionRuns.get(documentId);
    if (!run) return null;
    const itemIndex = run.items.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return null;

    const updatedItem: ExtractedEvidenceItem = {
      ...run.items[itemIndex],
      verificationState,
    };
    const updatedItems = [...run.items];
    updatedItems[itemIndex] = updatedItem;
    this.extractionRuns.set(documentId, { ...run, items: updatedItems });
    return updatedItem;
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const toDelete: string[] = [];
    for (const [id, doc] of this.documents) {
      if (doc.sessionId === sessionId) toDelete.push(id);
    }
    for (const id of toDelete) {
      this.documents.delete(id);
      this.buffers.delete(id);
      this.ocrResults.delete(id);
      this.extractionRuns.delete(id);
    }
    return toDelete.length;
  }
}

export const documentRepository = new InMemoryDocumentRepository();
