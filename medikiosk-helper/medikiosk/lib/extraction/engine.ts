/**
 * Extraction orchestrator.
 *
 * Runs the deterministic engine as the always-on baseline, then optionally
 * augments it with the server-side AI provider when configured. The combined
 * items are passed through contradiction detection, then wrapped in an
 * ExtractionRun.
 *
 * SAFETY: the deterministic engine is never skipped. AI is additive and
 * fail-closed. Items are never auto-verified. The document's processing
 * status is advanced by the caller (route), not here.
 */

import type {
  ExtractedEvidenceItem,
  ExtractionProviderMetadata,
  ExtractionProviderState,
  ExtractionRun,
} from "./types";
import { extractDeterministicEvidence, detectContradictions, DETERMINISTIC_PROVIDER } from "./deterministic";
import { aiExtractEvidence, AiExtractionError } from "./ai";

/**
 * Cross-check extracted medication evidence against what the patient said.
 *
 * If the patient explicitly reported no current medicines (a "No" answer or
 * an equivalent free-text denial) but the document lists medication(s), each
 * medication item is flagged: a shared contradiction group (surfaced by the
 * physician "Contradictions" panel) plus an uncertainty note. The flag is
 * additive and honest — the conflict is preserved for physician reconciliation
 * and is NEVER auto-resolved.
 */
const NO_MEDICINE_PATTERNS: RegExp[] = [
  /^no\b/i,
  /^none\b/i,
  /^not (?:taking|on)\b/i,
  /^i (?:don'?t|do not|am not) /i,
  /^\s*[-–]\s*$/,
];

export function flagMedicationConflictWithPatientDenial(
  run: ExtractionRun,
  interviewData: Record<string, unknown> | null | undefined,
): void {
  const raw = interviewData?.["medication_current"];
  if (!raw || typeof raw !== "object") return;
  const answer = raw as { value?: unknown; state?: unknown };
  const value = typeof answer.value === "string" ? answer.value.trim() : undefined;
  const denied =
    answer.state === "DENIED" ||
    (answer.state === "KNOWN" &&
      Boolean(value) &&
      NO_MEDICINE_PATTERNS.some((re) => re.test(value as string)));
  if (!denied) return;

  const medItems = run.items.filter((item) => item.category === "MEDICATION");
  if (medItems.length === 0) return;

  const groupId = crypto.randomUUID();
  const note = "Patient reported no current medicines — physician to reconcile with this document.";
  for (const item of medItems) {
    item.contradictionGroupId = item.contradictionGroupId ?? groupId;
    item.uncertaintyNotes = item.uncertaintyNotes ? `${item.uncertaintyNotes} ${note}` : note;
  }
}

export interface OcrPageInput {
  pageNumber: number;
  extractedText: string;
}

export interface ExtractionEngineOptions {
  /** Optional injection point for the AI provider (used by tests). */
  runAi?: (pages: OcrPageInput[], documentId: string, sessionId: string) => Promise<{
    items: ExtractedEvidenceItem[];
    provider: ExtractionProviderMetadata;
  }>;
}

export interface ExtractionEngineResult {
  run: ExtractionRun;
}

/**
 * Run a full extraction pass for a document.
 *
 * Returns the extraction run plus the resolved AI provider state. When AI is
 * not configured or unavailable, the run is still produced from the
 * deterministic engine with aiProviderState reflecting the outcome.
 */
export async function runExtraction(
  documentId: string,
  sessionId: string,
  pages: OcrPageInput[],
  options: ExtractionEngineOptions = {},
): Promise<ExtractionEngineResult> {
  // Always run deterministic extraction as the baseline.
  const deterministicItems = extractDeterministicEvidence(
    pages,
    DETERMINISTIC_PROVIDER,
    documentId,
    sessionId,
  );

  let aiItems: ExtractedEvidenceItem[] = [];
  let aiProviderState: ExtractionProviderState = "NOT_CONFIGURED";
  let aiProvider: ExtractionProviderMetadata | undefined;

  // Optionally augment with AI (fail-closed).
  try {
    const aiResult = await (options.runAi ?? aiExtractEvidence)(pages, documentId, sessionId);
    aiItems = aiResult.items;
    aiProvider = aiResult.provider;
    aiProviderState = "SUCCESS";
  } catch (error) {
    if (error instanceof AiExtractionError) {
      aiProviderState = error.state;
    } else {
      aiProviderState = "FAILED";
    }
  }

  // Merge deterministic + AI items.
  const allItems = [...deterministicItems, ...aiItems];

  // Detect and preserve contradictions.
  const itemsWithContradictions = detectContradictions(allItems);

  // The run is always COMPLETED here regardless of AI provider outcome.
  // AI failures (MALFORMED_RESPONSE, UNAVAILABLE, FAILED) are captured in
  // aiProviderState and the run still carries deterministic evidence items.
  // This invariant means the RETRYABLE_STATES guard in the retry route is
  // currently unreachable but retained as a safety net for future engine
  // refactors that might save non-COMPLETED runs.
  const run: ExtractionRun = {
    documentId,
    sessionId,
    items: itemsWithContradictions,
    extractionStatus: "COMPLETED",
    aiProviderState,
    provider: aiProvider ?? DETERMINISTIC_PROVIDER,
    createdAt: new Date().toISOString(),
  };

  return { run };
}
