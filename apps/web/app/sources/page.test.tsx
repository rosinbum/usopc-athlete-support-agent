import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the client component
vi.mock("./SourcesClient.js", () => ({
  SourcesClient: vi.fn(() => (
    <div data-testid="sources-client">Sources Client</div>
  )),
}));

describe("SourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page with sources client component", async () => {
    const { default: SourcesPage } = await import("./page.js");

    render(await SourcesPage());

    expect(screen.getByText("Document Sources")).toBeInTheDocument();
  });

  it("renders page description", async () => {
    const { default: SourcesPage } = await import("./page.js");

    render(await SourcesPage());

    expect(
      screen.getByText(/Browse all documents indexed/i),
    ).toBeInTheDocument();
  });
});
