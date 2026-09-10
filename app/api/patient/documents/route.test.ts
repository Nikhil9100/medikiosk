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

import { getActiveKioskSession, SESSION_COOKIE } from "@/lib/db/session-scope";
import { databaseConfigured } from "@/lib/db/pool";
import { scopedDocumentRepository } from "@/lib/db/scoped-document-repository";
import { POST, GET } from "./route";
import { makeFakeSession, createTestDocStore } from "../../../../test/db-mocks";

function mockCookie(sessionId: string | undefined) {
  vi.mocked(getActiveKioskSession).mockResolvedValue(sessionId ? makeFakeSession({ id: sessionId }) : null);
}

describe("POST /api/patient/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (databaseConfigured as any).mockReturnValue(true);
    mockCookie("session-123");
    vi.mocked(scopedDocumentRepository).mockReturnValue(createTestDocStore());
  });

  it("returns 503 when the database is not configured", async () => {
    (databaseConfigured as any).mockReturnValue(false);
    const formData = new FormData();
    const response = await POST({ formData: async () => formData } as unknown as Request);
    expect(response.status).toBe(503);
  });

  it("returns 404 when there is no active session", async () => {
    mockCookie(undefined);
    const formData = new FormData();
    const response = await POST({ formData: async () => formData } as unknown as Request);
    expect(response.status).toBe(404);
  });

  it("rejects missing file", async () => {
    const formData = new FormData();
    formData.append("documentType", "PRESCRIPTION");
    const response = await POST({ formData: async () => formData } as unknown as Request);
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
    const response = await POST({ formData: async () => formData } as unknown as Request);
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
    const response = await POST({ formData: async () => formData } as unknown as Request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("File is too large. Maximum size is 20MB.");
  });

  it("accepts valid PDF upload and stores it under the session", async () => {
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

    const response = await POST({ formData: async () => formData } as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.originalFilename).toBe("prescription.pdf");
    expect(data.documentType).toBe("PRESCRIPTION");
    expect(data.sessionId).toBe("session-123");
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
    const response = await POST({ formData: async () => formData } as unknown as Request);
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.mimeType).toBe("image/png");
    expect(data.documentType).toBe("LAB_REPORT");
  });
});

describe("GET /api/patient/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (databaseConfigured as any).mockReturnValue(true);
    mockCookie("session-123");
    vi.mocked(scopedDocumentRepository).mockReturnValue(createTestDocStore());
  });

  it("returns empty documents list", async () => {
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.documents).toEqual([]);
  });

  it("returns 404 without a session", async () => {
    mockCookie(undefined);
    const response = await GET();
    expect(response.status).toBe(404);
  });
});

void SESSION_COOKIE;
