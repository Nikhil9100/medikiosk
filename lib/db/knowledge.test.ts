import { describe, expect, it } from "vitest";
import { chunkContent } from "./knowledge";

describe("chunkContent", () => {
  it("returns a single chunk for short content", () => {
    expect(chunkContent("One short paragraph.")).toHaveLength(1);
  });

  it("splits long content at sentence boundaries under the cap", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} carries some meaningful content.`).join(" ");
    const chunks = chunkContent(long, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(400 + 80); // cap + one sentence overflow tolerance
    }
  });

  it("preserves all content across chunks", () => {
    const source = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota. Kappa lambda mu.";
    const chunks = chunkContent(source, 30);
    const rejoined = chunks.join(" ").replace(/\s+/g, " ");
    for (const word of ["Alpha", "zeta", "Kappa", "mu."]) {
      expect(rejoined).toContain(word);
    }
  });

  it("handles empty input without crashing", () => {
    expect(chunkContent("")).toEqual([]);
  });
});
