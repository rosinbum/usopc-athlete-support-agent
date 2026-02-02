import { Document } from "@langchain/core/documents";
import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";

/**
 * Load a local HTML file and return its text content as a {@link Document}.
 *
 * Non-content elements (scripts, styles, nav, etc.) are stripped before
 * text extraction, mirroring the behaviour of the web loader.
 */
export async function loadHtml(filePath: string): Promise<Document[]> {
  const html = await readFile(filePath, "utf-8");
  const $ = cheerio.load(html);

  // Strip non-content elements
  $("script, style, noscript, nav, header, footer, iframe, svg").remove();

  const title = $("title").text().trim();

  // Try to locate a main content area; fall back to <body>
  const main = $("main, article, [role='main']").first();
  const root = main.length > 0 ? main : $("body");

  const text = root
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length === 0) {
    throw new Error(
      `No meaningful text content extracted from HTML file: ${filePath}`,
    );
  }

  return [
    new Document({
      pageContent: text,
      metadata: {
        source: filePath,
        format: "html",
        title,
      },
    }),
  ];
}
