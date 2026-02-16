import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoveriesAdminClient } from "./DiscoveriesAdminClient.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const SAMPLE_DISCOVERIES = [
  {
    id: "disc-1",
    title: "USOPC Governance Page",
    url: "https://example.com/governance",
    discoveryMethod: "map",
    discoveredAt: "2026-01-15T12:00:00.000Z",
    discoveredFrom: "https://example.com/sitemap.xml",
    status: "pending_content",
    metadataConfidence: 0.85,
    contentConfidence: null,
    combinedConfidence: 0.72,
    documentType: "policy",
    topicDomains: ["governance"],
    format: "html",
    ngbId: null,
    priority: "high",
    description: "Governance information",
    authorityLevel: "usopc_governance",
    metadataReasoning: "Relevant governance document",
    contentReasoning: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    sourceConfigId: null,
    createdAt: "2026-01-15T12:00:00.000Z",
    updatedAt: "2026-01-15T12:00:00.000Z",
  },
  {
    id: "disc-2",
    title: "Athlete Rights FAQ",
    url: "https://example.com/faq",
    discoveryMethod: "search",
    discoveredAt: "2026-01-14T10:00:00.000Z",
    discoveredFrom: null,
    status: "approved",
    metadataConfidence: 0.9,
    contentConfidence: 0.95,
    combinedConfidence: 0.93,
    documentType: "educational_material",
    topicDomains: ["athlete_rights"],
    format: "html",
    ngbId: null,
    priority: "medium",
    description: "Frequently asked questions about athlete rights",
    authorityLevel: "educational_guidance",
    metadataReasoning: "Highly relevant",
    contentReasoning: "Excellent content quality",
    reviewedAt: "2026-01-15T14:00:00.000Z",
    reviewedBy: "admin@usopc.org",
    rejectionReason: null,
    sourceConfigId: "src-faq",
    createdAt: "2026-01-14T10:00:00.000Z",
    updatedAt: "2026-01-15T14:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ discoveries: SAMPLE_DISCOVERIES }),
  });
});

describe("DiscoveriesAdminClient", () => {
  it("renders loading state initially", () => {
    render(<DiscoveriesAdminClient />);
    expect(screen.getByText("Loading discoveries...")).toBeInTheDocument();
  });

  it("renders discoveries after loading", async () => {
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();
  });

  it("displays summary cards", async () => {
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Total Discovered")).toBeInTheDocument();
    });

    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    // "Approved" and "Rejected" appear in summary cards, dropdown, and table badges
    expect(screen.getAllByText("Approved").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Rejected").length).toBeGreaterThanOrEqual(1);
  });

  it("displays confidence badges", async () => {
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("72%")).toBeInTheDocument();
    });

    expect(screen.getByText("93%")).toBeInTheDocument();
  });

  it("displays status badges in table", async () => {
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      // "Pending Content" appears in dropdown and table badge
      expect(
        screen.getAllByText("Pending Content").length,
      ).toBeGreaterThanOrEqual(1);
    });

    // "Approved" appears in summary card, dropdown, and table badge
    expect(screen.getAllByText("Approved").length).toBeGreaterThanOrEqual(2);
  });

  it("filters by search text", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search by title or URL...",
    );
    await user.type(searchInput, "FAQ");

    expect(screen.queryByText("USOPC Governance Page")).not.toBeInTheDocument();
    expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();
  });

  it("shows empty state when no discoveries match", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search by title or URL...",
    );
    await user.type(searchInput, "nonexistent");

    expect(
      screen.getByText("No discoveries match the current filters."),
    ).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch discoveries"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("selects and shows bulk action bar", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is the "select all" header checkbox
    await user.click(checkboxes[1]);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });
});
