import { describe, expect, it } from "vitest";
import { TesseractOcrProvider } from "@/lib/ocr/provider";

describe("TesseractOcrProvider", () => {
  it("reports correct capabilities", () => {
    const provider = new TesseractOcrProvider();
    expect(provider.name).toBe("tesseract");
    expect(provider.supportsHandwriting).toBe(false);
  });

  it("does not claim handwriting recognition support", () => {
    const provider = new TesseractOcrProvider();
    expect(provider.supportsHandwriting).toBe(false);
  });
});
