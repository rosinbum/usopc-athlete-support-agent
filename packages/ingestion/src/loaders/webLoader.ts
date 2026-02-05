import { Document } from "@langchain/core/documents";
import * as cheerio from "cheerio";
import { fetchWithRetry } from "./fetchWithRetry.js";

/**
 * Selectors for elements that should be stripped before extracting text.
 * These typically contain navigation, ads, or boilerplate rather than
 * substantive content.
 */
const STRIP_SELECTORS = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  ".cookie-banner",
  ".advertisement",
  "#cookie-notice",
  "form",
  ".sidebar",
  "aside",
  "#sidebar",
];

/**
 * Selectors to try (in order) for the main content area. If none match, the
 * loader falls back to `<body>`.
 */
const CONTENT_SELECTORS = [
  "main",
  "article",
  "[role='main']",
  "#main-content",
  "#content",
  ".content",
  ".main-content",
  ".article-body",
  ".post-content",
  ".tab-content",
  "#block-system-main",
  ".field-items",
];

/**
 * Fetch a web page and extract its meaningful text content.
 *
 * Uses Cheerio to parse the HTML.  Navigation, headers/footers, scripts, and
 * other non-content elements are stripped before text extraction.
 *
 * Uses fetchWithRetry for automatic retry on transient failures (5xx, 429,
 * network errors) with exponential backoff.
 */
export async function loadWeb(url: string): Promise<Document[]> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": "USOPC-Ingestion/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    },
    {
      timeoutMs: 60000, // 60 second timeout for web pages
    },
  );

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove non-content elements
  for (const selector of STRIP_SELECTORS) {
    $(selector).remove();
  }

  // Try to locate the main content container; fall back to <body>
  let rootSelector = "body";
  for (const selector of CONTENT_SELECTORS) {
    if ($(selector).length > 0) {
      rootSelector = selector;
      break;
    }
  }
  const root = $(rootSelector);

  // Extract the page title
  const title = $("title").text().trim();

  // Get text, collapsing whitespace
  const text = root
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length === 0) {
    throw new Error(`No meaningful text content extracted from ${url}`);
  }

  return [
    new Document({
      pageContent: text,
      metadata: {
        source: url,
        format: "html",
        title,
      },
    }),
  ];
}
