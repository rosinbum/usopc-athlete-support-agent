import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownMessage } from "./MarkdownMessage.js";

describe("MarkdownMessage", () => {
  it("renders plain text content", () => {
    render(<MarkdownMessage content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders bold text", () => {
    render(<MarkdownMessage content="This is **bold** text" />);
    const boldElement = screen.getByText("bold");
    expect(boldElement.tagName).toBe("STRONG");
  });

  it("renders italic text", () => {
    render(<MarkdownMessage content="This is *italic* text" />);
    const italicElement = screen.getByText("italic");
    expect(italicElement.tagName).toBe("EM");
  });

  it("renders links with correct attributes", () => {
    render(
      <MarkdownMessage content="Check out [this link](https://example.com)" />,
    );
    const link = screen.getByRole("link", { name: "this link" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders unordered lists", () => {
    const content = `- Item 1
- Item 2
- Item 3`;
    render(<MarkdownMessage content={content} />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders ordered lists", () => {
    const content = `1. First
2. Second
3. Third`;
    render(<MarkdownMessage content={content} />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders headings with correct hierarchy", () => {
    const content = `# Heading 1

## Heading 2

### Heading 3`;
    render(<MarkdownMessage content={content} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Heading 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Heading 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Heading 3" }),
    ).toBeInTheDocument();
  });

  it("renders inline code", () => {
    render(<MarkdownMessage content="Use the `console.log()` function" />);
    const code = screen.getByText("console.log()");
    expect(code.tagName).toBe("CODE");
  });

  it("renders code blocks", () => {
    const codeContent = `\`\`\`javascript
const x = 1;
\`\`\``;
    render(<MarkdownMessage content={codeContent} />);
    // Syntax highlighting splits tokens, so check for the pre and code elements
    const preElement = document.querySelector("pre");
    expect(preElement).toBeInTheDocument();
    const codeElement = preElement?.querySelector("code");
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.textContent).toContain("const x = 1");
  });

  it("renders blockquotes", () => {
    render(<MarkdownMessage content="> This is a quote" />);
    const blockquote = screen
      .getByText("This is a quote")
      .closest("blockquote");
    expect(blockquote).toBeInTheDocument();
  });

  it("renders GFM tables", () => {
    const tableContent = `| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |`;
    render(<MarkdownMessage content={tableContent} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Header 1")).toBeInTheDocument();
    expect(screen.getByText("Cell 1")).toBeInTheDocument();
  });

  it("renders GFM strikethrough", () => {
    render(<MarkdownMessage content="This is ~~deleted~~ text" />);
    const deletedText = screen.getByText("deleted");
    expect(deletedText.tagName).toBe("DEL");
  });

  it("renders complex nested markdown", () => {
    const complexContent = `## Section Title

Here is some **bold** and *italic* text.

- List item with \`code\`
- Another item with [a link](https://example.com)

> A blockquote with **emphasis**`;

    render(<MarkdownMessage content={complexContent} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Section Title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "a link" })).toBeInTheDocument();
  });
});
