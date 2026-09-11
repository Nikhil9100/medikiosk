import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { OcrLanguageCode } from "./types";
import type { OcrPageResult, OcrProviderMetadata } from "./types";

export interface OcrProvider {
  readonly name: string;
  readonly supportsHandwriting: boolean;
  processImage(buffer: ArrayBuffer, language: OcrLanguageCode, pageNumber: number): Promise<OcrPageResult[]>;
  /** Release any underlying worker resources. Must be safe to call after a timeout or error. */
  dispose(): Promise<void>;
}

/** Minimal structural handle so the provider does not leak tesseract.js types. */
interface TesseractWorkerHandle {
  recognize(image: Buffer): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

const TESSERACT_WORKER_SUBPATH = "tesseract.js/src/worker-script/node/index.js";

/**
 * Resolve the tesseract.js Node worker script from the real filesystem.
 *
 * tesseract.js computes its default workerPath from `__dirname`, which is
 * unreliable when the library is bundled by Next.js/webpack (in the production
 * build it resolved to a nonexistent build-time path, so the OCR worker thread
 * failed to start and the request hung forever). We therefore resolve the real
 * on-disk path at runtime, trying several anchors and validating with
 * `existsSync` so a stale anchor can never silently produce a dead path.
 */
export function resolveTesseractWorkerPath(): string {
  const candidates: Array<() => string> = [
    () => createRequire(import.meta.url).resolve(TESSERACT_WORKER_SUBPATH),
    () => createRequire(`${process.cwd()}/package.json`).resolve(TESSERACT_WORKER_SUBPATH),
  ];
  for (const make of candidates) {
    try {
      const resolved = make();
      if (existsSync(resolved)) return resolved;
    } catch {
      // try the next anchor
    }
  }
  throw new Error(
    `Could not locate the tesseract.js Node worker script (${TESSERACT_WORKER_SUBPATH}). ` +
      "Ensure tesseract.js is installed and the server runs from the project root.",
  );
}

export class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract";
  readonly supportsHandwriting = false;
  private worker: TesseractWorkerHandle | null = null;

  private async ensureWorker(language: OcrLanguageCode): Promise<TesseractWorkerHandle> {
    if (this.worker) return this.worker;
    const Tesseract = await import("tesseract.js");
    const worker = (await Tesseract.createWorker(language, 1, {
      logger: () => {},
      workerPath: resolveTesseractWorkerPath(),
    })) as unknown as TesseractWorkerHandle;
    this.worker = worker;
    return worker;
  }

  async processImage(buffer: ArrayBuffer, language: OcrLanguageCode, pageNumber: number): Promise<OcrPageResult[]> {
    const worker = await this.ensureWorker(language);
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
  }

  async dispose(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      await worker.terminate().catch(() => {});
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
