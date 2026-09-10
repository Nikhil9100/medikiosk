import { describe, expect, it } from "vitest";
import type { RetrievedChunk } from "./db/knowledge";
import { composeReply, extractTerms } from "./assistant-reply";

function chunk(overrides: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    chunkId: 1,
    corpus: "MODERN_MEDICINE",
    score: 0.1,
    documentTitle: "Untitled",
    source: "test-source",
    section: null,
    year: "2026",
    license: "internal-educational",
    heading: null,
    content: "A sentence about the topic. A second sentence with detail.",
    corpusVersion: "test",
    ingestedAt: new Date("2026-09-11T00:00:00Z"),
    ...overrides,
  } as RetrievedChunk;
}

const safety = [{ type: "CHEST_PAIN_URGENT", summary: "Chest pain flagged.", reason: "r", evidenceRef: "e", source: "PATIENT" as const }];

describe("extractTerms", () => {
  it("lowercases, strips stopwords, dedupes, caps at 12", () => {
    const terms = extractTerms("I have chest pain, the pain is severe, please help, कृपया सहायता करें");
    expect(terms).toContain("chest");
    expect(terms).toContain("pain");
    expect(terms).toContain("severe");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("i");
    expect(terms).not.toContain("please");
    expect(new Set(terms).size).toBe(terms.length);
    expect(terms.length).toBeLessThanOrEqual(12);
  });
});

describe("composeReply", () => {
  it("puts safety first and names the emergency path", () => {
    const { reply, intent } = composeReply({ safety, modern: [chunk({ documentTitle: "Chest pain" })], ayurveda: [] });
    expect(intent).toBe("safety");
    expect(reply.startsWith("I want to flag this first")).toBe(true);
    expect(reply).toContain("emergency care");
  });

  it("never blends corpora: sections are separate and labeled", () => {
    const modern = [chunk({ documentTitle: "Chest pain", score: 0.5 })];
    const ayurveda = [chunk({ documentTitle: "Doshas", corpus: "AYURVEDA", score: 0.4 })];
    const { reply, intent } = composeReply({ safety: [], modern, ayurveda });
    expect(intent).toBe("info-modern-ayurveda");
    const modernIdx = reply.indexOf("modern-medicine reference");
    const ayuIdx = reply.indexOf("Ayurveda (AYUSH) reference");
    expect(modernIdx).toBeGreaterThan(-1);
    expect(ayuIdx).toBeGreaterThan(modernIdx);
  });

  it("gates weakly-matching Ayurveda content out of a biomedical query", () => {
    const modern = [chunk({ documentTitle: "Chest pain", score: 0.5 })];
    // Ayurveda chunk barely matches (score far below the modern top).
    const ayurveda = [chunk({ documentTitle: "How observations fit", corpus: "AYURVEDA", score: 0.011 })];
    const { reply, intent, citations } = composeReply({ safety: [], modern, ayurveda });
    expect(intent).toBe("info-modern");
    expect(reply).not.toContain("Ayurveda (AYUSH) reference");
    expect(citations.every((c) => c.corpus === "MODERN_MEDICINE")).toBe(true);
  });

  it("shows Ayurveda when modern material is absent", () => {
    const ayurveda = [chunk({ documentTitle: "Doshas", corpus: "AYURVEDA", score: 0.09 })];
    const { reply, intent } = composeReply({ safety: [], modern: [], ayurveda });
    expect(intent).toBe("info-ayurveda");
    expect(reply).toContain("Ayurveda (AYUSH) reference");
  });

  it("dedupes chunks from the same document in display and citations", () => {
    const modern = [
      chunk({ documentTitle: "Chest pain", chunkId: 1, score: 0.5 }),
      chunk({ documentTitle: "Chest pain", chunkId: 2, score: 0.4 }),
      chunk({ documentTitle: "Fever", chunkId: 3, score: 0.2 }),
    ];
    const { citations, reply } = composeReply({ safety: [], modern, ayurveda: [] });
    expect(citations.map((c) => c.title)).toEqual(["Chest pain", "Fever"]);
    // The second "Chest pain" chunk must not appear as a separate bullet.
    const bullets = (reply.match(/• /g) ?? []).length;
    expect(bullets).toBe(2);
  });

  it("is honest when nothing matches", () => {
    const { reply, intent, citations } = composeReply({ safety: [], modern: [], ayurveda: [] });
    expect(intent).toBe("no-match");
    expect(reply).toContain("couldn't find specific reference material");
    expect(citations).toEqual([]);
  });

  it("always closes with the not-a-diagnosis reminder", () => {
    const { reply } = composeReply({ safety: [], modern: [chunk({ documentTitle: "X" })], ayurveda: [] });
    expect(reply).toContain("general information, not a diagnosis");
  });
});
