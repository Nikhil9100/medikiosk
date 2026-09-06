import { describe, expect, it } from "vitest";

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

function createFile(content: string | ArrayBuffer, name: string, mimeType: string): File {
  return new MockFile(content, name, mimeType);
}

function createMockRequest(file: File, documentType?: string): Request {
  const formData = new FormData();
  formData.append("file", file);
  if (documentType) {
    formData.append("documentType", documentType);
  }

  return {
    formData: async () => formData,
  } as unknown as Request;
}

describe("POST /api/patient/documents", () => {
  it("rejects missing file", async () => {
    const { POST } = await import("./route");
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
    const file = createFile("content", "test.txt", "text/plain");
    const { POST } = await import("./route");
    const response = await POST(createMockRequest(file));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported file type: text/plain");
  });

  it("rejects oversized files", async () => {
    const largeContent = new Uint8Array(21 * 1024 * 1024).buffer;
    const file = createFile(largeContent, "large.pdf", "application/pdf");
    const { POST } = await import("./route");
    const response = await POST(createMockRequest(file));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File is too large. Maximum size is 20MB.");
  });

  it("accepts valid PDF upload", async () => {
    const file = createFile("%PDF-1.4", "prescription.pdf", "application/pdf");
    const { POST } = await import("./route");
    const response = await POST(createMockRequest(file, "PRESCRIPTION"));
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
    const file = createFile(pngHeader, "scan.png", "image/png");
    const { POST } = await import("./route");
    const response = await POST(createMockRequest(file, "LAB_REPORT"));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.mimeType).toBe("image/png");
    expect(data.documentType).toBe("LAB_REPORT");
  });

  it("returns empty documents list for GET", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documents).toEqual([]);
  });
});
