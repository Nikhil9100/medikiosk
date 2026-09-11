import "server-only";

import type { PoolClient } from "pg";
import { relevanceGate } from "@/lib/assistant-reply";

/**
 * RAG knowledge-base access. AYURVEDA and MODERN_MEDICINE are separate
 * corpora: rows carry a `corpus` discriminator and retrieval is always
 * filtered to exactly one corpus, so the two systems of knowledge are never
 * blended inside a single result set.
 */

export type KnowledgeCorpus = "AYURVEDA" | "MODERN_MEDICINE";

export type KnowledgeDocument = {
  id: string;
  corpus: KnowledgeCorpus;
  corpusVersion: string;
  title: string;
  source: string;
  author: string | null;
  section: string | null;
  year: string | null;
  license: string;
  language: string;
  content: string;
  metadata: Record<string, unknown>;
  ingestedAt: Date;
};

export type RetrievedChunk = {
  chunkId: number;
  corpus: KnowledgeCorpus;
  score: number;
  documentTitle: string;
  source: string;
  section: string | null;
  year: string | null;
  license: string;
  heading: string | null;
  content: string;
  corpusVersion: string;
  ingestedAt: Date;
};

/** Split content into bounded chunks at paragraph boundaries. */
export function chunkContent(content: string, maxChars = 900): string[] {
  if (!content.trim()) return [];
  // Split at blank lines or at whitespace following a period. The period is
  // kept with the preceding sentence (lookbehind, non-consuming) so chunks
  // don't lose their punctuation.
  const paragraphs = content
    .split(/\n{2,}|(?<=\.)\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && (current + " " + paragraph).length > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current} ${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [content];
}

/**
 * Ingest one knowledge document: replace any previous version of the same
 * (corpus, title) document and re-chunk. Deterministic and idempotent.
 */
export async function ingestKnowledgeDocument(
  client: PoolClient,
  doc: Omit<KnowledgeDocument, "id" | "ingestedAt">,
): Promise<KnowledgeDocument> {
  const existing = await client.query(
    `SELECT id FROM knowledge_documents WHERE corpus = $1 AND title = $2`,
    [doc.corpus, doc.title],
  );
  if (existing.rows.length > 0) {
    await client.query(`DELETE FROM knowledge_documents WHERE id = $1`, [existing.rows[0].id]);
  }
  const inserted = await client.query(
    `INSERT INTO knowledge_documents
       (corpus, corpus_version, title, source, author, section, year, license, language, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      doc.corpus,
      doc.corpusVersion,
      doc.title,
      doc.source,
      doc.author,
      doc.section,
      doc.year,
      doc.license,
      doc.language,
      doc.content,
      JSON.stringify(doc.metadata ?? {}),
    ],
  );
  const row = inserted.rows[0] as Record<string, unknown>;
  const chunks = chunkContent(doc.content);
  for (let i = 0; i < chunks.length; i++) {
    await client.query(
      `INSERT INTO knowledge_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3)`,
      [row.id, i, chunks[i]],
    );
  }
  return {
    id: row.id as string,
    corpus: doc.corpus,
    corpusVersion: doc.corpusVersion,
    title: doc.title,
    source: doc.source,
    author: doc.author,
    section: doc.section,
    year: doc.year,
    license: doc.license,
    language: doc.language,
    content: doc.content,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    ingestedAt: row.ingested_at as Date,
  };
}

function toTsQuery(terms: string[]): string {
  // websearch mode tolerates quoted phrases and operators; we pass OR-joined
  // lexemes to recall partial matches for short medical terms.
  return terms
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" | ");
}

/**
 * Full-text retrieval scoped to ONE corpus. Returns ranked chunks with full
 * citation metadata. An empty result is a legitimate answer ("no relevant
 * information found") — callers must surface it honestly.
 */
export async function retrieveChunks(
  client: PoolClient,
  params: {
    corpus: KnowledgeCorpus;
    terms: string[];
    limit?: number;
    minScore?: number;
  },
): Promise<RetrievedChunk[]> {
  const cleanTerms = Array.from(
    new Set(params.terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2)),
  );
  if (cleanTerms.length === 0) return [];
  const query = toTsQuery(cleanTerms);
  // Match clause uses the SAME OR-joined tsquery as the ranking, not
  // plainto_tsquery (which ANDs every term): a symptom message like
  // "chest pain spreading to my left arm" must recall chunks containing any
  // of its terms, not only chunks containing all of them.
  const result = await client.query(
    `SELECT c.id AS chunk_id, c.heading, c.content, c.chunk_index,
            ts_rank(c.search_vector, to_tsquery('english', $1)) AS score,
            d.corpus, d.corpus_version, d.title, d.source, d.section, d.year, d.license, d.ingested_at
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
      WHERE d.corpus = $2
        AND c.search_vector @@ to_tsquery('english', $1)
      ORDER BY score DESC, d.title, c.chunk_index
      LIMIT $3`,
    [query, params.corpus, params.limit ?? 5],
  );
  const minScore = params.minScore ?? 0.01;
  return result.rows
    .filter((row) => Number(row.score) > minScore && relevanceGate(row.content as string, cleanTerms))
    .map((row) => ({
      chunkId: row.chunk_id as number,
      corpus: row.corpus as KnowledgeCorpus,
      score: Number(row.score),
      documentTitle: row.title as string,
      source: row.source as string,
      section: (row.section as string | null) ?? null,
      year: (row.year as string | null) ?? null,
      license: row.license as string,
      heading: (row.heading as string | null) ?? null,
      content: row.content as string,
      corpusVersion: row.corpus_version as string,
      ingestedAt: row.ingested_at as Date,
    }));
}

export async function corpusStatus(client: PoolClient) {
  const result = await client.query(
    `SELECT corpus, corpus_version,
            COUNT(*)::int AS documents,
            (SELECT COUNT(*)::int FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunks
       FROM knowledge_documents d
      GROUP BY corpus, corpus_version
      ORDER BY corpus`,
  );
  return result.rows.map((row) => ({
    corpus: row.corpus as KnowledgeCorpus,
    corpusVersion: row.corpus_version as string,
    documents: row.documents as number,
    chunks: row.chunks as number,
  }));
}
