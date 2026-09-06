import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSpeakWithSarvam = vi.fn();
const mockMapApplicationLanguageToSarvam = vi.fn();
const mockGetSarvamApiKey = vi.fn(() => "test-key");

vi.mock("@/lib/sarvam", async () => ({
  getSarvamApiKey: mockGetSarvamApiKey,
  mapApplicationLanguageToSarvam: mockMapApplicationLanguageToSarvam,
  speakWithSarvam: mockSpeakWithSarvam,
}));

function createMockRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

describe("POST /api/voice/speak", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSpeakWithSarvam.mockReset();
    mockMapApplicationLanguageToSarvam.mockReset();
    mockGetSarvamApiKey.mockReset();
    mockMapApplicationLanguageToSarvam.mockImplementation((lang: string) => {
      if (lang === "en") return "en-IN";
      throw new Error("Unsupported");
    });
  });

  it("rejects missing text", async () => {
    const { POST } = await import("./route");
    const response = await POST(createMockRequest({ language: "en" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("rejects text that exceeds max length", async () => {
    const { POST } = await import("./route");
    const longText = "a".repeat(2501);
    const response = await POST(createMockRequest({ text: longText, language: "en" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("rejects unsupported language", async () => {
    const { POST } = await import("./route");
    const response = await POST(createMockRequest({ text: "Hello", language: "fr" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported language: fr");
  });

  it("returns audio for valid request", async () => {
    mockSpeakWithSarvam.mockResolvedValue({ audioBase64: "base64audio", contentType: "audio/mpeg" });
    const { POST } = await import("./route");
    const response = await POST(createMockRequest({ text: "Hello", language: "en" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.audioBase64).toBe("base64audio");
    expect(data.contentType).toBe("audio/mpeg");
  });

  it("handles provider failure gracefully", async () => {
    mockSpeakWithSarvam.mockRejectedValue(new Error("Sarvam error"));
    const { POST } = await import("./route");
    const response = await POST(createMockRequest({ text: "Hello", language: "en" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Speech synthesis failed");
  });
});
