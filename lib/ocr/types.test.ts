import { describe, expect, it } from "vitest";
import { mapApplicationLanguageToOcr, OcrLanguageCode } from "@/lib/ocr/types";

describe("OCR types", () => {
  it("maps application languages to OCR language codes", () => {
    expect(mapApplicationLanguageToOcr("en")).toBe("eng");
    expect(mapApplicationLanguageToOcr("hi")).toBe("hin");
    expect(mapApplicationLanguageToOcr("bn")).toBe("ben");
    expect(mapApplicationLanguageToOcr("te")).toBe("tel");
    expect(mapApplicationLanguageToOcr("ta")).toBe("tam");
    expect(mapApplicationLanguageToOcr("mr")).toBe("mar");
  });

  it("rejects unsupported languages", () => {
    expect(() => mapApplicationLanguageToOcr("fr")).toThrow("Unsupported OCR language: fr");
    expect(() => mapApplicationLanguageToOcr("")).toThrow("Unsupported OCR language: ");
  });

  it("accepts valid OCR language codes", () => {
    const validCodes: OcrLanguageCode[] = ["eng", "hin", "ben", "tel", "tam", "mar"];
    validCodes.forEach((code) => {
      expect(OcrLanguageCode.parse(code)).toBe(code);
    });
  });

  it("rejects invalid OCR language codes", () => {
    expect(() => OcrLanguageCode.parse("fra")).toThrow();
    expect(() => OcrLanguageCode.parse("")).toThrow();
  });
});
