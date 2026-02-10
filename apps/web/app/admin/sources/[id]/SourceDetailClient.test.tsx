import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceDetailClient } from "./SourceDetailClient.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const SAMPLE_SOURCE = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  documentType: "bylaws",
  topicDomains: ["governance", "athlete_rights"],
  url: "https://example.com/bylaws.pdf",
  format: "pdf",
  ngbId: null,
  priority: "high",
  description: "Official USOPC bylaws",
  authorityLevel: "usopc_governance",
  enabled: true,
  lastIngestedAt: "2024-01-15T12:00:00.000Z",
  lastContentHash: "abc",
  consecutiveFailures: 0,
  lastError: null,
  s3Key: "sources/usopc-bylaws/abc.pdf",
  s3VersionId: "v1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-15T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ source: SAMPLE_SOURCE }),
  });
});

describe("SourceDetailClient", () => {
  it("renders loading state initially", () => {
    render(<SourceDetailClient id="usopc-bylaws" />);
    expect(screen.getByText("Loading source...")).toBeInTheDocument();
  });

  it("renders source details after loading", async () => {
    render(<SourceDetailClient id="usopc-bylaws" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "USOPC Bylaws" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("governance")).toBeInTheDocument();
    expect(screen.getByText("athlete_rights")).toBeInTheDocument();
    expect(screen.getByText("Disable Source")).toBeInTheDocument();
    expect(screen.getByText("Trigger Ingestion")).toBeInTheDocument();
  });

  it("shows back link", async () => {
    render(<SourceDetailClient id="usopc-bylaws" />);

    await waitFor(() => {
      expect(screen.getByText("Back to Sources")).toBeInTheDocument();
    });
  });

  it("handles toggle enable/disable", async () => {
    const user = userEvent.setup();
    const updatedSource = { ...SAMPLE_SOURCE, enabled: false };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ source: SAMPLE_SOURCE }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ source: updatedSource }),
      });

    render(<SourceDetailClient id="usopc-bylaws" />);

    await waitFor(() => {
      expect(screen.getByText("Disable Source")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Disable Source"));

    await waitFor(() => {
      expect(screen.getByText("Enable Source")).toBeInTheDocument();
    });
  });

  it("renders error state for missing source", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Source not found" }),
    });

    render(<SourceDetailClient id="missing" />);

    await waitFor(() => {
      expect(screen.getByText("Source not found")).toBeInTheDocument();
    });

    expect(screen.getByText("Back to Sources")).toBeInTheDocument();
  });

  it("handles ingestion trigger", async () => {
    const user = userEvent.setup();

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ source: SAMPLE_SOURCE }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 501,
        json: () => Promise.resolve({ error: "Ingestion queue not available" }),
      });

    render(<SourceDetailClient id="usopc-bylaws" />);

    await waitFor(() => {
      expect(screen.getByText("Trigger Ingestion")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Trigger Ingestion"));

    await waitFor(() => {
      expect(
        screen.getByText("Ingestion queue not available in dev environment"),
      ).toBeInTheDocument();
    });
  });
});
