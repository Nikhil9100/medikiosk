/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123" } },
        error: null,
      })),
    },
  })),
}));

let currentSessionId: string | null = "session-123";

const createMockCookies = (sessionId: string | null) => {
  const store = new Map<string, { name: string; value: string }>();
  if (sessionId) {
    store.set("medikiosk_session", { name: "medikiosk_session", value: sessionId });
  }
  return Promise.resolve({
    get: vi.fn((name: string) => store.get(name) ?? undefined),
    getAll: vi.fn(() => Array.from(store.values())),
    has: vi.fn((name: string) => store.has(name)),
    [Symbol.iterator]: vi.fn(function* () {
      yield* store.values();
    }),
    size: store.size,
  });
};

// @ts-ignore
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => createMockCookies(currentSessionId)),
}));

vi.mock("@/lib/ocr/document-repository", () => ({
  documentRepository: {
    findById: vi.fn(),
    getBuffer: vi.fn(),
    update: vi.fn(),
    getDocumentWithOcr: vi.fn(),
    getExtractionRun: vi.fn(),
    saveExtractionRun: vi.fn(),
    updateEvidenceVerification: vi.fn(),
  },
}));

vi.mock("@/lib/extraction/engine", () => ({
  runExtraction: vi.fn(),
}));

import { cookies } from "next/headers";
import { POST, GET, PATCH } from "./route";
import { POST as retryPOST } from "./retry/route";
import { documentRepository } from "@/lib/ocr/document-repository";
import { runExtraction } from "@/lib/extraction/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

const withAuth = (overrides = {}) => {
  vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
    },
    ...overrides,
  } as unknown as ReturnType<typeof createSupabaseServerClient>);
};

describe("POST /api/patient/documents/[id]/extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
    vi.mocked(documentRepository.findById).mockResolvedValue(DOC as any);
    vi.mocked(runExtraction).mockResolvedValue({ run: RUN } as any);
    vi.mocked(documentRepository.getDocumentWithOcr).mockResolvedValue({
      ...DOC,
      ocrResults: [{ pages: [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }] }],
    } as any);
    vi.mocked(documentRepository.update).mockResolvedValue(DOC as any);
    vi.mocked(documentRepository.saveExtractionRun).mockResolvedValue(RUN as any);
  });

  it("requires authentication", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null }, error: { message: "unauthorized" } })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("requires active session", async () => {
    withAuth();
    currentSessionId = null;
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("No active session");
  });

  it("returns 404 for non-existent document", async () => {
    withAuth();
    vi.mocked(documentRepository.findById).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe("Document not found");
  });

  it("rejects extraction when OCR is not complete", async () => {
    withAuth();
    vi.mocked(documentRepository.findById).mockResolvedValueOnce({
      ...DOC,
      processingStatus: "READY_FOR_OCR",
    } as any);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("OCR_NOT_READY");
  });

  it("rejects extraction when already complete", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(RUN as any);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("EXTRACTION_ALREADY_COMPLETE");
  });

  it("runs extraction and persists the run", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(data.aiProviderState).toBe("NOT_CONFIGURED");
    expect(data.items.length).toBe(2);
    expect(documentRepository.saveExtractionRun).toHaveBeenCalledWith("doc-123", RUN);
    expect(documentRepository.update).toHaveBeenCalledWith("doc-123", expect.objectContaining({
      processingStatus: "EXTRACTION_COMPLETE",
      extractionStatus: "COMPLETED",
    }));
  });

  it("marks document FAILED on extraction error", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(null);
    vi.mocked(runExtraction).mockRejectedValueOnce(new Error("boom"));

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    expect(response.status).toBe(500);
    expect(documentRepository.update).toHaveBeenCalledWith("doc-123", expect.objectContaining({
      processingStatus: "FAILED",
      extractionStatus: "FAILED",
      failureStage: "EXTRACTION",
    }));
  });
});

describe("GET /api/patient/documents/[id]/extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
    vi.mocked(documentRepository.findById).mockResolvedValue(DOC as any);
  });

  it("returns NOT_STARTED when no run exists", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/extraction"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("NOT_STARTED");
    expect(data.items).toEqual([]);
  });

  it("returns the run when one exists", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(RUN as any);

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
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
    vi.mocked(documentRepository.findById).mockResolvedValue(DOC as any);
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValue(RUN as any);
  });

  it("accepts an evidence item (Accept)", async () => {
    withAuth();
    vi.mocked(documentRepository.updateEvidenceVerification).mockResolvedValueOnce({
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
    expect(documentRepository.updateEvidenceVerification).toHaveBeenCalledWith("doc-123", "11111111-1111-4111-8111-111111111111", "ACCEPTED");
  });

  it("rejects an evidence item (Reject)", async () => {
    withAuth();
    vi.mocked(documentRepository.updateEvidenceVerification).mockResolvedValueOnce({
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
    withAuth();
    vi.mocked(documentRepository.updateEvidenceVerification).mockResolvedValueOnce({
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
    withAuth();

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
    withAuth();

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
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
    vi.mocked(documentRepository.findById).mockResolvedValue(DOC as any);
    vi.mocked(runExtraction).mockResolvedValue({ run: RUN } as any);
    vi.mocked(documentRepository.getDocumentWithOcr).mockResolvedValue({
      ...DOC,
      ocrResults: [{ pages: [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }] }],
    } as any);
    vi.mocked(documentRepository.update).mockResolvedValue(DOC as any);
    vi.mocked(documentRepository.saveExtractionRun).mockResolvedValue(RUN as any);
  });

  it("requires authentication", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null }, error: { message: "unauthorized" } })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("allows retry on a failed extraction run", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce({
      ...RUN,
      extractionStatus: "FAILED",
    } as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(documentRepository.saveExtractionRun).toHaveBeenCalled();
  });

  it("rejects retry when extraction already complete", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(RUN as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("EXTRACTION_ALREADY_COMPLETE");
  });

  it("rejects retry in a non-retryable state", async () => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce({
      ...RUN,
      extractionStatus: "NOT_STARTED",
    } as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("RETRY_NOT_ALLOWED");
  });

  it("allows retry when document is FAILED + EXTRACTION and no prior run exists", async () => {
    withAuth();
    vi.mocked(documentRepository.findById).mockResolvedValueOnce({
      ...DOC,
      processingStatus: "FAILED",
      failureStage: "EXTRACTION",
      ocrStatus: "COMPLETED",
    } as any);
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce(null);
    vi.mocked(documentRepository.getDocumentWithOcr).mockResolvedValueOnce({
      ...DOC,
      ocrResults: [{ pages: [{ pageNumber: 1, extractedText: "Diagnosis: Diabetes" }] }],
    } as any);
    vi.mocked(runExtraction).mockResolvedValueOnce({ run: RUN } as any);
    vi.mocked(documentRepository.update).mockResolvedValue(DOC as any);
    vi.mocked(documentRepository.saveExtractionRun).mockResolvedValue(RUN as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(documentRepository.saveExtractionRun).toHaveBeenCalled();
  });

  it.each(["MALFORMED_RESPONSE", "UNAVAILABLE"] as const)("allows retry when prior run has status %s (safety net)", async (status) => {
    withAuth();
    vi.mocked(documentRepository.getExtractionRun).mockResolvedValueOnce({
      ...RUN,
      extractionStatus: status,
    } as any);

    const response = await retryPOST(new Request("http://localhost/api/patient/documents/doc-123/extraction/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.extractionStatus).toBe("COMPLETED");
    expect(documentRepository.saveExtractionRun).toHaveBeenCalled();
  });
});
