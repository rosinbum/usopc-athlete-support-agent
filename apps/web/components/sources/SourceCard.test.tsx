import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceCard } from "./SourceCard.js";

const mockSource = {
  sourceUrl: "https://example.com/doc.pdf",
  documentTitle: "USA Swimming Team Selection Procedures",
  documentType: "policy",
  ngbId: "usa_swimming",
  topicDomain: "team_selection",
  authorityLevel: "ngb_policy_procedure",
  effectiveDate: "2024-01-01",
  ingestedAt: "2024-06-15T10:00:00.000Z",
  chunkCount: 10,
};

describe("SourceCard", () => {
  it("renders document title", () => {
    render(<SourceCard source={mockSource} />);
    expect(
      screen.getByText("USA Swimming Team Selection Procedures"),
    ).toBeInTheDocument();
  });

  it("renders document type as badge", () => {
    render(<SourceCard source={mockSource} />);
    expect(screen.getByText("policy")).toBeInTheDocument();
  });

  it("renders organization/NGB name", () => {
    render(<SourceCard source={mockSource} />);
    expect(screen.getByText(/usa_swimming/i)).toBeInTheDocument();
  });

  it("renders effective date formatted", () => {
    render(<SourceCard source={mockSource} />);
    // Should display effective date in a readable format
    expect(screen.getByText(/Jan 1, 2024/i)).toBeInTheDocument();
  });

  it("renders source URL as external link", () => {
    render(<SourceCard source={mockSource} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/doc.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders ingested date", () => {
    render(<SourceCard source={mockSource} />);
    // Should display ingested date
    expect(screen.getByText(/Jun 15, 2024/i)).toBeInTheDocument();
  });

  it("renders chunk count", () => {
    render(<SourceCard source={mockSource} />);
    expect(screen.getByText(/10 chunks/i)).toBeInTheDocument();
  });

  it("handles missing optional fields gracefully", () => {
    const minimalSource = {
      sourceUrl: "https://example.com/doc.pdf",
      documentTitle: "Minimal Document",
      documentType: null,
      ngbId: null,
      topicDomain: null,
      authorityLevel: null,
      effectiveDate: null,
      ingestedAt: "2024-06-15T10:00:00.000Z",
      chunkCount: 5,
    };

    render(<SourceCard source={minimalSource} />);
    expect(screen.getByText("Minimal Document")).toBeInTheDocument();
    // Should not throw, should handle nulls gracefully
  });

  it("renders topic domain when provided", () => {
    render(<SourceCard source={mockSource} />);
    expect(screen.getByText(/team_selection/i)).toBeInTheDocument();
  });

  it("renders authority level when provided", () => {
    render(<SourceCard source={mockSource} />);
    expect(screen.getByText(/ngb_policy_procedure/i)).toBeInTheDocument();
  });
});
