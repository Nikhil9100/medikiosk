import { describe, expect, it, vi } from "vitest";
import type { ExtractedEvidenceItem, ExtractionProviderMetadata } from "./types";
import { flagMedicationConflictWithPatientDenial, runExtraction } from "./engine";
import { AiExtractionError } from "./ai";

const DOC_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

const aiProviderMeta: ExtractionProviderMetadata = {
  name: "gemini",
  model: "gemini-2.0-flash",
  createdAt: "2026-09-08T00:00:00.000Z",
};

function makeAiItem(overrides: Partial<ExtractedEvidenceItem> = {}): ExtractedEvidenceItem {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    documentId: DOC_ID,
    sessionId: SESSION_ID,
    category: "DIAGNOSIS",
    normalizedValue: { details: "Hypertension" },
    originalOcrWording: "Diagnosis: Hypertension",
    pageNumber: 1,
    extractionMethod: "AI",
    provider: aiProviderMeta,
    verificationState: "UNVERIFIED",
    ...overrides,
  };
}

describe("runExtraction", () => {
  it("always runs the deterministic engine and marks AI NOT_CONFIGURED when no AI", async () => {
    const pages = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes\nTab Metformin 500mg" }];
    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages);

    expect(run.extractionStatus).toBe("COMPLETED");
    expect(run.aiProviderState).toBe("NOT_CONFIGURED");
    expect(run.documentId).toBe(DOC_ID);
    expect(run.sessionId).toBe(SESSION_ID);
    expect(run.provider!.name).toBe("deterministic");
    // Deterministic items present
    expect(run.items.some((i) => i.category === "DIAGNOSIS")).toBe(true);
    expect(run.items.some((i) => i.category === "MEDICATION")).toBe(true);
    // All items are deterministic and unverified
    for (const item of run.items) {
      expect(item.extractionMethod).toBe("DETERMINISTIC");
      expect(item.verificationState).toBe("UNVERIFIED");
    }
  });

  it("merges AI items and reports SUCCESS when AI runs", async () => {
    const runAi = vi.fn().mockResolvedValue({
      items: [makeAiItem()],
      provider: aiProviderMeta,
    });
    const pages = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }];

    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages, { runAi });

    expect(runAi).toHaveBeenCalledTimes(1);
    expect(run.aiProviderState).toBe("SUCCESS");
    expect(run.provider!.name).toBe("gemini");
    expect(run.items.some((i) => i.extractionMethod === "AI")).toBe(true);
    expect(run.items.some((i) => i.extractionMethod === "DETERMINISTIC")).toBe(true);
  });

  it("reports FAILED when AI throws a non-AiExtractionError", async () => {
    const runAi = vi.fn().mockRejectedValue(new Error("network down"));
    const pages = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }];

    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages, { runAi });
    expect(run.aiProviderState).toBe("FAILED");
    // Deterministic items still produced
    expect(run.items.some((i) => i.extractionMethod === "DETERMINISTIC")).toBe(true);
  });

  it("reports MALFORMED_RESPONSE when AI fails contractually", async () => {
    const runAi = vi.fn().mockRejectedValue(new AiExtractionError("MALFORMED_RESPONSE", "bad"));
    const pages = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }];

    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages, { runAi });
    expect(run.aiProviderState).toBe("MALFORMED_RESPONSE");
  });

  it("reports UNAVAILABLE when AI is unavailable", async () => {
    const runAi = vi.fn().mockRejectedValue(new AiExtractionError("UNAVAILABLE", "timeout"));
    const pages = [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }];

    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages, { runAi });
    expect(run.aiProviderState).toBe("UNAVAILABLE");
  });

  it("preserves contradictions across merged items", async () => {
    const runAi = vi.fn().mockResolvedValue({
      items: [
        makeAiItem({
          category: "MEDICATION",
          normalizedValue: { name: "Metformin", dose: "1000mg" },
          originalOcrWording: "Tab Metformin 1000mg",
        }),
      ],
      provider: aiProviderMeta,
    });
    const pages = [{ pageNumber: 1, extractedText: "Tab Metformin 500mg" }];

    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages, { runAi });
    const meds = run.items.filter((i) => i.category === "MEDICATION");
    expect(meds.length).toBe(2);
    expect(meds[0].contradictionGroupId).toBe(meds[1].contradictionGroupId);
    expect(meds[0].contradictionGroupId).toBeDefined();
  });

  it("returns an empty run for documents with no evidence", async () => {
    const pages = [{ pageNumber: 1, extractedText: "Some unrelated text with no markers" }];
    const { run } = await runExtraction(DOC_ID, SESSION_ID, pages);
    expect(run.extractionStatus).toBe("COMPLETED");
    expect(run.items).toEqual([]);
    expect(run.aiProviderState).toBe("NOT_CONFIGURED");
  });
});

describe("flagMedicationConflictWithPatientDenial", () => {
  function medRun(): ExtractedEvidenceItem[] {
    return [
      makeAiItem({
        category: "MEDICATION",
        normalizedValue: { name: "Metformin", dose: "500mg" },
        originalOcrWording: "Tab Metformin 500mg",
      }),
    ];
  }

  it("flags medication when the patient explicitly denied medicines (No button)", () => {
    const [item] = medRun();
    const run = { items: [item] } as never;
    flagMedicationConflictWithPatientDenial(run, {
      medication_current: { questionId: "medication_current", state: "DENIED", provenance: "PATIENT" },
    });
    expect(item.contradictionGroupId).toBeDefined();
    expect(item.uncertaintyNotes).toMatch(/no current medicines/i);
    expect(item.verificationState).toBe("UNVERIFIED"); // never auto-resolved
  });

  it("flags medication on a free-text denial", () => {
    const [item] = medRun();
    const run = { items: [item] } as never;
    flagMedicationConflictWithPatientDenial(run, {
      medication_current: { questionId: "medication_current", state: "KNOWN", value: "No, I am not on anything", provenance: "PATIENT" },
    });
    expect(item.contradictionGroupId).toBeDefined();
  });

  it("does not flag when the patient is taking medicines", () => {
    const [item] = medRun();
    const before = { groupId: item.contradictionGroupId, notes: item.uncertaintyNotes };
    const run = { items: [item] } as never;
    flagMedicationConflictWithPatientDenial(run, {
      medication_current: { questionId: "medication_current", state: "KNOWN", value: "Metformin 500mg twice a day", provenance: "PATIENT" },
    });
    expect(item.contradictionGroupId).toBe(before.groupId);
    expect(item.uncertaintyNotes).toBe(before.notes);
  });

  it("does not flag when the answer is unknown or not asked", () => {
    for (const state of ["UNKNOWN", "DECLINED", "NOT_ASKED"]) {
      const [item] = medRun();
      const run = { items: [item] } as never;
      flagMedicationConflictWithPatientDenial(run, {
        medication_current: { questionId: "medication_current", state, provenance: "PATIENT" },
      });
      expect(item.contradictionGroupId).toBeUndefined();
      expect(item.uncertaintyNotes).toBeUndefined();
    }
  });

  it("leaves the run untouched when the document has no medication items", () => {
    const [item] = medRun();
    item.category = "DIAGNOSIS";
    const run = { items: [item] } as never;
    flagMedicationConflictWithPatientDenial(run, {
      medication_current: { questionId: "medication_current", state: "DENIED", provenance: "PATIENT" },
    });
    expect(item.contradictionGroupId).toBeUndefined();
  });

  it("preserves an existing contradiction group id", () => {
    const [item] = medRun();
    item.contradictionGroupId = "44444444-4444-4444-8444-444444444444";
    const run = { items: [item] } as never;
    flagMedicationConflictWithPatientDenial(run, {
      medication_current: { questionId: "medication_current", state: "DENIED", provenance: "PATIENT" },
    });
    expect(item.contradictionGroupId).toBe("44444444-4444-4444-8444-444444444444");
    expect(item.uncertaintyNotes).toMatch(/no current medicines/i);
  });
});
