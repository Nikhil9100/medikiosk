// @vitest-environment node
// The OCR provider is a server-only component (it spawns a Node worker thread).
// Run it in a real Node environment so tesseract.js takes its Node code path —
// jsdom would make it take the browser path and mis-resolve the worker script.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TesseractOcrProvider, createOcrProvider, resolveTesseractWorkerPath } from "@/lib/ocr/provider";
import { pageRenderer } from "@/lib/ocr/page-renderer";

/** Minimal single-page PDF (valid xref offsets) with machine-printed text. */
function makeTextPdf(lines: string[]): ArrayBuffer {
  const ops = ["BT /F1 20 Tf 72 720 Td 24 TL"];
  lines.forEach((line, i) => {
    const esc = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    ops.push(`(${esc}) Tj${i ? " T*" : ""}`);
  });
  ops.push("ET");
  const stream = Buffer.from(ops.join("\n"), "latin1");
  const objs = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"),
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  const out: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let len = out[0].length;
  objs.forEach((o, i) => {
    offsets.push(len);
    const chunk = Buffer.from(`${i + 1} 0 obj\n`);
    const tail = Buffer.from("\nendobj\n");
    out.push(chunk, o, tail);
    len += chunk.length + o.length + tail.length;
  });
  const xref = len;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    tail += `${off.toString().padStart(10, "0")} 00000 n \n`;
  });
  tail += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const buf = Buffer.concat([...out, Buffer.from(tail)]);
  // Byte-exact slice: small Buffers live in Node's shared pool, so the raw
  // ArrayBuffer is NOT the PDF — byteOffset/byteLength must be respected.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

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

  it("resolves the Node worker script to a real file on disk", () => {
    const workerPath = resolveTesseractWorkerPath();
    expect(workerPath).toContain("tesseract.js");
    expect(workerPath).toContain("worker-script");
    // Regression: in the Next production build tesseract.js's own default
    // (built from a stale `__dirname`) pointed at a nonexistent path, which
    // made the worker thread fail to start and the OCR request hang forever.
    expect(existsSync(workerPath)).toBe(true);
  });

  it("runs real OCR end-to-end on a rendered PDF page", async () => {
    const pdf = makeTextPdf(["Prescription", "Metformin 500mg", "twice daily"]);
    const pages = await pageRenderer.renderPdf(pdf);
    expect(pages.length).toBe(1);

    const provider = createOcrProvider();
    try {
      const results = await provider.processImage(pages[0].buffer, "eng", 1);
      expect(results).toHaveLength(1);
      expect(results[0].pageNumber).toBe(1);
      expect(results[0].extractedText).toMatch(/Metformin/i);
      expect(results[0].extractedText).toMatch(/500\s?mg/i);
      expect(results[0].language).toBe("eng");
    } finally {
      await provider.dispose();
    }
  }, 120000);

  it("dispose is safe when the worker was never created", async () => {
    const provider = new TesseractOcrProvider();
    await expect(provider.dispose()).resolves.toBeUndefined();
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
