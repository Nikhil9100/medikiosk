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
vi.mock("@/lib/extraction/engine", () => ({
  runExtraction: vi.fn(),
}));

import { getActiveKioskSession } from "@/lib/db/session-scope";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { POST, GET, PATCH } from "./route";
import { POST as retryPOST } from "./retry/route";
import { runExtraction } from "@/lib/extraction/engine";
import { makeFakeSession } from "../../../../../../test/db-mocks";

const mockRepo = {
  findById: vi.fn(),
  getBuffer: vi.fn(),
  update: vi.fn(),
  getDocumentWithOcr: vi.fn(),
  getExtractionRun: vi.fn(),
  saveExtractionRun: vi.fn(),
  updateEvidenceVerification: vi.fn(),
};

const DOC = {
  id: "doc-123",
  sessionId: "session-123",
  processingStatus: "OCR_COMPLETE",
  ocrStatus: "COMPLETED",
  errors: [],
};

const RUN = {
  documentId: "doc-123",
  sessionId: "session-123",
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      documentId: "doc-123",
      sessionId: "session-123",
      category: "DIAGNOSIS",
      normalizedValue: { details: "Diabetes" },
      originalOcrWording: "Diagnosis: Diabetes",
      pageNumber: 1,
      extractionMethod: "DETERMINISTIC",
      provider: { name: "deterministic", createdAt: "2026-09-08T00:00:00.000Z" },
      verificationState: "UNVERIFIED",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      documentId: "doc-123",
      sessionId: "session-123",
      category: "MEDICATION",
      normalizedValue: { name: "Metformin", dose: "500mg" },
      originalOcrWording: "Tab Metformin 500mg",
      pageNumber: 1,
      extractionMethod: "DETERMINISTIC",
      provider: { name: "deterministic", createdAt: "2026-09-08T00:00:00.000Z" },
      verificationState: "UNVERIFIED",
    },
  ],
  extractionStatus: "COMPLETED",
  aiProviderState: "NOT_CONFIGURED",
  provider: { name: "deterministic", createdAt: "2026-09-08T00:00:00.000Z" },
  createdAt: "2026-09-08T00:00:00.000Z",
};

function setup(sessionId: string | null, doc: any = DOC) {
  vi.mocked(getActiveKioskSession).mockResolvedValue(sessionId ? makeFakeSession({ id: sessionId }) : null);
  vi.mocked(scopedDocumentRepository).mockReturnValue(mockRepo);
  vi.mocked(mockRepo.findById).mockResolvedValue(doc);
}

describe("POST /api/patient/documents/[id]/extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup("session-123");
    vi.mocked(runExtraction).mockResolvedValue({ run: RUN } as any);
    vi.mocked(mockRepo.getDocumentWithOcr).mockResolvedValue({
      ...DOC,
      ocrResults: [{ pages: [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }] }],
    } as any);
    vi.mocked(mockRepo.update).mockResolvedValue(DOC as any);
    vi.mocked(mockRepo.saveExtractionRun).mockResolvedValue(RUN as any);
  });

  it("returns 404 when there is no active session", async () => {
    setup(null);
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("No active session");
  });

  it("returns 404 for non-existent document", async () => {
    setup("session-123", null);
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("Document not found");
  });

  it("rejects extraction when OCR is not complete", async () => {
    setup("session-123", { ...DOC, processingStatus: "READY_FOR_OCR" });
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("OCR_NOT_READY");
  });

  it("rejects extraction when already complete", async () => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(RUN as any);
    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("EXTRACTION_ALREADY_COMPLETE");
  });

  it("runs extraction and persists the run", async () => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(data.aiProviderState).toBe("NOT_CONFIGURED");
    expect(data.items.length).toBe(2);
    expect(mockRepo.saveExtractionRun).toHaveBeenCalledWith("doc-123", RUN);
    expect(mockRepo.update).toHaveBeenCalledWith("doc-123", expect.objectContaining({
      processingStatus: "EXTRACTION_COMPLETE",
      extractionStatus: "COMPLETED",
    }));
  });

  it("marks document FAILED on extraction error", async () => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(null);
    vi.mocked(runExtraction).mockRejectedValueOnce(new Error("boom"));

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    expect(response.status).toBe(500);
    expect(mockRepo.update).toHaveBeenCalledWith("doc-123", expect.objectContaining({
      processingStatus: "FAILED",
      extractionStatus: "FAILED",
      failureStage: "EXTRACTION",
    }));
  });
});

describe("GET /api/patient/documents/[id]/extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup("session-123");
  });

  it("returns NOT_STARTED when no run exists", async () => {
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("NOT_STARTED");
    expect(data.items).toEqual([]);
  });

  it("returns the run when one exists", async () => {
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(RUN as any);
    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(data.items.length).toBe(2);
  });
});

describe("PATCH /api/patient/documents/[id]/extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(RUN as any);
  });

  it("accepts an evidence item (Accept)", async () => {
    vi.mocked(mockRepo.updateEvidenceVerification).mockResolvedValue({
      ...RUN.items[0],
      verificationState: "ACCEPTED",
    } as any);

    const response = await PATCH(
      new Request("http://localhost/api/patient/documents/doc-123/extraction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "11111111-1111-4111-8111-111111111111", verificationState: "ACCEPTED" }),
      }),
      { params: Promise.resolve({ id: "doc-123" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.item.verificationState).toBe("ACCEPTED");
    expect(mockRepo.updateEvidenceVerification).toHaveBeenCalledWith("doc-123", "11111111-1111-4111-8111-111111111111", "ACCEPTED");
  });

  it("rejects an evidence item (Reject)", async () => {
    vi.mocked(mockRepo.updateEvidenceVerification).mockResolvedValue({
      ...RUN.items[0],
      verificationState: "REJECTED",
    } as any);

    const response = await PATCH(
      new Request("http://localhost/api/patient/documents/doc-123/extraction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "11111111-1111-4111-8111-111111111111", verificationState: "REJECTED" }),
      }),
      { params: Promise.resolve({ id: "doc-123" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.item.verificationState).toBe("REJECTED");
  });

  it("resets an evidence item (Reset to UNVERIFIED)", async () => {
    vi.mocked(mockRepo.updateEvidenceVerification).mockResolvedValue({
      ...RUN.items[0],
      verificationState: "UNVERIFIED",
    } as any);

    const response = await PATCH(
      new Request("http://localhost/api/patient/documents/doc-123/extraction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "11111111-1111-4111-8111-111111111111", verificationState: "UNVERIFIED" }),
      }),
      { params: Promise.resolve({ id: "doc-123" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.item.verificationState).toBe("UNVERIFIED");
  });

  it("returns 400 for invalid review patch", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/patient/documents/doc-123/extraction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "x", verificationState: "INVALID" }),
      }),
      { params: Promise.resolve({ id: "doc-123" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.code).toBe("INVALID_REVIEW_PATCH");
  });

  it("returns 404 for unknown evidence item", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/patient/documents/doc-123/extraction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "99999999-9999-4999-8999-999999999999", verificationState: "ACCEPTED" }),
      }),
      { params: Promise.resolve({ id: "doc-123" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.code).toBe("ITEM_NOT_FOUND");
  });
});

describe("POST /api/patient/documents/[id]/extraction/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup("session-123");
    vi.mocked(runExtraction).mockResolvedValue({ run: RUN } as any);
    vi.mocked(mockRepo.getDocumentWithOcr).mockResolvedValue({
      ...DOC,
      ocrResults: [{ pages: [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }] }],
    } as any);
    vi.mocked(mockRepo.update).mockResolvedValue(DOC as any);
    vi.mocked(mockRepo.saveExtractionRun).mockResolvedValue(RUN as any);
  });

  it("returns 404 when there is no active session", async () => {
    setup(null);
    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    expect(response.status).toBe(404);
  });

  it("allows retry on a failed extraction run", async () => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue({ ...RUN, extractionStatus: "FAILED" } as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(mockRepo.saveExtractionRun).toHaveBeenCalled();
  });

  it("rejects retry when extraction already complete", async () => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(RUN as any);
    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("EXTRACTION_ALREADY_COMPLETE");
  });

  it("rejects retry in a non-retryable state", async () => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue({ ...RUN, extractionStatus: "NOT_STARTED" } as any);
    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("RETRY_NOT_ALLOWED");
  });

  it("allows retry when document is FAILED + EXTRACTION and no prior run exists", async () => {
    setup("session-123", { ...DOC, processingStatus: "FAILED", failureStage: "EXTRACTION", ocrStatus: "COMPLETED" });
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue(null);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(mockRepo.saveExtractionRun).toHaveBeenCalled();
  });

  it.each(["MALFORMED_RESPONSE", "UNAVAILABLE"] as const)("allows retry when prior run has status %s (safety net)", async (status) => {
    setup("session-123");
    vi.mocked(mockRepo.getExtractionRun).mockResolvedValue({ ...RUN, extractionStatus: status } as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(mockRepo.saveExtractionRun).toHaveBeenCalled();
  });
});
