import type { PoolClient } from "pg";
import { detectSafetySignals } from "./safety-signals";

export type Citation = {
  corpus: "MODERN_MEDICINE" | "AYURVEDA";
  title: string;
  source: string;
  section: string | null;
};

export async function answerPatient(
  c: PoolClient,
  sessionId: string,
  message: string,
  clientMutationId: string
) {
  const safety = detectSafetySignals([message]);

  // Unicode-safe word segmentation preserving Indian script characters and alphanumeric terms
  const terms = message
    .toLowerCase()
    .split(/[\s,.;:!?।|॥\-\(\)\[\]{}'"]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .slice(0, 8);

  const search = async (corpus: "MODERN_MEDICINE" | "AYURVEDA") => {
    if (!terms.length) return { rows: [] as any[] };
    const queryText = terms.join(" ");
    return c.query(
      `SELECT d.title, d.source, d.section, k.content 
       FROM knowledge_chunks k 
       JOIN knowledge_documents d ON d.id = k.document_id 
       WHERE d.corpus = $1 
         AND k.search_vector @@ plainto_tsquery('simple', $2) 
       ORDER BY ts_rank(k.search_vector, plainto_tsquery('simple', $2)) DESC 
       LIMIT 2`,
      [corpus, queryText]
    );
  };

  // Run searches sequentially over the single transaction connection
  const modern = await search("MODERN_MEDICINE");
  const ayurveda = await search("AYURVEDA");

  const citations: Citation[] = [
    ...modern.rows.map((r: any) => ({
      corpus: "MODERN_MEDICINE" as const,
      title: r.title,
      source: r.source,
      section: r.section,
    })),
    ...ayurveda.rows.map((r: any) => ({
      corpus: "AYURVEDA" as const,
      title: r.title,
      source: r.source,
      section: r.section,
    })),
  ];

  let reply = safety.length
    ? `${safety[0].summary} I cannot diagnose this. Please alert hospital staff immediately.`
    : "I can provide general information to help you describe your history to the doctor, but I cannot diagnose or prescribe.";

  if (!safety.length && modern.rows[0]) {
    reply += ` Reference information: ${String(modern.rows[0].content).slice(0, 420)}`;
  }
  if (!safety.length && ayurveda.rows[0]) {
    reply += ` Ayurveda reference: ${String(ayurveda.rows[0].content).slice(0, 260)}`;
  }
  if (!safety.length && !citations.length) {
    reply += " I do not have a reliable reference match for that question. Please tell the doctor directly.";
  }

  // Idempotent insertion protected against repeated mutations
  await c.query(
    `INSERT INTO chat_messages(session_id, role, content, client_mutation_id) 
     VALUES($1, 'PATIENT', $2, $3)
     ON CONFLICT (session_id, role, client_mutation_id) DO NOTHING`,
    [sessionId, message, clientMutationId]
  );

  await c.query(
    `INSERT INTO chat_messages(session_id, role, content, intent, citations, provider, client_mutation_id) 
     VALUES($1, 'ASSISTANT', $2, $3, $4, 'deterministic-kb', $5)
     ON CONFLICT (session_id, role, client_mutation_id) DO NOTHING`,
    [sessionId, reply, safety.length ? "SAFETY" : "INFORMATION", JSON.stringify(citations), clientMutationId]
  );

  return { reply, citations, safety, idempotent: false };
}
