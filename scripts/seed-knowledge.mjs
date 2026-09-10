// Seed the MediKiosk RAG knowledge base (idempotent).
// Run with the OWNER DSN (superuser bypasses RLS), e.g.:
//   DATABASE_URL=postgresql://medikiosk_owner:owner_local_dev@127.0.0.1:5432/medikiosk \
//     node scripts/seed-knowledge.mjs
// The same content module (db/knowledge/seed-content.mjs) is the single
// source of truth for both corpora; re-running replaces documents by
// (corpus, title) and re-chunks them.
import { Client } from "pg";
import { knowledgeDocuments } from "../db/knowledge/seed-content.mjs";

const dsn = process.env.DATABASE_URL;
if (!dsn) {
  console.error("DATABASE_URL is required (use the owner/admin DSN)");
  process.exit(1);
}

function chunkContent(content, maxChars = 900) {
  if (!content.trim()) return [];
  // Must stay in sync with chunkContent() in lib/db/knowledge.ts (period kept
  // with the preceding sentence).
  const paragraphs = content
    .split(/\n{2,}|(?<=\.)\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const chunks = [];
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

const client = new Client({ connectionString: dsn });
await client.connect();
let ingested = 0;
let chunks = 0;
try {
  await client.query("BEGIN");
  for (const doc of knowledgeDocuments) {
    const existing = await client.query(
      "SELECT id FROM knowledge_documents WHERE corpus = $1 AND title = $2",
      [doc.corpus, doc.title],
    );
    if (existing.rows.length > 0) {
      await client.query("DELETE FROM knowledge_documents WHERE id = $1", [existing.rows[0].id]);
    }
    const inserted = await client.query(
      `INSERT INTO knowledge_documents
         (corpus, corpus_version, title, source, author, section, year, license, language, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
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
    const docId = inserted.rows[0].id;
    const parts = chunkContent(doc.content);
    for (let i = 0; i < parts.length; i++) {
      await client.query(
        "INSERT INTO knowledge_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3)",
        [docId, i, parts[i]],
      );
    }
    chunks += parts.length;
    ingested += 1;
  }
  await client.query("COMMIT");
  console.log(`knowledge seeded: ${ingested} documents, ${chunks} chunks`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
