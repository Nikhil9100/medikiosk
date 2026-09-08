import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiExtractEvidence,
  AiExtractionError,
  isAiExtractionConfigured,
} from "./ai";
import type { OcrPageInput } from "./engine";

const DOC_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
});

describe("isAiExtractionConfigured", () => {
  it("is false without a key", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isAiExtractionConfigured()).toBe(false);
  });

  it("is true with a key", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(isAiExtractionConfigured()).toBe(true);
  });
});

describe("aiExtractEvidence", () => {
  it("throws NOT_CONFIGURED without a key", async () => {
    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }];
    await expect(aiExtractEvidence(pages, DOC_ID, SESSION_ID)).rejects.toMatchObject({
      state: "NOT_CONFIGURED",
    });
  });

  it("maps valid response to UNVERIFIED AI items", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      {
                        category: "DIAGNOSIS",
                        normalizedValue: { details: "Diabetes" },
                        originalOcrWording: "Diagnosis: Diabetes",
                        pageNumber: 1,
                        confidence: 0.9,
                      },
                      {
                        category: "MEDICATION",
                        normalizedValue: { name: "Metformin", dose: "500mg" },
                        originalOcrWording: "Tab Metformin 500mg",
                        pageNumber: 1,
                        confidence: 0.85,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes\nTab Metformin 500mg" }];
    const result = await aiExtractEvidence(pages, DOC_ID, SESSION_ID);

    expect(result.items.length).toBe(2);
    expect(result.items[0].category).toBe("DIAGNOSIS");
    expect(result.items[0].extractionMethod).toBe("AI");
    expect(result.items[0].verificationState).toBe("UNVERIFIED");
    expect(result.items[0].documentId).toBe(DOC_ID);
    expect(result.items[0].sessionId).toBe(SESSION_ID);
    expect(result.provider.name).toBe("gemini");
  });

  it("rejects the whole response when any candidate violates the contract (unknown category)", async () => {
    // Fail-closed: a single out-of-contract candidate invalidates the response
    // rather than being silently dropped, so partial/fabricated evidence is
    // never accepted.
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      { category: "TREATMENT", normalizedValue: {}, originalOcrWording: "x", pageNumber: 1 },
                      {
                        category: "DIAGNOSIS",
                        normalizedValue: { details: "Asthma" },
                        originalOcrWording: "Diagnosis: Asthma",
                        pageNumber: 1,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "Diagnosis: Asthma" }];
    await expect(aiExtractEvidence(pages, DOC_ID, SESSION_ID)).rejects.toMatchObject({
      state: "MALFORMED_RESPONSE",
    });
  });

  it("throws MALFORMED_RESPONSE for invalid JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "not json at all" }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "x" }];
    await expect(aiExtractEvidence(pages, DOC_ID, SESSION_ID)).rejects.toMatchObject({
      state: "MALFORMED_RESPONSE",
    });
  });

  it("throws MALFORMED_RESPONSE for schema-violating items", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [{ category: "BOGUS", normalizedValue: {}, originalOcrWording: "x", pageNumber: 1 }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "x" }];
    await expect(aiExtractEvidence(pages, DOC_ID, SESSION_ID)).rejects.toMatchObject({
      state: "MALFORMED_RESPONSE",
    });
  });

  it("throws FAILED on non-ok HTTP status", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "x" }];
    await expect(aiExtractEvidence(pages, DOC_ID, SESSION_ID)).rejects.toMatchObject({
      state: "FAILED",
    });
  });

  it("throws UNAVAILABLE when the model returns no text", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [] } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "x" }];
    await expect(aiExtractEvidence(pages, DOC_ID, SESSION_ID)).rejects.toMatchObject({
      state: "UNAVAILABLE",
    });
  });

  it("parses JSON wrapped in markdown fences", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "```json\n" + JSON.stringify({
                    items: [
                      {
                        category: "PROCEDURE",
                        normalizedValue: { details: "Appendectomy" },
                        originalOcrWording: "Underwent Appendectomy",
                        pageNumber: 1,
                      },
                    ],
                  }) + "\n```",
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "Underwent Appendectomy" }];
    const result = await aiExtractEvidence(pages, DOC_ID, SESSION_ID);
    expect(result.items.length).toBe(1);
    expect(result.items[0].category).toBe("PROCEDURE");
  });

  it("returns an empty items list when the model returns empty items", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [] }) }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pages: OcrPageInput[] = [{ pageNumber: 1, extractedText: "x" }];
    const result = await aiExtractEvidence(pages, DOC_ID, SESSION_ID);
    expect(result.items).toEqual([]);
  });
});

describe("AiExtractionError", () => {
  it("is an instanceof Error with a state", () => {
    const err = new AiExtractionError("FAILED", "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.state).toBe("FAILED");
    expect(err.message).toBe("boom");
  });
});
