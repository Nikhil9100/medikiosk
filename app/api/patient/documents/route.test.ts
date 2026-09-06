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

// @ts-ignore
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: vi.fn((name: string) => name === "medikiosk_session" ? { name: "medikiosk_session", value: "session-123" } : undefined),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    [Symbol.iterator]: vi.fn(function* () { yield* []; }),
    size: 0,
  })),
}));

import { cookies } from "next/headers";
import { POST, GET } from "./route";
import { documentRepository } from "@/lib/ocr/document-repository";

describe("POST /api/patient/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockReturnValue({
      get: vi.fn((name: string) => name === "medikiosk_session" ? { value: "session-123" } : undefined),
      set: vi.fn(),
    } as any);
    (documentRepository as any).findBySessionId = vi.fn().mockResolvedValueOnce([]);
  });

  it("rejects missing file", async () => {
    const formData = new FormData();
    formData.append("documentType", "PRESCRIPTION");
    
    const req = {
      formData: async () => formData,
    } as unknown as Request;
    
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File is required");
  });

  it("rejects unsupported MIME type", async () => {
    class MockFile extends File {
      private content: string | ArrayBuffer;

      constructor(content: string | ArrayBuffer, name: string, mimeType: string) {
        super([], name, { type: mimeType });
        this.content = content;
        Object.defineProperty(this, "size", {
          get() {
            if (typeof this.content === "string") {
              return new TextEncoder().encode(this.content).length;
            }
            return this.content.byteLength;
          },
        });
      }

      async arrayBuffer() {
        if (typeof this.content === "string") {
          return new TextEncoder().encode(this.content).buffer;
        }
        return this.content;
      }
    }

    const file = new MockFile("content", "test.txt", "text/plain");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", "PRESCRIPTION");

    const response = await POST({
      formData: async () => formData,
    } as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported file type: text/plain");
  });

  it("rejects oversized files", async () => {
    const largeContent = new Uint8Array(21 * 1024 * 1024).buffer;

    class MockFile extends File {
      private content: string | ArrayBuffer;

      constructor(content: string | ArrayBuffer, name: string, mimeType: string) {
        super([], name, { type: mimeType });
        this.content = content;
        Object.defineProperty(this, "size", {
          get() {
            if (typeof this.content === "string") {
              return new TextEncoder().encode(this.content).length;
            }
            return this.content.byteLength;
          },
        });
      }

      async arrayBuffer() {
        if (typeof this.content === "string") {
          return new TextEncoder().encode(this.content).buffer;
        }
        return this.content;
      }
    }

    const file = new MockFile(largeContent, "large.pdf", "application/pdf");
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST({
      formData: async () => formData,
    } as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File is too large. Maximum size is 20MB.");
  });

  it("accepts valid PDF upload", async () => {
    class MockFile extends File {
      private content: string | ArrayBuffer;

      constructor(content: string | ArrayBuffer, name: string, mimeType: string) {
        super([], name, { type: mimeType });
        this.content = content;
        Object.defineProperty(this, "size", {
          get() {
            if (typeof this.content === "string") {
              return new TextEncoder().encode(this.content).length;
            }
            return this.content.byteLength;
          },
        });
      }

      async arrayBuffer() {
        if (typeof this.content === "string") {
          return new TextEncoder().encode(this.content).buffer;
        }
        return this.content;
      }
    }

    const file = new MockFile("%PDF-1.4", "prescription.pdf", "application/pdf");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", "PRESCRIPTION");

    const response = await POST({
      formData: async () => formData,
    } as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.originalFilename).toBe("prescription.pdf");
    expect(data.documentType).toBe("PRESCRIPTION");
    expect(data.status).toBe("RECEIVED");
    expect(data.processingStatus).toBe("RECEIVED");
    expect(data.provenance).toBe("PATIENT");
  });

  it("accepts valid image upload", async () => {
    const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;

    class MockFile extends File {
      private content: string | ArrayBuffer;

      constructor(content: string | ArrayBuffer, name: string, mimeType: string) {
        super([], name, { type: mimeType });
        this.content = content;
        Object.defineProperty(this, "size", {
          get() {
            if (typeof this.content === "string") {
              return new TextEncoder().encode(this.content).length;
            }
            return this.content.byteLength;
          },
        });
      }

      async arrayBuffer() {
        if (typeof this.content === "string") {
          return new TextEncoder().encode(this.content).buffer;
        }
        return this.content;
      }
    }

    const file = new MockFile(pngHeader, "scan.png", "image/png");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", "LAB_REPORT");

    const response = await POST({
      formData: async () => formData,
    } as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.mimeType).toBe("image/png");
    expect(data.documentType).toBe("LAB_REPORT");
  });
});

describe("GET /api/patient/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockReturnValue({
      get: vi.fn((name: string) => name === "medikiosk_session" ? { value: "session-123" } : undefined),
      set: vi.fn(),
    } as any);
    (documentRepository as any).findBySessionId = vi.fn().mockResolvedValueOnce([]);
  });

  it("returns empty documents list for GET", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documents).toEqual([]);
  });
});
