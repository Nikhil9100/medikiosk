/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/pool", () => ({
  databaseConfigured: vi.fn(() => true),
  withKioskTx: vi.fn((_id: string, fn: (c: unknown) => unknown) => fn({})),
}));
vi.mock("@/lib/db/session-scope", () => ({
  getActiveKioskSession: vi.fn(),
}));
vi.mock("@/lib/db/scoped-document-repository", () => ({
  scopedDocumentRepository: vi.fn(),
}));
vi.mock("@/lib/ocr/pipeline", () => ({
  processDocumentForOcr: vi.fn(),
}));

import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { POST, GET } from "./route";
import { POST as retryPOST } from "./retry/route";
import { processDocumentForOcr } from "@/lib/ocr/pipeline";
import { makeFakeSession } from "../../../../../../test/db-mocks";

const mockRepo = {
  findById: vi.fn(),
  update: vi.fn(),
  getBuffer: vi.fn(),
  addOcrResult: vi.fn(),
  getDocumentWithOcr: vi.fn(),
};

function setup(sessionId: string | null, doc: any = null) {
  vi.mocked(getActiveKioskSession).mockResolvedValue(sessionId ? makeFakeSession({ id: sessionId }) : null);
  vi.mocked(scopedDocumentRepository).mockReturnValue(mockRepo);
  vi.mocked(mockRepo.findById).mockResolvedValue(doc);
}

describe("POST /api/patient/documents/[id]/ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when there is no active session", async () => {
    setup(null);
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("No active session");
  });

  it("returns 404 for non-existent document", async () => {
    setup("session-123", null);
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("Document not found");
  });

  it("rejects OCR on already completed document", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      errors: [],
    });
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe("OCR already completed");
  });

  it("denies a session access to another session's document (no cross-patient access)", async () => {
    // Patient B's session touches Patient A's document.
    setup("session-patient-b", {
      id: "patient-a-doc",
      sessionId: "session-patient-a",
      processingStatus: "READY_FOR_OCR",
      ocrStatus: "PENDING",
      mimeType: "application/pdf",
      errors: [],
    });
    const response = await POST(new Request("http://localhost/api/patient/documents/patient-a-doc/ocr"), { params: Promise.resolve({ id: "patient-a-doc" }) });
    const data = await response.json();
    expect(response.status).toBe(403);
    expect(data.error).toBe("Access denied");
  });

  it("rejects OCR on document without stored buffer", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "READY_FOR_OCR",
      ocrStatus: "PENDING",
      mimeType: "application/pdf",
      errors: [],
    });
    vi.mocked(mockRepo.update).mockResolvedValue({ id: "doc-123", processingStatus: "OCR_PROCESSING", ocrStatus: "PROCESSING" });
    vi.mocked(mockRepo.getBuffer).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(410);
    expect(data.error).toBe("Document buffer not available");
  });

  it("processes OCR successfully", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "READY_FOR_OCR",
      ocrStatus: "PENDING",
      mimeType: "image/png",
      errors: [],
    });
    vi.mocked(mockRepo.update).mockResolvedValue({ id: "doc-123", sessionId: "session-123", processingStatus: "OCR_PROCESSING", ocrStatus: "PROCESSING" });
    vi.mocked(mockRepo.getBuffer).mockResolvedValue(new ArrayBuffer(8));
    vi.mocked(processDocumentForOcr).mockResolvedValue({
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      ocrResults: [
        {
          documentId: "doc-123",
          sessionId: "session-123",
          pages: [{ pageNumber: 1, extractedText: "test", language: "eng" }],
          providerMetadata: { provider: "tesseract", language: "eng", createdAt: new Date().toISOString() },
          handwritingDetected: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    vi.mocked(mockRepo.addOcrResult).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.status).toBe("OCR_COMPLETE");
    expect(data.ocrStatus).toBe("COMPLETED");
  });

  it("handles provider failure gracefully", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "READY_FOR_OCR",
      ocrStatus: "PENDING",
      mimeType: "application/pdf",
      errors: [],
    });
    vi.mocked(mockRepo.update).mockResolvedValue({ id: "doc-123", processingStatus: "OCR_PROCESSING", ocrStatus: "PROCESSING" });
    vi.mocked(mockRepo.getBuffer).mockResolvedValue(new ArrayBuffer(8));
    vi.mocked(processDocumentForOcr).mockRejectedValue(new Error("Provider timeout"));

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBe("OCR failed");
    // The failure was persisted with the OCR failure stage.
    const failUpdate = vi.mocked(mockRepo.update).mock.calls.find((c) => (c[1] as any)?.failureStage === "OCR");
    expect(failUpdate).toBeTruthy();
  });

  it("rejects OCR on a document that failed at extraction", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "FAILED",
      ocrStatus: "COMPLETED",
      failureStage: "EXTRACTION",
      errors: [],
    });
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe("OCR cannot restart after an extraction failure");
  });
});

describe("GET /api/patient/documents/[id]/ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when there is no active session", async () => {
    setup(null);
    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    expect(response.status).toBe(404);
  });

  it("returns OCR status for owned document", async () => {
    setup("session-123", { id: "doc-123", sessionId: "session-123", processingStatus: "OCR_COMPLETE", ocrStatus: "COMPLETED" });
    vi.mocked(mockRepo.getDocumentWithOcr).mockResolvedValue({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      ocrResults: [
        {
          documentId: "doc-123",
          sessionId: "session-123",
          pages: [{ pageNumber: 1, extractedText: "test", language: "eng" }],
          providerMetadata: { provider: "tesseract", language: "eng", createdAt: new Date().toISOString() },
          handwritingDetected: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ocrStatus).toBe("COMPLETED");
    expect(data.ocrResults).toHaveLength(1);
    expect(data.ocrResults[0].pages).toHaveLength(1);
  });

  it("returns 404 for non-existent document", async () => {
    setup("session-123", null);
    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("Document not found");
  });
});

describe("POST /api/patient/documents/[id]/ocr/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when there is no active session", async () => {
    setup(null);
    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    expect(response.status).toBe(404);
  });

  it("rejects retry on non-failed document", async () => {
    setup("session-123", { id: "doc-123", sessionId: "session-123", processingStatus: "OCR_COMPLETE", ocrStatus: "COMPLETED", errors: [] });
    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe("Only failed OCR jobs can be retried");
  });

  it("retries failed OCR successfully", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "FAILED",
      ocrStatus: "FAILED",
      mimeType: "image/png",
      errors: ["Previous error"],
    });
    vi.mocked(mockRepo.update).mockResolvedValue({ id: "doc-123", sessionId: "session-123", processingStatus: "OCR_PROCESSING", ocrStatus: "PROCESSING" });
    vi.mocked(mockRepo.getBuffer).mockResolvedValue(new ArrayBuffer(8));
    vi.mocked(processDocumentForOcr).mockResolvedValue({
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      ocrResults: [
        {
          documentId: "doc-123",
          sessionId: "session-123",
          pages: [{ pageNumber: 1, extractedText: "retried", language: "eng" }],
          providerMetadata: { provider: "tesseract", language: "eng", createdAt: new Date().toISOString() },
          handwritingDetected: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    vi.mocked(mockRepo.addOcrResult).mockResolvedValue(null);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.status).toBe("OCR_COMPLETE");
    expect(data.ocrStatus).toBe("COMPLETED");
  });

  it("rejects OCR retry on a document that failed at extraction", async () => {
    setup("session-123", {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "FAILED",
      ocrStatus: "COMPLETED",
      failureStage: "EXTRACTION",
      errors: [],
    });
    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe("This document failed at extraction. Use the extraction retry instead.");
  });
});
