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

// Import after mocks
import { loadWeb } from "./webLoader.js";
import { FetchWithRetryError } from "./fetchWithRetry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadWeb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("successful fetch", () => {
    it("returns document with extracted text content", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Page</title></head>
          <body>
            <main>
              <h1>Important Content</h1>
              <p>This is the main content.</p>
            </main>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://example.com/page.html");

      expect(docs).toHaveLength(1);
      expect(docs[0].pageContent).toContain("Important Content");
      expect(docs[0].pageContent).toContain("main content");
      expect(docs[0].metadata.source).toBe("https://example.com/page.html");
      expect(docs[0].metadata.format).toBe("html");
      expect(docs[0].metadata.title).toBe("Test Page");
    });

    it("strips navigation and non-content elements", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test</title></head>
          <body>
            <nav><a href="/">Home</a></nav>
            <header>Site Header</header>
            <main><p>Main content here</p></main>
            <footer>Site Footer</footer>
            <script>console.log('test');</script>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://example.com/page.html");

      expect(docs[0].pageContent).toContain("Main content here");
      expect(docs[0].pageContent).not.toContain("Home");
      expect(docs[0].pageContent).not.toContain("Site Header");
      expect(docs[0].pageContent).not.toContain("Site Footer");
      expect(docs[0].pageContent).not.toContain("console.log");
    });

    it("uses fetchWithRetry with correct options", async () => {
      const html = "<html><body><main>Content</main></body></html>";
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      await loadWeb("https://example.com/page.html");

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        "https://example.com/page.html",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "USOPC-Ingestion/1.0",
            Accept: "text/html,application/xhtml+xml",
          }),
        }),
        expect.objectContaining({
          timeoutMs: 60000,
        }),
      );
    });
  });

  describe("retry behavior", () => {
    it("uses fetchWithRetry for automatic retries", async () => {
      const html = "<html><body><main>Content after retry</main></body></html>";
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://example.com/page.html");

      expect(docs[0].pageContent).toContain("Content after retry");
      expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("throws FetchWithRetryError on non-retryable status", async () => {
      mockFetchWithRetry.mockRejectedValueOnce(
        new FetchWithRetryError(
          "Failed to fetch https://example.com/page.html: 404 Not Found",
          "https://example.com/page.html",
          1,
          404,
        ),
      );

      await expect(loadWeb("https://example.com/page.html")).rejects.toThrow(
        FetchWithRetryError,
      );
    });

    it("throws FetchWithRetryError after max retries exceeded", async () => {
      mockFetchWithRetry.mockRejectedValueOnce(
        new FetchWithRetryError(
          "Failed to fetch https://example.com/page.html after 4 attempts: HTTP 503",
          "https://example.com/page.html",
          4,
          503,
        ),
      );

      await expect(loadWeb("https://example.com/page.html")).rejects.toThrow(
        "after 4 attempts",
      );
    });

    it("throws error when no meaningful content extracted", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Empty</title></head>
          <body>
            <nav>Navigation only</nav>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      await expect(loadWeb("https://example.com/empty.html")).rejects.toThrow(
        "No meaningful text content",
      );
    });
  });

  describe("content selection", () => {
    it("prefers main element over body", async () => {
      const html = `
        <html>
          <body>
            <div>Body content</div>
            <main>Main content</main>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://example.com/page.html");

      expect(docs[0].pageContent).toContain("Main content");
      // Body content outside main is not included when main exists
    });

    it("prefers article element when no main", async () => {
      const html = `
        <html>
          <body>
            <div>Body content</div>
            <article>Article content</article>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://example.com/page.html");

      expect(docs[0].pageContent).toContain("Article content");
    });

    it("extracts content from Drupal-style page with .tab-content", async () => {
      const html = `
        <html>
          <head><title>Cornell Law</title></head>
          <body>
            <div id="skip-link">Skip to main content</div>
            <form id="search-form">
              <input type="text" placeholder="Quick search by citation" />
            </form>
            <aside class="sidebar">Sidebar navigation</aside>
            <div class="tab-content">
              <h2>36 USC Chapter 2205</h2>
              <p>United States Olympic and Paralympic Committee</p>
            </div>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://www.law.cornell.edu/uscode/text/36");

      expect(docs[0].pageContent).toContain("United States Olympic");
      expect(docs[0].pageContent).not.toContain("Quick search by citation");
      expect(docs[0].pageContent).not.toContain("Sidebar navigation");
    });

    it("falls back to body when no main/article", async () => {
      const html = `
        <html>
          <body>
            <div>Body content only</div>
          </body>
        </html>
      `;
      mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(html));

      const docs = await loadWeb("https://example.com/page.html");

      expect(docs[0].pageContent).toContain("Body content only");
    });
  });
});
