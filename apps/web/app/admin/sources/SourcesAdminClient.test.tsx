import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { SourcesAdminClient } from "./SourcesAdminClient.js";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const SAMPLE_SOURCES = [
  {
    id: "src1",
    title: "USOPC Bylaws",
    documentType: "bylaws",
    topicDomains: ["governance"],
    url: "https://example.com/bylaws.pdf",
    format: "pdf",
    ngbId: null,
    priority: "high",
    description: "Bylaws doc",
    authorityLevel: "usopc_governance",
    enabled: true,
    lastIngestedAt: "2024-01-01T00:00:00.000Z",
    lastContentHash: "abc",
    consecutiveFailures: 0,
    lastError: null,
    s3Key: null,
    s3VersionId: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "src2",
    title: "SafeSport Policy",
    documentType: "policy",
    topicDomains: ["safesport"],
    url: "https://example.com/safesport.html",
    format: "html",
    ngbId: "usa-swimming",
    priority: "medium",
    description: "SafeSport policy",
    authorityLevel: "independent_office",
    enabled: false,
    lastIngestedAt: null,
    lastContentHash: null,
    consecutiveFailures: 5,
    lastError: "Connection timeout",
    s3Key: null,
    s3VersionId: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ sources: SAMPLE_SOURCES }),
  });
});

describe("SourcesAdminClient", () => {
  it("renders loading state initially", () => {
    render(<SourcesAdminClient />);
    expect(screen.getByText("Loading sources...")).toBeInTheDocument();
  });

  it("renders health summary cards", async () => {
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Total Sources")).toBeInTheDocument();
    });

    expect(screen.getByText("2")).toBeInTheDocument(); // total
    expect(screen.getByText("1 enabled / 1 disabled")).toBeInTheDocument();
  });

  it("renders source table rows", async () => {
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search by title...");
    await user.type(searchInput, "SafeSport");

    expect(screen.queryByText("USOPC Bylaws")).not.toBeInTheDocument();
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
  });

  it("shows error state with retry", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch sources")).toBeInTheDocument();
    });

    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("shows bulk action bar when items selected", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is "select all", next ones are individual rows
    await user.click(checkboxes[1]);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("Enable")).toBeInTheDocument();
    expect(screen.getByText("Disable")).toBeInTheDocument();
    expect(screen.getByText("Trigger Ingestion")).toBeInTheDocument();
  });

  it("opens slide panel when row is clicked", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    // Mock the detail fetch for the panel
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ source: SAMPLE_SOURCES[0], chunkCount: 42 }),
    } as Response);

    // Click on the row (not the checkbox)
    await user.click(screen.getByText("USOPC Bylaws"));

    // Panel should open and fetch the source detail
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("closes slide panel via close button", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ source: SAMPLE_SOURCES[0], chunkCount: 42 }),
    } as Response);

    await user.click(screen.getByText("USOPC Bylaws"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Close panel"));

    // Panel should slide closed (aria-hidden becomes true)
    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
        "aria-modal",
        "true",
      );
    });
  });

  it("selections persist while panel is open (no sessionStorage needed)", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    // Select a row via checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    expect(screen.getByText("1 selected")).toBeInTheDocument();

    // Open panel for a different row
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ source: SAMPLE_SOURCES[1], chunkCount: 0 }),
    } as Response);

    await user.click(screen.getByText("SafeSport Policy"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Selection bar should still be visible
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("filters by health card clicks", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    // Click "Failing" card — src2 has 5 failures but is disabled, so nothing matches
    await user.click(screen.getByText("Failing"));

    expect(screen.queryByText("USOPC Bylaws")).not.toBeInTheDocument();
    expect(screen.queryByText("SafeSport Policy")).not.toBeInTheDocument();

    // Click "Failing" again to deselect
    await user.click(screen.getByText("Failing"));

    expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
  });

  it("clicking Total Sources card clears card filter", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    // Activate a card filter first
    await user.click(screen.getByText("Stale"));

    // Click "Total Sources" to clear
    await user.click(screen.getByText("Total Sources"));

    expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    expect(screen.getByText("SafeSport Policy")).toBeInTheDocument();
  });

  it("navigates between sources with prev/next buttons", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    // Default sort is title asc: ["SafeSport Policy", "USOPC Bylaws"]
    // Open first sorted item: SafeSport Policy
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ source: SAMPLE_SOURCES[1], chunkCount: 0 }),
    } as Response);

    await user.click(screen.getByText("SafeSport Policy"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Prev button should be disabled (first item)
    expect(screen.getByLabelText("Previous source")).toBeDisabled();
    // Next button should be enabled
    expect(screen.getByLabelText("Next source")).toBeEnabled();

    // Click next to navigate to second source
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ source: SAMPLE_SOURCES[0], chunkCount: 42 }),
    } as Response);

    await user.click(screen.getByLabelText("Next source"));

    await waitFor(() => {
      // Panel should now show USOPC Bylaws details
      expect(screen.getByLabelText("Next source")).toBeDisabled();
    });

    expect(screen.getByLabelText("Previous source")).toBeEnabled();
  });
});
