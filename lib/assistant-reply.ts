import type { SafetySignalDraft } from "@/lib/safety-signals";
import type { RetrievedChunk } from "@/lib/db/knowledge";

/**
 * Pure composition of assistant replies. Kept out of the route so the
 * behavior is unit-testable without a database.
 *
 * Honesty rules:
 *  - Safety signals are always surfaced first.
 *  - The two corpora are never blended: each section names its reference set.
 *  - The Ayurveda section is included only when it is genuinely on-topic
 *    (relevance gate against the modern-medicine top score) — otherwise it
 *    is noise for a purely biomedical question.
 *  - When nothing relevant is found, the reply says so explicitly.
 */

export type AssistantSafety = Pick<SafetySignalDraft, "type" | "summary">;

const STOP_WORDS = new Set([
  "i", "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "am", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
  "did", "my", "me", "we", "our", "you", "your", "it", "its", "this", "that", "what",
  "they", "them", "their", "him", "her", "his", "who", "whom", "which", "all", "any",
  "when", "where", "why", "how", "will", "would", "can", "could", "should", "about",
  "feel", "feels", "feeling", "felt", "since", "much", "many", "please", "tell",
  "kya", "hai", "hain", "ka", "ki", "ke", "se", "mein", "aur",
  // Generic descriptor/hedge words. These appear in many KB chunks (e.g.
  // "condition", "normal", "general"), so a single one of them must never
  // pull a chunk into a citation for an unrelated question.
  "condition", "conditions", "normal", "range", "ranges", "general", "common",
  "signs", "strong", "severe", "serious", "bad", "worse", "better", "mild",
  "moderate", "little", "some", "thing", "things", "problem", "trouble", "issue",
  "really", "very", "quite", "often", "always", "sometimes", "usually", "still",
  "again", "just", "maybe", "probably", "likely", "lot", "kind", "sort", "bit",
  "enough", "sudden", "suddenly", "gradual", "gradually",
  // Time/number filler — clinically meaningful in the interview, but
  // useless (and noisy) as retrieval terms.
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "day", "days", "week", "weeks", "month", "months", "year", "years", "hour",
  "hours", "ago", "long", "short", "early", "late", "today", "yesterday",
  "tonight", "now", "here", "there",
  // Roles, meta-language, and onset verbs: ubiquitous in the KB prose
  // (e.g. "checked by a doctor", "the patient") but meaningless as topic
  // signals — and a vector for prompt-injection payloads to "match" noise.
  "patient", "patients", "doctor", "doctors", "instructions", "instruction",
  "ignore", "previous", "start", "started", "starting", "began", "begins",
  "became", "becomes",
]);

export function extractTerms(message: string): string[] {
  const words = message
    .toLowerCase()
    .split(/[^a-z\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0980-\u09FF]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 12);
}

/**
 * Relevance gate for full-text retrieval.
 *
 * Chunks are recalled with an OR-joined tsquery, so a single incidental word
 * ("diabetes" mentioned once inside a chest-pain article) is enough for the
 * row to come back. Citing that chunk would present unrelated material as
 * "reference" for the patient's question. A chunk is therefore only eligible
 * when at least one (short queries) or two (3+ term queries) of the query
 * terms genuinely appear in its text.
 */
export function relevanceGate(content: string, terms: string[]): boolean {
  const text = content.toLowerCase();
  const required = terms.length >= 3 ? 2 : 1;
  let matched = 0;
  for (const term of terms) {
    if (termAppearsInText(text, term)) {
      matched += 1;
      if (matched >= required) return true;
    }
  }
  return false;
}

function termAppearsInText(text: string, term: string): boolean {
  if (text.includes(term)) return true;
  // Tolerate light inflection drift between the patient's wording and the
  // reference wording ("breathing" vs "breath", "range" vs "ranging",
  // "diabetes" vs "diabetic") by dropping up to four trailing characters of
  // the query term.
  for (let i = 1; i <= 4 && term.length - i >= 3; i++) {
    if (text.includes(term.slice(0, term.length - i))) return true;
  }
  return false;
}

function excerpt(chunk: { content: string }): string {
  const sentences = chunk.content.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
  return sentences.length > 400 ? sentences.slice(0, 397) + "…" : sentences;
}

export type AssistantCitation = {
  corpus: RetrievedChunk["corpus"];
  title: string;
  section: string | null;
  source: string;
  chunkId: number;
};

export function citationFor(chunk: RetrievedChunk): AssistantCitation {
  return {
    corpus: chunk.corpus,
    title: chunk.documentTitle,
    section: chunk.section,
    source: chunk.source,
    chunkId: chunk.chunkId,
  };
}

/** Keep the top chunk per document so one source never repeats. */
function dedupeByDocument(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.documentTitle)) continue;
    seen.add(chunk.documentTitle);
    out.push(chunk);
  }
  return out;
}

export function composeReply(params: {
  safety: SafetySignalDraft[];
  modern: RetrievedChunk[];
  ayurveda: RetrievedChunk[];
}): { reply: string; intent: string; citations: AssistantCitation[] } {
  const parts: string[] = [];
  const modern = dedupeByDocument(params.modern);
  const ayurveda = dedupeByDocument(params.ayurveda);

  // Relevance gate: when modern-medicine material is strongly on-topic, a
  // weakly-matching Ayurveda chunk (often just one shared word) is noise.
  const modernTop = modern[0]?.score ?? 0;
  const ayurvedaTop = ayurveda[0]?.score ?? 0;
  const ayurvedaOnTopic =
    params.ayurveda.length === 0
      ? false
      : modernTop <= 0
        ? ayurvedaTop >= 0.01
        : ayurvedaTop >= Math.min(0.02, modernTop * 0.35);
  const ayurvedaShown = ayurvedaOnTopic ? ayurveda : [];

  if (params.safety.length > 0) {
    parts.push(
      `I want to flag this first: ${params.safety[0].summary} ` +
        `If it is severe or getting worse right now, please seek emergency care immediately without waiting for the kiosk review.`,
    );
  }

  if (modern.length > 0) {
    parts.push("Here is some general information from the modern-medicine reference:");
    for (const chunk of modern.slice(0, 2)) {
      parts.push(`• ${chunk.documentTitle}: ${excerpt(chunk)}`);
    }
  }

  if (ayurvedaShown.length > 0) {
    parts.push("From the Ayurveda (AYUSH) reference, as complementary context:");
    for (const chunk of ayurvedaShown.slice(0, 1)) {
      parts.push(`• ${chunk.documentTitle}: ${excerpt(chunk)}`);
    }
  }

  if (params.safety.length === 0 && modern.length === 0 && ayurvedaShown.length === 0) {
    parts.push(
      "I couldn't find specific reference material for that. Could you tell me where the problem is (for example chest, head, stomach), how long it has been going on, and how strong it is? I will keep it in your record for the doctor.",
    );
  }

  parts.push(
    "This is general information, not a diagnosis. A doctor will review your complete record, and anything urgent is shown to them first.",
  );

  const intent =
    params.safety.length > 0
      ? "safety"
      : modern.length > 0 && ayurvedaShown.length > 0
        ? "info-modern-ayurveda"
        : modern.length > 0
          ? "info-modern"
          : ayurvedaShown.length > 0
            ? "info-ayurveda"
            : "no-match";

  return {
    reply: parts.join("\n\n"),
    intent,
    citations: [...modern.slice(0, 2).map(citationFor), ...ayurvedaShown.slice(0, 1).map(citationFor)],
  };
}
