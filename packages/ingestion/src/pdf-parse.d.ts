// Type declarations for pdf-parse v2 (class-based API).
// The package ships its own ESM types but TypeScript's bundler resolution
// can have trouble seeing the named PDFParse export due to pdfjs-dist type
// complexity, so we provide this explicit ambient override.
declare module "pdf-parse" {
  interface TextResult {
    text: string;
    /** Total page count. */
    total: number;
  }

  interface LoadParameters {
    data: Buffer | Uint8Array;
    [key: string]: unknown;
  }

  class PDFParse {
    constructor(options: LoadParameters);
    getText(): Promise<TextResult>;
  }

  export { PDFParse };
}
