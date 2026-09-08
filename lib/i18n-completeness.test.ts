import { describe, expect, it } from "vitest";
import { translations, getMissingTranslationKeys } from "./i18n";

describe("i18n six-language coverage (incl. Phase 6C extraction copy)", () => {
  const languages = ["en", "hi", "bn", "te", "ta", "mr"] as const;

  it("has complete copy for every supported patient language", () => {
    for (const language of languages) {
      expect(language in translations).toBe(true);
      expect(getMissingTranslationKeys(language)).toEqual([]);
    }
  });

  it("has every Phase 6C extraction key defined in all languages", () => {
    const extractionKeys = [
      "documentStartExtraction",
      "documentRetryExtraction",
      "documentExtracting",
      "documentExtractionComplete",
      "documentExtractionHelper",
      "documentNoExtraction",
      "documentNoEvidence",
      "documentExtractionListTitle",
      "evidenceCategoryDiagnosis",
      "evidenceCategoryMedication",
      "evidenceCategoryInvestigation",
      "evidenceCategoryProcedure",
      "evidenceCategoryAllergy",
      "evidenceCategoryMedicalHistory",
      "evidenceCategoryChronology",
      "evidenceMethodDeterministic",
      "evidenceMethodAi",
      "evidenceAccept",
      "evidenceReject",
      "evidenceReset",
      "evidenceAccepted",
      "evidenceRejected",
      "evidencePending",
      "evidenceContradiction",
      "evidenceOriginalWording",
      "evidenceUncertainty",
    ] as const;

    for (const language of languages) {
      for (const key of extractionKeys) {
        const value = translations[language][key];
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});