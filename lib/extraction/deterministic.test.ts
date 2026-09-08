import { describe, expect, it } from "vitest";
import type { ExtractionProviderMetadata } from "./types";
import {
  extractDeterministicEvidence,
  detectContradictions,
  DETERMINISTIC_PROVIDER,
} from "./deterministic";
import type { OcrPageInput } from "./deterministic";

const provider: ExtractionProviderMetadata = {
  name: "test-provider",
  createdAt: "2026-09-08T00:00:00.000Z",
};

describe("deterministic extraction engine", () => {
  it("returns empty array for empty pages", () => {
    const items = extractDeterministicEvidence([], provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(items).toEqual([]);
  });

  it("returns empty array for blank text", () => {
    const items = extractDeterministicEvidence([{ pageNumber: 1, extractedText: "" }], provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(items).toEqual([]);
  });

  it("extracts diagnosis from explicit marker", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Type 2 Diabetes Mellitus" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    expect(items.length).toBeGreaterThanOrEqual(1);
    const diagnosis = items.find((i) => i.category === "DIAGNOSIS");
    expect(diagnosis).toBeDefined();
    expect(diagnosis!.normalizedValue.details).toBe("Type 2 Diabetes Mellitus");
    expect(diagnosis!.extractionMethod).toBe("DETERMINISTIC");
    expect(diagnosis!.verificationState).toBe("UNVERIFIED");
    expect(diagnosis!.pageNumber).toBe(1);
    expect(diagnosis!.provider.name).toBe("test-provider");
  });

  it("extracts medication with dosage", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Tab Metformin 500mg BD for 30 days" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    const med = items.find((i) => i.category === "MEDICATION");
    expect(med).toBeDefined();
    expect(med!.normalizedValue.name).toBe("Metformin");
    expect(med!.normalizedValue.dose).toBe("500mg");
  });

  it("extracts investigation lab values", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Hb: 10.2 g/dL\nFBS: 142 mg/dL" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    expect(items.filter((i) => i.category === "INVESTIGATION").length).toBe(2);
    const hb = items.find(
      (i) => i.category === "INVESTIGATION" && i.normalizedValue.name === "Hb",
    );
    expect(hb).toBeDefined();
    expect(hb!.normalizedValue.value).toBe("10.2 g/dL");

    const fbs = items.find(
      (i) => i.category === "INVESTIGATION" && i.normalizedValue.name === "FBS",
    );
    expect(fbs).toBeDefined();
    expect(fbs!.normalizedValue.value).toBe("142 mg/dL");
  });

  it("extracts procedure from explicit marker", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Procedure: Laparoscopic Cholecystectomy" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    const proc = items.find((i) => i.category === "PROCEDURE");
    expect(proc).toBeDefined();
    expect(proc!.normalizedValue.details).toBe("Laparoscopic Cholecystectomy");
  });

  it("extracts allergy from explicit marker", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Allergy: Penicillin, Sulfa drugs" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    const allergy = items.find((i) => i.category === "ALLERGY");
    expect(allergy).toBeDefined();
    expect(allergy!.normalizedValue.name).toBe("Penicillin, Sulfa drugs");
  });

  it("extracts medical history from explicit marker", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "H/O Hypertension for 5 years" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    const history = items.find((i) => i.category === "MEDICAL_HISTORY");
    expect(history).toBeDefined();
    expect(history!.normalizedValue.details).toContain("Hypertension");
  });

  it("extracts chronology dates", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "On 12/03/2026 patient presented with fever" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    const chrono = items.find((i) => i.category === "CHRONOLOGY");
    expect(chrono).toBeDefined();
    expect(chrono!.normalizedValue.date).toBe("12/03/2026");
  });

  it("extracts chronology durations", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Symptoms present for 3 weeks" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    const chrono = items.find((i) => i.category === "CHRONOLOGY");
    expect(chrono).toBeDefined();
    expect(chrono!.normalizedValue.details).toBe("for 3 weeks");
  });

  it("includes ocrSpan with start/end", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Diabetes" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    const diag = items.find((i) => i.category === "DIAGNOSIS");

    expect(diag).toBeDefined();
    expect(diag!.ocrSpan).toBeDefined();
    expect(diag!.ocrSpan!.start).toBeGreaterThanOrEqual(0);
    expect(diag!.ocrSpan!.end).toBeGreaterThan(diag!.ocrSpan!.start!);
  });

  it("deduplicates identical items on same page", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Diabetes\nDx: Diabetes" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    const diagnoses = items.filter((i) => i.category === "DIAGNOSIS");
    // Both match but produce same normalized value, so should dedup
    expect(diagnoses.length).toBe(1);
  });

  it("extracts from multiple pages", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Pneumonia" },
      { pageNumber: 2, extractedText: "Tab Amoxicillin 500mg" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

    expect(items.some((i) => i.pageNumber === 1)).toBe(true);
    expect(items.some((i) => i.pageNumber === 2)).toBe(true);
  });

  it("caps total items at 60", () => {
    // Generate text with many unique medications
    const lines = Array.from({ length: 35 }, (_, i) => `Tab Drug${i} ${i + 10}mg`);
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: lines.join("\n") },
      { pageNumber: 2, extractedText: lines.join("\n") },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(items.length).toBeLessThanOrEqual(60);
  });

  it("never auto-verifies items", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Asthma\nTab Salbutamol 4mg" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    for (const item of items) {
      expect(item.verificationState).toBe("UNVERIFIED");
    }
  });

  it("sets uncertainty notes", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Tab Metformin 500mg" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    const med = items.find((i) => i.category === "MEDICATION");
    expect(med!.uncertaintyNotes).toContain("Doctor review required");
  });

  it("sets DETERMINISTIC extraction method", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Fever" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(items[0].extractionMethod).toBe("DETERMINISTIC");
  });

  it("marks all extracted items UNVERIFIED", () => {
    const pages: OcrPageInput[] = [
      { pageNumber: 1, extractedText: "Diagnosis: Fever\nTab Paracetamol 500mg" },
    ];
    const items = extractDeterministicEvidence(pages, provider, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
    expect(items.every((i) => i.verificationState === "UNVERIFIED")).toBe(true);
  });
});

describe("contradiction detection", () => {
  it("assigns contradictionGroupId when medication doses differ", () => {
    const items = [
      {
        id: "a",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "MEDICATION" as const,
        normalizedValue: { name: "Metformin", dose: "500mg" },
        originalOcrWording: "Tab Metformin 500mg",
        pageNumber: 1,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
      },
      {
        id: "b",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "MEDICATION" as const,
        normalizedValue: { name: "Metformin", dose: "1000mg" },
        originalOcrWording: "Tab Metformin 1000mg",
        pageNumber: 2,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
      },
    ];

    const result = detectContradictions(items);
    expect(result[0].contradictionGroupId).toBeDefined();
    expect(result[1].contradictionGroupId).toBeDefined();
    expect(result[0].contradictionGroupId).toBe(result[1].contradictionGroupId);
    expect(result[0].uncertaintyNotes).toContain("contradiction");
    expect(result[1].uncertaintyNotes).toContain("contradiction");
  });

  it("does not assign contradictionGroupId when doses match", () => {
    const items = [
      {
        id: "a",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "MEDICATION" as const,
        normalizedValue: { name: "Metformin", dose: "500mg" },
        originalOcrWording: "Tab Metformin 500mg",
        pageNumber: 1,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
      },
      {
        id: "b",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "MEDICATION" as const,
        normalizedValue: { name: "Metformin", dose: "500mg" },
        originalOcrWording: "Tab Metformin 500mg",
        pageNumber: 2,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
      },
    ];

    const result = detectContradictions(items);
    expect(result[0].contradictionGroupId).toBeUndefined();
    expect(result[1].contradictionGroupId).toBeUndefined();
  });

  it("preserves existing uncertainty notes when adding contradiction", () => {
    const items = [
      {
        id: "a",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "INVESTIGATION" as const,
        normalizedValue: { name: "Hb", value: "10" },
        originalOcrWording: "Hb: 10",
        pageNumber: 1,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
        uncertaintyNotes: "Existing note",
      },
      {
        id: "b",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "INVESTIGATION" as const,
        normalizedValue: { name: "Hb", value: "12" },
        originalOcrWording: "Hb: 12",
        pageNumber: 2,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
      },
    ];

    const result = detectContradictions(items);
    expect(result[0].uncertaintyNotes).toContain("Existing note");
    expect(result[0].uncertaintyNotes).toContain("contradiction");
  });

  it("returns items unchanged when no contradictions found", () => {
    const items = [
      {
        id: "a",
        documentId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        category: "DIAGNOSIS" as const,
        normalizedValue: { details: "Diabetes" },
        originalOcrWording: "Diagnosis: Diabetes",
        pageNumber: 1,
        extractionMethod: "DETERMINISTIC" as const,
        provider: { name: "test", createdAt: "2026-09-08T00:00:00.000Z" },
        verificationState: "UNVERIFIED" as const,
      },
    ];

    const result = detectContradictions(items);
    expect(result[0].contradictionGroupId).toBeUndefined();
  });
});

describe("DETERMINISTIC_PROVIDER", () => {
  it("has correct metadata", () => {
    expect(DETERMINISTIC_PROVIDER.name).toBe("deterministic");
    expect(DETERMINISTIC_PROVIDER.createdAt).toBeTruthy();
  });
});
