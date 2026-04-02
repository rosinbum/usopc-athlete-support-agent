import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";

import { MonitoringAdminClient } from "./MonitoringAdminClient.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithSWR(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>,
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const DASHBOARD_RESPONSE = {
  queues: {
    discoveryFeed: { visible: 3, inFlight: 1 },
    discoveryFeedDlq: { visible: 0, inFlight: 0 },
    ingestion: { visible: 5, inFlight: 2 },
    ingestionDlq: { visible: 1, inFlight: 0 },
  },
  recentJobs: [
    {
      sourceId: "src-1",
      sourceUrl: "https://example.com/doc.pdf",
      status: "completed" as const,
      chunksCount: 12,
      startedAt: "2026-03-20T10:00:00.000Z",
      completedAt: "2026-03-20T10:05:00.000Z",
      createdAt: "2026-03-20T10:00:00.000Z",
    },
    {
      sourceId: "src-2",
      sourceUrl: "https://example.com/policy.html",
      status: "failed" as const,
      errorMessage: "Connection timeout",
      startedAt: "2026-03-20T09:00:00.000Z",
      createdAt: "2026-03-20T09:00:00.000Z",
    },
  ],
  discoveryPipeline: {
    pending_metadata: 4,
    pending_content: 2,
    approved: 15,
    rejected: 8,
  },
  latestDiscoveryRun: {
    status: "completed" as const,
    triggeredBy: "admin@example.com",
    startedAt: "2026-03-20T10:00:00.000Z",
    completedAt: "2026-03-20T10:00:25.000Z",
    discovered: 150,
    enqueued: 120,
    skipped: 30,
    errors: 0,
  },
  timestamp: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MonitoringAdminClient", () => {
  it("renders loading state initially", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    renderWithSWR(<MonitoringAdminClient />);
    expect(screen.getByText("Loading monitoring data...")).toBeInTheDocument();
  });

  it("renders queue stats after loading", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(DASHBOARD_RESPONSE),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Discovery Feed")).toBeInTheDocument();
    });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders discovery pipeline counts", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(DASHBOARD_RESPONSE),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Pending Metadata")).toBeInTheDocument();
    });

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("shows worker processing status when queue has messages", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(DASHBOARD_RESPONSE),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getByText(/Worker processing/)).toBeInTheDocument();
    });
  });

  it("shows completed discovery run", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(DASHBOARD_RESPONSE),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getByText(/Last run completed/)).toBeInTheDocument();
    });

    expect(screen.getByText(/150 discovered/)).toBeInTheDocument();
    expect(screen.getByText(/120 enqueued/)).toBeInTheDocument();
  });

  it("shows running discovery run", async () => {
    const runningResponse = {
      ...DASHBOARD_RESPONSE,
      latestDiscoveryRun: {
        status: "running" as const,
        triggeredBy: "admin@example.com",
        startedAt: new Date().toISOString(),
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(runningResponse),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getByText(/Discovery run in progress/)).toBeInTheDocument();
    });
  });

  it("shows no discovery runs recorded when null", async () => {
    const noRunResponse = {
      ...DASHBOARD_RESPONSE,
      latestDiscoveryRun: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(noRunResponse),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(
        screen.getByText(/No discovery runs recorded/),
      ).toBeInTheDocument();
    });
  });

  it("renders recent activity table", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(DASHBOARD_RESPONSE),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(
        screen.getByText("https://example.com/doc.pdf"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("handles null queues (dev environment)", async () => {
    const devResponse = {
      ...DASHBOARD_RESPONSE,
      queues: {
        discoveryFeed: { visible: 0, inFlight: 0 },
        discoveryFeedDlq: null,
        ingestion: null,
        ingestionDlq: null,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(devResponse),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(3);
    });
  });

  it("renders error state", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal server error" }),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows empty state when no recent activity", async () => {
    const emptyResponse = {
      ...DASHBOARD_RESPONSE,
      recentJobs: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(emptyResponse),
    });

    renderWithSWR(<MonitoringAdminClient />);

    await waitFor(() => {
      expect(
        screen.getByText("No recent ingestion activity."),
      ).toBeInTheDocument();
    });
  });
});
