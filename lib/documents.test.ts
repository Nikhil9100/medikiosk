import { describe, expect, it } from "vitest";
import {
  createDocumentRecord,
  createExtractedFact,
  isSupportedMimeType,
  transitionProcessingStatus,
  validateFileSize,
} from "./documents";

describe("document domain", () => {
  it("accepts supported MIME types", () => {
    expect(isSupportedMimeType("application/pdf")).toBe(true);
    expect(isSupportedMimeType("image/png")).toBe(true);
    expect(isSupportedMimeType("image/jpeg")).toBe(true);
    expect(isSupportedMimeType("image/webp")).toBe(true);
    expect(isSupportedMimeType("image/bmp")).toBe(true);
    expect(isSupportedMimeType("image/tiff")).toBe(true);
    expect(isSupportedMimeType("application/zip")).toBe(false);
    expect(isSupportedMimeType("text/plain")).toBe(false);
  });

  it("validates file size", () => {
    expect(validateFileSize(1024)).toBe(true);
    expect(validateFileSize(20 * 1024 * 1024)).toBe(true);
    expect(validateFileSize(20 * 1024 * 1024 + 1)).toBe(false);
  });

  it("creates a document record with RECEIVED status", () => {
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    const document = createDocumentRecord("session-1", file, "PRESCRIPTION");

    expect(document.id).toBeTruthy();
    expect(document.sessionId).toBe("session-1");
    expect(document.documentType).toBe("PRESCRIPTION");
    expect(document.status).toBe("RECEIVED");
    expect(document.processingStatus).toBe("RECEIVED");
    expect(document.originalFilename).toBe("test.pdf");
    expect(document.mimeType).toBe("application/pdf");
    expect(document.provenance).toBe("PATIENT");
    expect(document.ocrStatus).toBe("NOT_STARTED");
    expect(document.verificationStatus).toBe("UNVERIFIED");
    expect(document.errors).toEqual([]);
    expect(document.extractedFacts).toEqual([]);
  });

  it("creates a document record with OTHER type when not specified", () => {
    const file = new File(["content"], "scan.png", { type: "image/png" });
    const document = createDocumentRecord("session-1", file);

    expect(document.documentType).toBe("OTHER");
  });

  it("transitions processing status correctly", () => {
    expect(transitionProcessingStatus("RECEIVED", "VALIDATING")).toBe(true);
    expect(transitionProcessingStatus("RECEIVED", "FAILED")).toBe(true);
    expect(transitionProcessingStatus("RECEIVED", "OCR_PROCESSING")).toBe(false);
    expect(transitionProcessingStatus("VALIDATING", "READY_FOR_OCR")).toBe(true);
    expect(transitionProcessingStatus("READY_FOR_OCR", "OCR_PROCESSING")).toBe(true);
    expect(transitionProcessingStatus("OCR_PROCESSING", "OCR_COMPLETE")).toBe(true);
    expect(transitionProcessingStatus("OCR_COMPLETE", "EXTRACTION_PROCESSING")).toBe(true);
    expect(transitionProcessingStatus("EXTRACTION_COMPLETE", "NEEDS_REVIEW")).toBe(true);
    expect(transitionProcessingStatus("NEEDS_REVIEW", "VERIFIED")).toBe(true);
    expect(transitionProcessingStatus("VERIFIED", "FAILED")).toBe(true);
    expect(transitionProcessingStatus("VERIFIED", "READY_FOR_OCR")).toBe(false);
  });

  it("creates extracted facts with correct provenance", () => {
    const fact = createExtractedFact("symptom_1", "headache", "SYSTEM", { page: 1 }, 0.95);

    expect(fact.questionId).toBe("symptom_1");
    expect(fact.value).toBe("headache");
    expect(fact.state).toBe("KNOWN");
    expect(fact.provenance).toBe("SYSTEM");
    expect(fact.sourceReference?.page).toBe(1);
    expect(fact.confidence).toBe(0.95);
  });

  it("marks empty extracted facts as UNKNOWN", () => {
    const fact = createExtractedFact("symptom_2", undefined, "SYSTEM");

    expect(fact.state).toBe("UNKNOWN");
    expect(fact.value).toBeUndefined();
    expect(fact.provenance).toBe("SYSTEM");
  });
});
