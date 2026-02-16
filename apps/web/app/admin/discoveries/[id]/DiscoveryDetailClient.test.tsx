import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoveryDetailClient } from "./DiscoveryDetailClient.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const SAMPLE_DISCOVERY = {
  id: "disc-1",
  title: "USOPC Governance Page",
  url: "https://example.com/governance",
  discoveryMethod: "map",
  discoveredAt: "2026-01-15T12:00:00.000Z",
  discoveredFrom: "https://example.com/sitemap.xml",
  status: "pending_content",
  metadataConfidence: 0.85,
  contentConfidence: 0.65,
  combinedConfidence: 0.72,
  documentType: "policy",
  topicDomains: ["governance", "athlete_rights"],
  format: "html",
  ngbId: null,
  priority: "high",
  description: "Official governance information for USOPC athletes",
  authorityLevel: "usopc_governance",
  metadataReasoning: "Relevant governance document found on sitemap",
  contentReasoning: "Contains useful governance information",
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
  sourceConfigId: null,
  createdAt: "2026-01-15T12:00:00.000Z",
  updatedAt: "2026-01-15T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERY }),
  });
});

describe("DiscoveryDetailClient", () => {
  it("renders loading state initially", () => {
    render(<DiscoveryDetailClient id="disc-1" />);
    expect(screen.getByText("Loading discovery...")).toBeInTheDocument();
  });

  it("renders discovery details after loading", async () => {
    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "USOPC Governance Page" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("governance")).toBeInTheDocument();
    expect(screen.getByText("athlete_rights")).toBeInTheDocument();
    expect(screen.getByText("72.0%")).toBeInTheDocument();
    expect(screen.getByText("85.0%")).toBeInTheDocument();
  });

  it("shows back link to discoveries", async () => {
    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(screen.getByText("Back to Discoveries")).toBeInTheDocument();
    });
  });

  it("shows approve and reject buttons for pending status", async () => {
    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(screen.getByText("Approve")).toBeInTheDocument();
    });

    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("hides action buttons for approved status", async () => {
    const approved = { ...SAMPLE_DISCOVERY, status: "approved" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ discovery: approved }),
    });

    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "USOPC Governance Page" }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
  });

  it("handles approve action", async () => {
    const user = userEvent.setup();
    const approved = { ...SAMPLE_DISCOVERY, status: "approved" };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ discovery: SAMPLE_DISCOVERY }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ discovery: approved }),
      });

    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(screen.getByText("Approve")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Approve"));

    await waitFor(() => {
      // After approval, the action buttons should disappear
      expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    });
  });

  it("shows reject reason input when reject is clicked", async () => {
    const user = userEvent.setup();
    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(screen.getByText("Reject")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Reject"));

    expect(
      screen.getByPlaceholderText("Rejection reason..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Confirm Reject")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("cancels reject input", async () => {
    const user = userEvent.setup();
    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(screen.getByText("Reject")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Reject"));
    expect(
      screen.getByPlaceholderText("Rejection reason..."),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    expect(
      screen.queryByPlaceholderText("Rejection reason..."),
    ).not.toBeInTheDocument();
  });

  it("renders error state for missing discovery", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Discovery not found" }),
    });

    render(<DiscoveryDetailClient id="missing" />);

    await waitFor(() => {
      expect(screen.getByText("Discovery not found")).toBeInTheDocument();
    });

    expect(screen.getByText("Back to Discoveries")).toBeInTheDocument();
  });

  it("displays description preview", async () => {
    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Official governance information for USOPC athletes"),
      ).toBeInTheDocument();
    });
  });

  it("shows linked source config when available", async () => {
    const linked = { ...SAMPLE_DISCOVERY, sourceConfigId: "src-governance" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ discovery: linked }),
    });

    render(<DiscoveryDetailClient id="disc-1" />);

    await waitFor(() => {
      expect(screen.getByText("src-governance")).toBeInTheDocument();
    });
  });
});
