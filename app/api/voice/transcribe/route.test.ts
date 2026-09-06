import { describe, expect, it, vi, beforeEach } from "vitest";

const mockTranscribeWithSarvam = vi.fn();
const mockMapApplicationLanguageToSarvam = vi.fn();
const mockGetSarvamApiKey = vi.fn(() => "test-key");

vi.mock("@/lib/sarvam", async () => ({
  getSarvamApiKey: mockGetSarvamApiKey,
  mapApplicationLanguageToSarvam: mockMapApplicationLanguageToSarvam,
  transcribeWithSarvam: mockTranscribeWithSarvam,
}));

function createMockFileWithArrayBuffer(name: string, content: string | ArrayBuffer): File {
  const file = new File([content], name, { type: "audio/webm" });
  const originalArrayBuffer = file.arrayBuffer?.bind(file);
  file.arrayBuffer = async () => {
    if (typeof content === "string") {
      return new TextEncoder().encode(content).buffer;
    }
    if (originalArrayBuffer) {
      return originalArrayBuffer();
    }
    return new ArrayBuffer(0);
  };
  return file;
}

function createMockRequest(body: FormData): Request {
  return {
    formData: async () => body,
  } as unknown as Request;
}

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => {
    vi.resetModules();
    mockTranscribeWithSarvam.mockReset();
    mockMapApplicationLanguageToSarvam.mockReset();
    mockGetSarvamApiKey.mockReset();
    mockMapApplicationLanguageToSarvam.mockImplementation((lang: string) => {
      if (lang === "en") return "en-IN";
      throw new Error("Unsupported");
    });
  });

  it("rejects missing audio file", async () => {
    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("language", "en");

    const response = await POST(createMockRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Audio file is required");
  });

  it("rejects missing language", async () => {
    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("audio", createMockFileWithArrayBuffer("audio.webm", "audio"));

    const response = await POST(createMockRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Language is required");
  });

  it("rejects unsupported language", async () => {
    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("audio", createMockFileWithArrayBuffer("audio.webm", "audio"));
    formData.append("language", "fr");

    const response = await POST(createMockRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported language: fr");
  });

  it("rejects audio files that are too large", async () => {
    const { POST } = await import("./route");
    const largeContent = new Uint8Array(31 * 1024 * 1024);
    const largeAudio = createMockFileWithArrayBuffer("audio.webm", largeContent.buffer);
    const formData = new FormData();
    formData.append("audio", largeAudio);
    formData.append("language", "en");

    const response = await POST(createMockRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Audio file is too large");
  });

  it("returns transcript for valid request", async () => {
    mockTranscribeWithSarvam.mockResolvedValue("Hello doctor");
    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("audio", createMockFileWithArrayBuffer("audio.webm", "audio"));
    formData.append("language", "en");

    const response = await POST(createMockRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transcript).toBe("Hello doctor");
    expect(data.language).toBe("en-IN");
  });

  it("handles provider failure gracefully", async () => {
    mockTranscribeWithSarvam.mockRejectedValue(new Error("Sarvam error"));
    const { POST } = await import("./route");
    const formData = new FormData();
    formData.append("audio", createMockFileWithArrayBuffer("audio.webm", "audio"));
    formData.append("language", "en");

    const response = await POST(createMockRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Transcription failed");
  });
});
