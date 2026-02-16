import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationList } from "./CitationList.js";
import type { Citation } from "../../types/citation.js";

const mockCitations: Citation[] = [
  {
    title: "SafeSport Policy",
    url: "https://example.com/safesport",
    documentType: "policy",
    section: "Section 3.1",
    snippet: "Athletes must complete SafeSport training annually.",
  },
  {
    title: "USOPC Bylaws",
    documentType: "bylaw",
    snippet: "Governance structure of the USOPC.",
  },
];

describe("CitationList", () => {
  it("renders nothing for empty citations array", () => {
    const { container } = render(<CitationList citations={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the correct source count", () => {
    render(<CitationList citations={mockCitations} />);
    expect(screen.getByText(/Sources \(2\)/)).toBeInTheDocument();
  });

  it("is collapsed by default", () => {
    render(<CitationList citations={mockCitations} />);
    const details = document.querySelector("details");
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
  });

  it("renders citation cards for each citation", () => {
    render(<CitationList citations={mockCitations} />);
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
    expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
  });

  it("renders a single citation correctly", () => {
    render(<CitationList citations={[mockCitations[0]]} />);
    expect(screen.getByText(/Sources \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
  });
});
