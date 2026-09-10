import "server-only";

import type { PoolClient } from "pg";
import type { DocumentRecord, DocumentWithOcr } from "@/lib/documents";
import type { OcrResult } from "@/lib/ocr/types";
import type {
  ExtractedEvidenceItem,
  ExtractionRun,
  EvidenceVerificationState,
} from "@/lib/extraction/types";
import { writeAudit } from "./audit";

/**
 * Durable PostgreSQL implementation of the DocumentRepository contract.
 *
 * All reads/writes are issued from a client already scoped by RLS to the
 * caller's session (or staff), so ownership is enforced twice: at the
 * application layer (explicit session_id predicates) and by the database.
 */

type DocRow = {
  id: string;
  session_id: string;
  document_type: string;
  status: string;
  original_filename: string;
  mime_type: string;
  file_size: number | null;
  page_count: number | null;
  content: Buffer | null;
  provenance: string;
  ocr_status: string;
  extraction_status: string;
  ai_provider_state: string | null;
  failure_stage: string | null;
  verification_status: string;
  errors: string[];
  extracted_facts: unknown[];
  created_at: Date;
  received_at: Date;
  updated_at: Date;
};

const docColumns = `id, session_id, document_type, status, original_filename, mime_type,
  file_size, page_count, provenance, ocr_status, extraction_status, ai_provider_state,
  failure_stage, verification_status, errors, extracted_facts, created_at, received_at, updated_at`;

function toDocumentRecord(row: DocRow): DocumentRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    documentType: row.document_type as DocumentRecord["documentType"],
    status: row.status as DocumentRecord["status"],
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    pageCount: row.page_count ?? undefined,
    createdAt: row.created_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    processingStatus: row.status as DocumentRecord["processingStatus"],
    provenance: row.provenance as DocumentRecord["provenance"],
    ocrStatus: row.ocr_status as DocumentRecord["ocrStatus"],
    extractionStatus: row.extraction_status as DocumentRecord["extractionStatus"],
    aiProviderState: (row.ai_provider_state as DocumentRecord["aiProviderState"] | undefined) ?? undefined,
    failureStage: (row.failure_stage as DocumentRecord["failureStage"] | undefined) ?? undefined,
    verificationStatus: row.verification_status as DocumentRecord["verificationStatus"],
    errors: row.errors ?? [],
    extractedFacts: (row.extracted_facts ?? []) as DocumentRecord["extractedFacts"],
    ocrResults: [],
  };
}

async function fetchDocument(client: PoolClient, sessionId: string, id: string) {
  const result = await client.query(`SELECT ${docColumns} FROM documents WHERE session_id = $1 AND id = $2`, [sessionId, id]);
  return result.rows.length > 0 ? (result.rows[0] as DocRow) : null;
}

export class PostgresDocumentRepository {
  constructor(private readonly client: PoolClient) {}

  async save(sessionId: string, document: DocumentRecord, buffer?: ArrayBuffer): Promise<DocumentRecord> {
    const result = await this.client.query(
      `INSERT INTO documents
         (id, session_id, document_type, status, original_filename, mime_type, file_size,
          page_count, content, provenance, ocr_status, extraction_status, verification_status,
          errors, extracted_facts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${docColumns}`,
      [
        document.id,
        sessionId,
        document.documentType,
        document.status,
        document.originalFilename,
        document.mimeType,
        buffer ? Buffer.byteLength(buffer) : null,
        document.pageCount ?? null,
        buffer ? Buffer.from(buffer) : null,
        document.provenance,
        document.ocrStatus,
        document.extractionStatus,
        document.verificationStatus,
        JSON.stringify(document.errors ?? []),
        JSON.stringify(document.extractedFacts ?? []),
      ],
    );
    const row = result.rows[0] as DocRow;
    return { ...toDocumentRecord(row), ocrResults: [] };
  }

  async findById(sessionId: string, id: string): Promise<DocumentRecord | null> {
    const row = await fetchDocument(this.client, sessionId, id);
    return row ? toDocumentRecord(row) : null;
  }

  async findBySessionId(sessionId: string): Promise<DocumentRecord[]> {
    const result = await this.client.query(
      `SELECT ${docColumns} FROM documents WHERE session_id = $1 ORDER BY created_at`,
      [sessionId],
    );
    return result.rows.map((row) => toDocumentRecord(row as DocRow));
  }

  async update(sessionId: string, id: string, changes: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const fieldMap: Record<string, string> = {
      status: "status",
      documentType: "document_type",
      ocrStatus: "ocr_status",
      extractionStatus: "extraction_status",
      aiProviderState: "ai_provider_state",
      failureStage: "failure_stage",
      verificationStatus: "verification_status",
      pageCount: "page_count",
    };
    for (const [key, column] of Object.entries(fieldMap)) {
      const value = (changes as Record<string, unknown>)[key];
      // failure_stage / ai_provider_state may be explicitly cleared with null
      // (retry success); every other field treats null as "not provided".
      const clearable = key === "failureStage" || key === "aiProviderState";
      if (clearable ? value !== undefined : value != null) {
        sets.push(`${column} = $${values.push(value ?? null)}`);
      }
    }
    if (changes.errors !== undefined) sets.push(`errors = $${values.push(JSON.stringify(changes.errors))}`);
    if (changes.extractedFacts !== undefined) sets.push(`extracted_facts = $${values.push(JSON.stringify(changes.extractedFacts))}`);
    if (sets.length === 0) return this.findById(sessionId, id);
    values.push(sessionId, id);
    const result = await this.client.query(
      `UPDATE documents SET ${sets.join(", ")} WHERE session_id = $${values.length - 1} AND id = $${values.length}
       RETURNING ${docColumns}`,
      values,
    );
    return result.rows.length > 0 ? toDocumentRecord(result.rows[0] as DocRow) : null;
  }

  /**
   * Delete one document. OCR results and extraction runs cascade; clinical
   * evidence rows survive with document_id set to NULL so the physician keeps
   * a traceable, re-reviewable record (provenance stays intact).
   */
  async delete(sessionId: string, id: string): Promise<boolean> {
    const result = await this.client.query(
      `DELETE FROM documents WHERE session_id = $1 AND id = $2`,
      [sessionId, id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getBuffer(sessionId: string, id: string): Promise<ArrayBuffer | null> {
    const result = await this.client.query(
      `SELECT content FROM documents WHERE session_id = $1 AND id = $2`,
      [sessionId, id],
    );
    const content = result.rows[0]?.content as Buffer | null;
    if (!content) return null;
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  }

  async addOcrResult(sessionId: string, documentId: string, result: OcrResult): Promise<DocumentWithOcr | null> {
    await this.client.query(
      `INSERT INTO ocr_results (document_id, session_id, payload) VALUES ($1, $2, $3)`,
      [documentId, sessionId, JSON.stringify(result)],
    );
    const document = await this.findById(sessionId, documentId);
    if (!document) return null;
    const ocrResults = await this.listOcrResults(sessionId, documentId);
    return { ...document, ocrResults };
  }

  async listOcrResults(sessionId: string, documentId: string): Promise<OcrResult[]> {
    const result = await this.client.query(
      `SELECT payload FROM ocr_results WHERE session_id = $1 AND document_id = $2 ORDER BY created_at`,
      [sessionId, documentId],
    );
    return result.rows.map((row) => row.payload as OcrResult);
  }

  async getDocumentWithOcr(sessionId: string, documentId: string): Promise<DocumentWithOcr | null> {
    const document = await this.findById(sessionId, documentId);
    if (!document) return null;
    return { ...document, ocrResults: await this.listOcrResults(sessionId, documentId) };
  }

  async getSessionDocumentsWithOcr(sessionId: string): Promise<DocumentWithOcr[]> {
    const documents = await this.findBySessionId(sessionId);
    return Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        ocrResults: await this.listOcrResults(sessionId, doc.id),
      })),
    );
  }

  async saveExtractionRun(sessionId: string, documentId: string, run: ExtractionRun): Promise<ExtractionRun | null> {
    const document = await this.findById(sessionId, documentId);
    if (!document) return null;
    await this.client.query(
      `INSERT INTO document_extractions (document_id, session_id, payload) VALUES ($1, $2, $3)`,
      [documentId, sessionId, JSON.stringify(run)],
    );
    await materializeEvidence(this.client, sessionId, documentId, run);
    return run;
  }

  async getExtractionRun(sessionId: string, documentId: string): Promise<ExtractionRun | null> {
    const result = await this.client.query(
      `SELECT payload FROM document_extractions WHERE session_id = $1 AND document_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [sessionId, documentId],
    );
    return result.rows.length > 0 ? (result.rows[0].payload as ExtractionRun) : null;
  }

  async getDocumentWithExtraction(sessionId: string, documentId: string) {
    const document = await this.findById(sessionId, documentId);
    if (!document) return null;
    return {
      ...document,
      ocrResults: await this.listOcrResults(sessionId, documentId),
      extractionRun: await this.getExtractionRun(sessionId, documentId),
    };
  }

  /**
   * Apply a verification decision to one evidence item. Verification is a
   * human (doctor) act; the repository records who verified when.
   */
  async updateEvidenceVerification(
    sessionId: string,
    documentId: string,
    itemId: string,
    verificationState: EvidenceVerificationState,
    verifier?: { staffId: string; note?: string },
  ): Promise<ExtractedEvidenceItem | null> {
    const result = await this.client.query(
      `UPDATE clinical_evidence
          SET verification_state = $1,
              verified_by = $2,
              verified_at = $3,
              verification_note = $4
        WHERE session_id = $5 AND document_id = $6 AND id = $7
        RETURNING *`,
      [verificationState, verifier?.staffId ?? null, new Date().toISOString(), verifier?.note ?? null,
       sessionId, documentId, itemId],
    );
    if (result.rows.length === 0) return null;
    if (verifier) {
      await writeAudit(this.client, { type: "STAFF", id: verifier.staffId }, "evidence.verified", {
        type: "evidence",
        id: itemId,
      }, { state: verificationState, note: verifier.note ?? null });
    }
    // Patient review only writes UNVERIFIED/ACCEPTED/REJECTED, so the
    // narrower patient-facing type holds here; doctor verification uses the
    // wider EvidenceRow type via the staff endpoints.
    return evidenceRowToItem(result.rows[0]) as unknown as ExtractedEvidenceItem;
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const result = await this.client.query(`DELETE FROM documents WHERE session_id = $1`, [sessionId]);
    return result.rowCount ?? 0;
  }
}

/**
 * Materialize extraction items into clinical_evidence rows (the normalized,
 * doctor-reviewable layer). Existing rows for the same (document, run) items
 * are updated in place so verification decisions survive re-runs: item ids are
 * stable across extraction runs for the same source span.
 */
export async function materializeEvidence(
  client: PoolClient,
  sessionId: string,
  documentId: string,
  run: ExtractionRun,
): Promise<void> {
  for (const item of run.items) {
    await client.query(
      `INSERT INTO clinical_evidence
         (id, session_id, document_id, category, normalized_value, original_wording,
          page_number, ocr_span, confidence, extraction_method, provenance, provider,
          uncertainty_notes, contradiction_group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         normalized_value = EXCLUDED.normalized_value,
         original_wording = EXCLUDED.original_wording,
         page_number = EXCLUDED.page_number,
         ocr_span = EXCLUDED.ocr_span,
         confidence = EXCLUDED.confidence,
         extraction_method = EXCLUDED.extraction_method,
         provider = EXCLUDED.provider,
         uncertainty_notes = EXCLUDED.uncertainty_notes,
         contradiction_group_id = EXCLUDED.contradiction_group_id`,
      [
        item.id,
        sessionId,
        documentId,
        item.category,
        JSON.stringify(item.normalizedValue ?? {}),
        item.originalOcrWording ?? null,
        item.pageNumber,
        item.ocrSpan ? JSON.stringify(item.ocrSpan) : null,
        item.confidence ?? null,
        item.extractionMethod,
        "OCR",
        item.provider ? JSON.stringify(item.provider) : null,
        item.uncertaintyNotes ?? null,
        item.contradictionGroupId ?? null,
      ],
    );
  }
}

/**
 * Evidence row as read by the doctor console. `verificationState` is wider
 * than the patient-facing type: the database also stores VERIFIED /
 * PENDING_REVIEW, which only the physician path can write.
 */
export type EvidenceRow = Omit<ExtractedEvidenceItem, "verificationState"> & {
  verificationState: "UNVERIFIED" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED" | "ACCEPTED";
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  documentFilename?: string | null;
  documentOcrStatus?: string | null;
};

export function evidenceRowToItem(row: Record<string, unknown>): EvidenceRow {
  const item: EvidenceRow = {
    id: row.id as string,
    documentId: (row.document_id as string | null) ?? "",
    sessionId: row.session_id as string,
    category: row.category as ExtractedEvidenceItem["category"],
    normalizedValue: (row.normalized_value as Record<string, unknown> | null) ?? {},
    originalOcrWording: (row.original_wording as string | null) ?? "",
    pageNumber: (row.page_number as number | null) ?? 1,
    ocrSpan: row.ocr_span as ExtractedEvidenceItem["ocrSpan"],
    extractionMethod: row.extraction_method as ExtractedEvidenceItem["extractionMethod"],
    provider: (row.provider as ExtractedEvidenceItem["provider"] | null) ?? {
      name: "deterministic",
      createdAt: new Date(0).toISOString(),
    },
    confidence: row.confidence === null ? undefined : Number(row.confidence),
    verificationState: row.verification_state as ExtractedEvidenceItem["verificationState"],
    uncertaintyNotes: (row.uncertainty_notes as string | null) ?? undefined,
    contradictionGroupId: (row.contradiction_group_id as string | null) ?? undefined,
  };
  if (row.verified_by) item.verifiedBy = row.verified_by as string;
  if (row.verified_at) item.verifiedAt = new Date(row.verified_at as string | Date).toISOString();
  if (row.verification_note) item.verificationNote = row.verification_note as string;
  if (row.document_filename !== undefined) item.documentFilename = row.document_filename as string | null;
  if (row.document_ocr_status !== undefined) item.documentOcrStatus = row.document_ocr_status as string | null;
  return item;
}

export async function listEvidenceForSession(client: PoolClient, sessionId: string) {
  const result = await client.query(
    `SELECT e.*, d.original_filename AS document_filename, d.ocr_status AS document_ocr_status
       FROM clinical_evidence e
       LEFT JOIN documents d ON d.id = e.document_id
      WHERE e.session_id = $1
      ORDER BY e.created_at, e.category`,
    [sessionId],
  );
  return result.rows.map((row) => ({
    ...evidenceRowToItem(row),
    documentFilename: row.document_filename as string | null,
    documentOcrStatus: row.document_ocr_status as string | null,
  }));
}
