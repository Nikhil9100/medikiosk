import fs from "node:fs";
import path from "node:path";
import { convert } from "pdf-raster";

export type OcrPage = {
  pageNumber: number;
  extractedText: string;
  confidence?: number;
  language: string;
};

const tessLang: Record<string, string> = {
  en: "eng",
  hi: "hin",
  bn: "ben",
  te: "tel",
  ta: "tam",
  mr: "mar",
};

function getCachePath(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "eng.traineddata"))) {
      return c;
    }
  }
  return process.cwd();
}

function resolveTessLang(requestedLang: string, cachePath: string): string {
  const mapped = tessLang[requestedLang] ?? "eng";
  if (fs.existsSync(path.join(cachePath, `${mapped}.traineddata`))) {
    return mapped;
  }
  return "eng";
}

async function createSafeWorker(targetLang: string, cachePath: string) {
  const Tesseract = await import("tesseract.js");
  return await Tesseract.createWorker(targetLang, 1, {
    cachePath,
    logger: () => {},
    errorHandler: () => {},
  });
}

export async function runOcr(
  content: Buffer,
  mimeType: string,
  language: string
): Promise<OcrPage[]> {
  if (!content || content.length === 0) {
    return [{ pageNumber: 1, extractedText: "", language }];
  }

  const cachePath = getCachePath();
  const activeLang = resolveTessLang(language, cachePath);

  if (mimeType === "application/pdf") {
    let pages: Array<{ data: Buffer; pageIndex: number }> = [];
    try {
      pages = await convert(content, { dpi: 150, outputFormat: "png" });
    } catch (pdfErr) {
      console.error("PDF raster conversion failed; preserving document for manual review:", pdfErr);
      return [{ pageNumber: 1, extractedText: "", language }];
    }

    if (!pages || pages.length === 0) {
      return [{ pageNumber: 1, extractedText: "", language }];
    }

    let worker: any = null;
    try {
      worker = await createSafeWorker(activeLang, cachePath);
    } catch (workerErr) {
      console.error("Failed to initialize OCR worker:", workerErr);
      return pages.slice(0, 20).map((p) => ({
        pageNumber: p.pageIndex + 1,
        extractedText: "",
        language,
      }));
    }

    const out: OcrPage[] = [];
    try {
      for (const p of pages.slice(0, 20)) {
        try {
          const r = await worker.recognize(p.data);
          out.push({
            pageNumber: p.pageIndex + 1,
            extractedText: r.data?.text ? r.data.text.trim() : "",
            confidence: r.data?.confidence > 0 ? r.data.confidence / 100 : undefined,
            language,
          });
        } catch (pageErr) {
          console.error(`OCR recognize failed on page ${p.pageIndex + 1}:`, pageErr);
          out.push({
            pageNumber: p.pageIndex + 1,
            extractedText: "",
            confidence: undefined,
            language,
          });
        }
      }
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
    return out.length > 0 ? out : [{ pageNumber: 1, extractedText: "", language }];
  }

  let worker: any = null;
  try {
    worker = await createSafeWorker(activeLang, cachePath);
    const r = await worker.recognize(content);
    return [
      {
        pageNumber: 1,
        extractedText: r.data?.text ? r.data.text.trim() : "",
        confidence: r.data?.confidence > 0 ? r.data.confidence / 100 : undefined,
        language,
      },
    ];
  } catch (err) {
    console.error("OCR image recognize failed:", err);
    return [{ pageNumber: 1, extractedText: "", language }];
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}
