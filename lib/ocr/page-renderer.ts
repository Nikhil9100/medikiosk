import { convert } from "pdf-raster";

export interface RenderedPage {
  pageNumber: number;
  buffer: ArrayBuffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
}

export interface PageRenderer {
  renderPdf(buffer: ArrayBuffer, pageNumbers?: number[]): Promise<RenderedPage[]>;
  renderImage(buffer: ArrayBuffer, mimeType: string): Promise<RenderedPage[]>;
  getPageCount(buffer: ArrayBuffer): Promise<number>;
}

export class PdfRasterPageRenderer implements PageRenderer {
  async renderPdf(buffer: ArrayBuffer, pageNumbers?: number[]): Promise<RenderedPage[]> {
    const bufferInput = Buffer.from(buffer);
    const pages = await convert(bufferInput, {
      pages: pageNumbers,
      dpi: 300,
      outputFormat: "png",
    });

    return pages.map((page) => ({
      pageNumber: page.pageIndex + 1,
      buffer: page.data.buffer.slice(page.data.byteOffset, page.data.byteOffset + page.data.byteLength) as ArrayBuffer,
      mimeType: page.mimeType,
      width: page.width,
      height: page.height,
    }));
  }

  async renderImage(buffer: ArrayBuffer, mimeType: string): Promise<RenderedPage[]> {
    return [
      {
        pageNumber: 1,
        buffer,
        mimeType: mimeType === "image/jpeg" ? "image/jpeg" : "image/png",
        width: 0,
        height: 0,
      },
    ];
  }

  async getPageCount(buffer: ArrayBuffer): Promise<number> {
    const bufferInput = Buffer.from(buffer);
    const pages = await convert(bufferInput, {
      pages: [0],
      dpi: 72,
      outputFormat: "png",
    });
    return pages.length;
  }
}

export const pageRenderer = new PdfRasterPageRenderer();
