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
    findBySessionId: vi.fn(),
    getBuffer: vi.fn(),
    update: vi.fn(),
    addOcrResult: vi.fn(),
    getDocumentWithOcr: vi.fn(),
  },
}));

vi.mock("@/lib/ocr/pipeline", () => ({
  processDocumentForOcr: vi.fn(),
}));

import { cookies } from "next/headers";
import { POST, GET, POST_RETRY } from "./route";
import { documentRepository } from "@/lib/ocr/document-repository";
import { processDocumentForOcr } from "@/lib/ocr/pipeline";

describe("POST /api/patient/documents/[id]/ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
  });

  it("requires authentication", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null }, error: { message: "unauthorized" } })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("requires active session", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    currentSessionId = null;
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("No active session");
  });

  it("returns 404 for non-existent document", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    vi.mocked(documentRepository.findById).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Document not found");
  });

  it("rejects OCR on already completed document", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    vi.mocked(documentRepository.findById).mockResolvedValueOnce({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      errors: [],
    } as any);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("OCR already completed");
  });

  it("rejects OCR on document without stored buffer", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    vi.mocked(documentRepository.findById).mockResolvedValueOnce({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "READY_FOR_OCR",
      ocrStatus: "PENDING",
      mimeType: "application/pdf",
      errors: [],
    } as any);

    vi.mocked(documentRepository.update).mockResolvedValueOnce({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_PROCESSING",
      ocrStatus: "PROCESSING",
    } as any);

    vi.mocked(documentRepository.getBuffer).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toBe("Document buffer not available");
  });

  it("processes OCR successfully", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    const mockDocument = {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "READY_FOR_OCR" as const,
      ocrStatus: "PENDING" as const,
      mimeType: "image/png",
      errors: [] as string[],
    };

    vi.mocked(documentRepository.findById).mockResolvedValueOnce(mockDocument as any);
    vi.mocked(documentRepository.update).mockResolvedValueOnce({ ...mockDocument, processingStatus: "OCR_PROCESSING", ocrStatus: "PROCESSING" } as any);
    vi.mocked(documentRepository.getBuffer).mockResolvedValueOnce(new ArrayBuffer(8));
    vi.mocked(processDocumentForOcr).mockResolvedValueOnce({
      ...mockDocument,
      processingStatus: "OCR_COMPLETE" as const,
      ocrStatus: "COMPLETED" as const,
      ocrResults: [{
        documentId: "doc-123",
        sessionId: "session-123",
        pages: [{ pageNumber: 1, extractedText: "test", language: "eng" as any }],
        providerMetadata: { provider: "tesseract", language: "eng" as any, createdAt: new Date().toISOString() },
        handwritingDetected: false,
        createdAt: new Date().toISOString(),
      }],
    } as any);
    vi.mocked(documentRepository.addOcrResult).mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("OCR_COMPLETE");
    expect(data.ocrStatus).toBe("COMPLETED");
  });

  it("handles provider failure gracefully", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    const mockDocument = {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "READY_FOR_OCR" as const,
      ocrStatus: "PENDING" as const,
      mimeType: "application/pdf",
      errors: [] as string[],
    };

    vi.mocked(documentRepository.findById).mockResolvedValueOnce(mockDocument as any);
    vi.mocked(documentRepository.update).mockResolvedValueOnce({ ...mockDocument, processingStatus: "OCR_PROCESSING", ocrStatus: "PROCESSING" } as any);
    vi.mocked(documentRepository.getBuffer).mockResolvedValueOnce(new ArrayBuffer(8));
    vi.mocked(processDocumentForOcr).mockRejectedValueOnce(new Error("Provider timeout"));
    vi.mocked(documentRepository.update).mockResolvedValueOnce({ ...mockDocument, processingStatus: "FAILED", ocrStatus: "FAILED", errors: ["Provider timeout"] } as any);

    const response = await POST(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("OCR failed");
  });
});

describe("GET /api/patient/documents/[id]/ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
  });

  it("requires authentication", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null }, error: { message: "unauthorized" } })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("returns OCR status for owned document", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    vi.mocked(documentRepository.findById).mockResolvedValueOnce({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
    } as any);

    vi.mocked(documentRepository.getDocumentWithOcr).mockResolvedValueOnce({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      ocrResults: [{
        documentId: "doc-123",
        sessionId: "session-123",
        pages: [{ pageNumber: 1, extractedText: "test", language: "eng" as any }],
        providerMetadata: { provider: "tesseract", language: "eng" as any, createdAt: new Date().toISOString() },
        handwritingDetected: false,
        createdAt: new Date().toISOString(),
      }],
    } as any);

    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ocrStatus).toBe("COMPLETED");
    expect(data.ocrResults).toHaveLength(1);
    expect(data.ocrResults[0].pages).toHaveLength(1);
  });

  it("returns 404 for non-existent document", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    vi.mocked(documentRepository.findById).mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/patient/documents/doc-123/ocr"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Document not found");
  });
});

describe("POST /api/patient/documents/[id]/ocr/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSessionId = "session-123";
    vi.mocked(cookies).mockReturnValue(createMockCookies(currentSessionId) as any);
  });

  it("requires authentication", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null }, error: { message: "unauthorized" } })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    const response = await POST_RETRY(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Authentication required");
  });

  it("rejects retry on non-failed document", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    vi.mocked(documentRepository.findById).mockResolvedValueOnce({
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "OCR_COMPLETE",
      ocrStatus: "COMPLETED",
      errors: [],
    } as any);

    const response = await POST_RETRY(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Only failed OCR jobs can be retried");
  });

  it("retries failed OCR successfully", async () => {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } }, error: null })),
      },
    } as unknown as ReturnType<typeof createSupabaseServerClient>);

    vi.mocked(cookies).mockReturnValue(createMockCookies("session-123"));

    const mockDocument = {
      id: "doc-123",
      sessionId: "session-123",
      processingStatus: "FAILED" as const,
      ocrStatus: "FAILED" as const,
      mimeType: "image/png",
      errors: ["Previous error"],
    };

    vi.mocked(documentRepository.findById).mockResolvedValueOnce(mockDocument as any);
    vi.mocked(documentRepository.update).mockResolvedValueOnce({ ...mockDocument, processingStatus: "READY_FOR_OCR", ocrStatus: "PENDING", errors: [] } as any);
    vi.mocked(documentRepository.getBuffer).mockResolvedValueOnce(new ArrayBuffer(8));
    vi.mocked(processDocumentForOcr).mockResolvedValueOnce({
      ...mockDocument,
      processingStatus: "OCR_COMPLETE" as const,
      ocrStatus: "COMPLETED" as const,
      ocrResults: [],
    } as any);
    vi.mocked(documentRepository.addOcrResult).mockResolvedValueOnce(null);

    const response = await POST_RETRY(new Request("http://localhost/api/patient/documents/doc-123/ocr/retry"), { params: Promise.resolve({ id: "doc-123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("OCR_COMPLETE");
    expect(data.ocrStatus).toBe("COMPLETED");
  });
});
