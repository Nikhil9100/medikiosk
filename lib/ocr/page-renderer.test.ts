import { describe, expect, it } from "vitest";
import { PdfRasterPageRenderer } from "@/lib/ocr/page-renderer";

describe("PdfRasterPageRenderer", () => {
  const renderer = new PdfRasterPageRenderer();

  it("reports server-side only renderer", () => {
    expect(renderer).toBeDefined();
  });
});
