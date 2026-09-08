import { describe, expect, it } from "vitest";
import {
  EVIDENCE_CATEGORY_ORDER,
  evidenceCategoryKey,
  evidenceMethodKey,
  formatEvidenceValue,
} from "./ui";

describe("extraction UI helpers", () => {
  it("orders all seven categories", () => {
    expect(EVIDENCE_CATEGORY_ORDER).toEqual([
      "DIAGNOSIS",
      "MEDICATION",
      "INVESTIGATION",
      "PROCEDURE",
      "ALLERGY",
      "MEDICAL_HISTORY",
      "CHRONOLOGY",
    ]);
  });

  it("maps every category to a translation key", () => {
    for (const category of EVIDENCE_CATEGORY_ORDER) {
      expect(evidenceCategoryKey(category)).toMatch(/^evidenceCategory/);
    }
  });

  it("maps methods to translation keys", () => {
    expect(evidenceMethodKey("DETERMINISTIC")).toBe("evidenceMethodDeterministic");
    expect(evidenceMethodKey("AI")).toBe("evidenceMethodAi");
  });

  it("formats medication values with dose and frequency", () => {
    expect(
      formatEvidenceValue({ name: "Metformin", dose: "500mg", frequency: "BD" }),
    ).toBe("Metformin · 500mg · BD");
  });

  it("formats details", () => {
    expect(formatEvidenceValue({ details: "Type 2 Diabetes" })).toBe("Type 2 Diabetes");
  });

  it("formats date", () => {
    expect(formatEvidenceValue({ date: "12/03/2026" })).toBe("12/03/2026");
  });

  it("formats value with unit", () => {
    expect(formatEvidenceValue({ value: "142", unit: "mg/dL" })).toBe("142 mg/dL");
  });

  it("returns empty string for empty value", () => {
    expect(formatEvidenceValue({})).toBe("");
  });
});