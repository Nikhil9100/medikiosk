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
