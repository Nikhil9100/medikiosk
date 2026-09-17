/**
 * Optional server-side AI medical evidence extraction provider (Gemini).
 *
 * SAFETY PROPERTIES:
 * - Fully optional: if no GEMINI_API_KEY is configured, the provider reports
 *   NOT_CONFIGURED and no AI extraction runs. The deterministic engine is
 *   always the baseline.
 * - Fail-closed: the model's response is validated against a strict Zod
 *   schema. Any malformed or out-of-contract output is dropped, never
 *   silently accepted. If nothing valid survives, extraction reports
 *   MALFORMED_RESPONSE rather than fabricating evidence.
 * - Never infers diagnosis or recommends treatment: the prompt forbids it
 *   and the output schema has no field for it.
 * - All returned items start UNVERIFIED and carry AI provenance.
 */

import type {
  EvidenceCategory,
  ExtractedEvidenceItem,
  ExtractionProviderMetadata,
  ExtractionProviderState,
  NormalizedEvidenceValue,
} from "./types";
import { createUnverifiedEvidenceItem } from "./types";
import { z } from "zod";
import { DETERMINISTIC_PROVIDER } from "./deterministic";

export const GEMINI_MODEL = "gemini-2.0-flash";
export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/** Strict schema for a single AI-extracted evidence candidate. */
const AiEvidenceCandidateSchema = z.object({
  category: z.enum([
    "DIAGNOSIS",
    "MEDICATION",
    "INVESTIGATION",
    "PROCEDURE",
    "ALLERGY",
    "MEDICAL_HISTORY",
    "CHRONOLOGY",
  ]),
  normalizedValue: z
    .object({
      name: z.string().optional(),
      value: z.string().optional(),
      unit: z.string().optional(),
      dose: z.string().optional(),
      frequency: z.string().optional(),
      date: z.string().optional(),
      details: z.string().optional(),
    })
    .strict(),
  originalOcrWording: z.string().min(1),
  pageNumber: z.number().int().positive(),
  confidence: z.number().min(0).max(1).optional(),
});

/** Strict schema for the full model response body. */
const AiExtractionResponseSchema = z.object({
  items: z.array(AiEvidenceCandidateSchema).max(60),
});

export type AiExtractionCandidate = z.infer<typeof AiEvidenceCandidateSchema>;

export class AiExtractionError extends Error {
  constructor(
    public state: Exclude<ExtractionProviderState, "SUCCESS">,
    message: string,
  ) {
    super(message);
    this.name = "AiExtractionError";
  }
}

export interface AiExtractionResult {
  items: ExtractedEvidenceItem[];
  provider: ExtractionProviderMetadata;
}

/** True when a Gemini API key is present and the provider can run. */
export function isAiExtractionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function buildPrompt(pagesText: string): string {
  return [
    "You are a medical record extraction assistant. Extract structured evidence items",
    "from the following OCR text of a patient document.",
    "",
    "STRICT RULES:",
    "- Only report information explicitly present in the text. Never infer a diagnosis.",
    "- Never recommend treatment or medication.",
    "- Only use these categories: DIAGNOSIS, MEDICATION, INVESTIGATION, PROCEDURE, ALLERGY, MEDICAL_HISTORY, CHRONOLOGY.",
    "- If text is ambiguous or missing, omit the item entirely.",
    "- Return a JSON object: { \"items\": [ { category, normalizedValue, originalOcrWording, pageNumber, confidence } ] }",
    "- originalOcrWording must be a verbatim substring of the source text.",
    "",
    "OCR TEXT:",
    pagesText,
  ].join("\n");
}

/** Extract the first non-empty text part from a Gemini generateContent response. */
function extractTextFromGeminiResponse(body: unknown): string {
  const root = body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = root.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .filter((t) => t.length > 0)
    .join("")
    .trim();

  if (!text) {
    throw new AiExtractionError("UNAVAILABLE", "Gemini returned no usable text");
  }
  return text;
}

function parseItemsJson(text: string): AiExtractionCandidate[] {
  // Strip markdown fences if the model wraps the JSON.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract the first balanced JSON object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new AiExtractionError("MALFORMED_RESPONSE", "Gemini response was not valid JSON");
    }
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new AiExtractionError("MALFORMED_RESPONSE", "Gemini response was not valid JSON");
    }
  }

  const validated = AiExtractionResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new AiExtractionError("MALFORMED_RESPONSE", "Gemini response did not match extraction schema");
  }
  return validated.data.items;
}

/**
 * Run AI extraction against the Gemini API.
 *
 * @throws AiExtractionError with a provider state on any failure.
 */
export async function aiExtractEvidence(
  pages: Array<{ pageNumber: number; extractedText: string }>,
  documentId: string,
  sessionId: string,
): Promise<AiExtractionResult> {
  if (!isAiExtractionConfigured()) {
    throw new AiExtractionError("NOT_CONFIGURED", "AI extraction is not configured");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const pageText = pages
    .map((p) => `[Page ${p.pageNumber}]\n${p.extractedText}`)
    .join("\n\n");

  const endpoint = `${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey ?? "")}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(pageText) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new AiExtractionError(
      "UNAVAILABLE",
      error instanceof Error ? error.message : "Gemini request failed",
    );
  }

  if (!response.ok) {
    throw new AiExtractionError("FAILED", `Gemini request failed with status ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AiExtractionError("MALFORMED_RESPONSE", "Gemini response was not valid JSON");
  }

  const text = extractTextFromGeminiResponse(body);
  const candidates = parseItemsJson(text);

  const provider: ExtractionProviderMetadata = {
    name: "gemini",
    model: GEMINI_MODEL,
    createdAt: new Date().toISOString(),
  };

  const items: ExtractedEvidenceItem[] = [];
  for (const candidate of candidates) {
    try {
      items.push(
        createUnverifiedEvidenceItem({
          documentId,
          sessionId,
          category: candidate.category as EvidenceCategory,
          normalizedValue: candidate.normalizedValue as NormalizedEvidenceValue,
          originalOcrWording: candidate.originalOcrWording,
          pageNumber: candidate.pageNumber,
          extractionMethod: "AI",
          provider,
          confidence: candidate.confidence,
          uncertaintyNotes: "AI-extracted draft. Doctor review required.",
        }),
      );
    } catch {
      // Fail-closed: drop any candidate that does not satisfy the contract.
      continue;
    }
  }

  return { items, provider };
}

/** Provider metadata used when AI extraction is not configured. */
export const AI_NOT_CONFIGURED_PROVIDER: ExtractionProviderMetadata = DETERMINISTIC_PROVIDER;
