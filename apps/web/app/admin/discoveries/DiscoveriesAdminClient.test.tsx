import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

  it("shows Sent badge for discoveries linked to a source", async () => {
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();
    });

    // disc-2 has sourceConfigId: "src-faq" -> should show "Sent" badge
    expect(screen.getByText("Sent")).toBeInTheDocument();
    // Summary card for "Sent to Sources" appears
    expect(
      screen.getAllByText(/Sent to Sources/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("filters by source link status", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Filter to "Sent to Sources" only
    const sourceFilter = screen.getByDisplayValue("All Sources");
    await user.selectOptions(sourceFilter, "linked");

    expect(screen.queryByText("USOPC Governance Page")).not.toBeInTheDocument();
    expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();

    // Filter to "Not Sent" only
    await user.selectOptions(sourceFilter, "unlinked");

    expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    expect(screen.queryByText("Athlete Rights FAQ")).not.toBeInTheDocument();
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

  it("opens slide panel when row is clicked", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Mock the detail fetch for the panel
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERIES[0] }),
    } as Response);

    await user.click(screen.getByText("USOPC Governance Page"));

    // Panel should open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("closes slide panel via close button", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERIES[0] }),
    } as Response);

    await user.click(screen.getByText("USOPC Governance Page"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Close panel"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
        "aria-modal",
        "true",
      );
    });
  });

  it("filters by Pending Review card click", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Click "Pending Review" card
    await user.click(screen.getByText("Pending Review"));

    // disc-1 is pending_content, disc-2 is approved — only disc-1 should show
    expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    expect(screen.queryByText("Athlete Rights FAQ")).not.toBeInTheDocument();

    // Click again to deselect
    await user.click(screen.getByText("Pending Review"));

    expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();
  });

  it("filters by Sent to Sources card click", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Click "Sent to Sources" card
    await user.click(
      screen
        .getAllByText("Sent to Sources")
        .find((el) => el.closest("button"))!,
    );

    // disc-2 has sourceConfigId, disc-1 does not
    expect(screen.queryByText("USOPC Governance Page")).not.toBeInTheDocument();
    expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();
  });

  it("clicking Total Discovered card clears card filter", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Activate a filter
    await user.click(screen.getByText("Pending Review"));
    expect(screen.queryByText("Athlete Rights FAQ")).not.toBeInTheDocument();

    // Click "Total Discovered" to clear
    await user.click(screen.getByText("Total Discovered"));

    expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    expect(screen.getByText("Athlete Rights FAQ")).toBeInTheDocument();
  });

  it("navigates between discoveries with prev/next buttons", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Default sort is combinedConfidence desc: disc-2 (93%) first, disc-1 (72%) second
    // Open disc-2 (first in sorted order)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERIES[1] }),
    } as Response);

    await user.click(screen.getByText("Athlete Rights FAQ"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Prev should be disabled (first item), next enabled
    expect(screen.getByLabelText("Previous discovery")).toBeDisabled();
    expect(screen.getByLabelText("Next discovery")).toBeEnabled();

    // Click next to go to disc-1
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERIES[0] }),
    } as Response);

    await user.click(screen.getByLabelText("Next discovery"));

    await waitFor(() => {
      expect(
        screen.getByText("Relevant governance document"),
      ).toBeInTheDocument();
    });

    // Now next should be disabled (last item) and prev enabled
    expect(screen.getByLabelText("Next discovery")).toBeDisabled();
    expect(screen.getByLabelText("Previous discovery")).toBeEnabled();
  });

  it("auto-advances to next discovery after approve", async () => {
    const user = userEvent.setup();
    render(<DiscoveriesAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("USOPC Governance Page")).toBeInTheDocument();
    });

    // Sorted by combinedConfidence desc: disc-2 (93%) at index 0, disc-1 (72%) at index 1
    // Open disc-2 (first in sorted order — has next but no prev)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          // Return a pending version so Approve button shows
          discovery: {
            ...SAMPLE_DISCOVERIES[1],
            status: "pending_content",
            sourceConfigId: null,
          },
        }),
    } as Response);

    await user.click(screen.getByText("Athlete Rights FAQ"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Verify Next is enabled (there IS a next item)
    expect(screen.getByLabelText("Next discovery")).toBeEnabled();

    // Mock: approve PATCH, silent list refetch, next item detail fetch
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            discovery: { ...SAMPLE_DISCOVERIES[1], status: "approved" },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ discoveries: SAMPLE_DISCOVERIES }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERIES[0] }),
      } as Response);

    await user.click(screen.getByText("Approve"));

    // Should auto-advance to disc-1 — panel now shows its metadataReasoning
    await waitFor(() => {
      expect(
        screen.getByText("Relevant governance document"),
      ).toBeInTheDocument();
    });
  });
});
