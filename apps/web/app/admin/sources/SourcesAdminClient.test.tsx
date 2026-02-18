import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
  sessionStorage.clear();
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

  it("persists selections in sessionStorage after toggling checkboxes", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]); // select first visible row

    const stored = sessionStorage.getItem("admin-sources-selected");
    expect(stored).toBeTruthy();
    expect(stored).toContain("src");
  });

  it("uses router.push for row navigation", async () => {
    const user = userEvent.setup();
    render(<SourcesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Bylaws")).toBeInTheDocument();
    });

    // Click on the row (not the checkbox)
    await user.click(screen.getByText("USOPC Bylaws"));

    expect(mockPush).toHaveBeenCalledWith("/admin/sources/src1");
  });
});
