import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@usopc/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

const mockFetchWithRetry = vi.fn();
vi.mock("./fetchWithRetry.js", () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
  FetchWithRetryError: class extends Error {
    constructor(
      message: string,
      public url: string,
      public attempts: number,
      public statusCode?: number,
    ) {
      super(message);
      this.name = "FetchWithRetryError";
    }
  },
}));

const mockPdfParse = vi.fn();
vi.mock("pdf-parse", () => ({
  default: (buffer: Buffer) => mockPdfParse(buffer),
}));

const mockReadFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (path: string) => mockReadFile(path),
}));

// Import after mocks
import { loadPdf } from "./pdfLoader.js";
import { FetchWithRetryError } from "./fetchWithRetry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPdfResponse(content: ArrayBuffer): Response {
  return new Response(content, {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("URL source", () => {
    it("fetches PDF from URL and returns document", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "PDF document content",
        numpages: 5,
      });

      const docs = await loadPdf("https://example.com/document.pdf");

      expect(docs).toHaveLength(1);
      expect(docs[0].pageContent).toBe("PDF document content");
      expect(docs[0].metadata.source).toBe("https://example.com/document.pdf");
      expect(docs[0].metadata.format).toBe("pdf");
      expect(docs[0].metadata.pages).toBe(5);
    });

    it("uses fetchWithRetry with correct options", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "Content",
        numpages: 1,
      });

      await loadPdf("https://example.com/document.pdf");

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        "https://example.com/document.pdf",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "USOPC-Ingestion/1.0",
            Accept: "application/pdf",
          }),
        }),
        expect.objectContaining({
          timeoutMs: 120000, // Longer timeout for PDFs
        }),
      );
    });

    it("handles https URLs", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "HTTPS content",
        numpages: 1,
      });

      const docs = await loadPdf("https://secure.example.com/doc.pdf");

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        "https://secure.example.com/doc.pdf",
        expect.any(Object),
        expect.any(Object),
      );
      expect(docs[0].pageContent).toBe("HTTPS content");
    });

    it("handles http URLs", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "HTTP content",
        numpages: 1,
      });

      const docs = await loadPdf("http://example.com/doc.pdf");

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        "http://example.com/doc.pdf",
        expect.any(Object),
        expect.any(Object),
      );
      expect(docs[0].pageContent).toBe("HTTP content");
    });
  });

  describe("local file source", () => {
    it("reads PDF from local file path", async () => {
      const pdfBuffer = Buffer.from("fake pdf content");
      mockReadFile.mockResolvedValueOnce(pdfBuffer);
      mockPdfParse.mockResolvedValueOnce({
        text: "Local PDF content",
        numpages: 3,
      });

      const docs = await loadPdf("/path/to/local/document.pdf");

      expect(mockReadFile).toHaveBeenCalledWith("/path/to/local/document.pdf");
      expect(docs[0].pageContent).toBe("Local PDF content");
      expect(docs[0].metadata.source).toBe("/path/to/local/document.pdf");
      expect(docs[0].metadata.pages).toBe(3);
    });

    it("does not use fetchWithRetry for local files", async () => {
      const pdfBuffer = Buffer.from("fake pdf content");
      mockReadFile.mockResolvedValueOnce(pdfBuffer);
      mockPdfParse.mockResolvedValueOnce({
        text: "Local content",
        numpages: 1,
      });

      await loadPdf("/path/to/document.pdf");

      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });
  });

  describe("retry behavior", () => {
    it("uses fetchWithRetry for automatic retries on URL sources", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "Content after retry",
        numpages: 1,
      });

      const docs = await loadPdf("https://example.com/retry.pdf");

      expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
      expect(docs[0].pageContent).toBe("Content after retry");
    });
  });

  describe("error handling", () => {
    it("throws FetchWithRetryError on non-retryable HTTP status", async () => {
      mockFetchWithRetry.mockRejectedValueOnce(
        new FetchWithRetryError(
          "Failed to fetch https://example.com/doc.pdf: 404 Not Found",
          "https://example.com/doc.pdf",
          1,
          404,
        ),
      );

      await expect(loadPdf("https://example.com/doc.pdf")).rejects.toThrow(
        FetchWithRetryError,
      );
    });

    it("throws FetchWithRetryError after max retries exceeded", async () => {
      mockFetchWithRetry.mockRejectedValueOnce(
        new FetchWithRetryError(
          "Failed to fetch https://example.com/doc.pdf after 4 attempts: HTTP 503",
          "https://example.com/doc.pdf",
          4,
          503,
        ),
      );

      await expect(loadPdf("https://example.com/doc.pdf")).rejects.toThrow(
        "after 4 attempts",
      );
    });

    it("error includes HTTP status code", async () => {
      const error = new FetchWithRetryError(
        "Failed to fetch",
        "https://example.com/doc.pdf",
        1,
        403,
      );
      mockFetchWithRetry.mockRejectedValueOnce(error);

      try {
        await loadPdf("https://example.com/doc.pdf");
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FetchWithRetryError);
        expect((e as FetchWithRetryError).statusCode).toBe(403);
      }
    });

    it("throws error when PDF has no extractable text", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "",
        numpages: 1,
      });

      await expect(loadPdf("https://example.com/doc.pdf")).rejects.toThrow(
        "no extractable text",
      );
    });

    it("throws error when PDF text is only whitespace", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockResolvedValueOnce({
        text: "   \n\t  ",
        numpages: 1,
      });

      await expect(loadPdf("https://example.com/doc.pdf")).rejects.toThrow(
        "no extractable text",
      );
    });

    it("propagates local file read errors", async () => {
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT: file not found"));

      await expect(loadPdf("/nonexistent/file.pdf")).rejects.toThrow("ENOENT");
    });

    it("propagates PDF parsing errors", async () => {
      const pdfContent = new ArrayBuffer(100);
      mockFetchWithRetry.mockResolvedValueOnce(
        createMockPdfResponse(pdfContent),
      );
      mockPdfParse.mockRejectedValueOnce(new Error("Invalid PDF structure"));

      await expect(loadPdf("https://example.com/doc.pdf")).rejects.toThrow(
        "Invalid PDF structure",
      );
    });
  });
});
