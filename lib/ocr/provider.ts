import type { OcrLanguageCode } from "./types";
import type { OcrPageResult, OcrProviderMetadata } from "./types";

export interface OcrProvider {
  readonly name: string;
  readonly supportsHandwriting: boolean;
  processImage(buffer: ArrayBuffer, language: OcrLanguageCode, pageNumber: number): Promise<OcrPageResult[]>;
}

export class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract";
  readonly supportsHandwriting = false;

  async processImage(buffer: ArrayBuffer, language: OcrLanguageCode, pageNumber: number): Promise<OcrPageResult[]> {
    const Tesseract = await import("tesseract.js");
    const worker = await Tesseract.createWorker(language, 1, {
      logger: () => {},
    });

    try {
      const result = await worker.recognize(Buffer.from(buffer));
      const text = result.data.text.trim();
      const confidence = result.data.confidence > 0 ? result.data.confidence / 100 : undefined;

      const pageResult: OcrPageResult = {
        pageNumber,
        extractedText: text,
        confidence,
        language,
      };

      return [pageResult];
    } finally {
      await worker.terminate();
    }
  }
}

export function createOcrProvider(): OcrProvider {
  return new TesseractOcrProvider();
}

export function createOcrProviderMetadata(language: OcrLanguageCode): OcrProviderMetadata {
  return {
    provider: "tesseract",
    language,
    createdAt: new Date().toISOString(),
  };
}
