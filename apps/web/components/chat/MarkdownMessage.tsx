"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { useDebounce } from "../../hooks/useDebounce.js";

interface MarkdownMessageProps {
  content: string;
}

const components: Components = {
  // Style links - only allow safe protocols (http, https, mailto)
  a: ({ href, children }) => {
    const isSafeUrl = href?.match(/^(https?:|mailto:)/i);
    if (!isSafeUrl) {
      // Render unsafe URLs as plain text
      return <span className="text-gray-500">{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 underline"
      >
        {children}
      </a>
    );
  },
  // Style code blocks
  pre: ({ children }) => (
    <pre className="bg-gray-800 text-gray-100 rounded-md p-3 overflow-x-auto text-xs my-2">
      {children}
    </pre>
  ),
  // Style inline code vs code blocks
  code: ({ className, children }) => {
    // Code blocks have a language-* class from rehype-highlight
    const isCodeBlock = className?.includes("language-");
    if (isCodeBlock) {
      return <code className={className}>{children}</code>;
    }
    // Inline code
    return (
      <code className="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded text-xs">
        {children}
      </code>
    );
  },
  // Style lists
  ul: ({ children }) => (
    <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>
  ),
  // Style headings
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>
  ),
  // Style paragraphs
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  // Style blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 pl-3 my-2 italic text-gray-700">
      {children}
    </blockquote>
  ),
  // Style tables (GFM)
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse border border-gray-300 text-xs">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 px-2 py-1">{children}</td>
  ),
};

// One animation frame (~16ms): batches token-level streaming updates so the
// markdown AST is not re-parsed on every incoming token (100-500 parses/response).
const STREAMING_DEBOUNCE_MS = 16;

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const debouncedContent = useDebounce(content, STREAMING_DEBOUNCE_MS);

  return (
    <div className="text-sm leading-relaxed markdown-content">
      {/* Security: raw HTML is disabled by default in react-markdown.
          Do NOT add rehype-raw plugin as it would allow XSS attacks. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {debouncedContent}
      </ReactMarkdown>
    </div>
  );
}
