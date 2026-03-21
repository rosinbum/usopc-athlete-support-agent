import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../../auth.js", () => ({
  auth: vi.fn(),
}));
vi.mock("../../../../../lib/auth-env.js", () => ({
  getAdminEmails: vi.fn(() => ["admin@test.com"]),
}));

vi.mock("../../../../../lib/discovered-source.js", () => ({
  createDiscoveredSourceEntity: vi.fn(),
}));

vi.mock("../../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

vi.mock("../../../../../lib/send-to-sources.js", () => ({
  sendDiscoveryToSources: vi.fn(),
}));

vi.mock("../../../../../lib/services/discovery-reprocess.js", () => ({
  enqueueForReprocess: vi.fn().mockResolvedValue({ queued: 0, failed: 0 }),
}));

vi.mock("@usopc/shared", () => ({
  REPROCESSABLE_STATUSES: new Set(["pending_metadata", "pending_content"]),
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

import { auth } from "../../../../../auth.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { sendDiscoveryToSources } from "../../../../../lib/send-to-sources.js";
import { enqueueForReprocess } from "../../../../../lib/services/discovery-reprocess.js";
import { POST } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createDiscoveredSourceEntity);
const mockCreateSCEntity = vi.mocked(createSourceConfigEntity);
const mockSendToSources = vi.mocked(sendDiscoveryToSources);
const mockEnqueue = vi.mocked(enqueueForReprocess);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/discoveries/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const APPROVED_DISCOVERY = {
  id: "d1",
  status: "approved",
  sourceConfigId: null,
  title: "Test",
  url: "https://example.com",
};

// ---------------------------------------------------------------------------
// POST /api/admin/discoveries/bulk
// ---------------------------------------------------------------------------

describe("POST /api/admin/discoveries/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await POST(jsonRequest({ action: "approve", ids: ["d1"] }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await POST(jsonRequest({ action: "approve", ids: ["d1"] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 for empty ids", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);

    const res = await POST(jsonRequest({ action: "approve", ids: [] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when rejecting without reason", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);

    const res = await POST(jsonRequest({ action: "reject", ids: ["d1"] }));

    expect(res.status).toBe(400);
  });

  it("bulk approves discoveries", async () => {
    mockAuth
      .mockResolvedValueOnce({
        user: { email: "admin@test.com", role: "admin" as const },
      } as never)
      .mockResolvedValueOnce({
        user: { email: "admin@test.com", role: "admin" as const },
      } as never);
    mockCreateEntity.mockReturnValueOnce({
      approve: vi.fn().mockResolvedValue(undefined),
    } as never);

    const res = await POST(
      jsonRequest({ action: "approve", ids: ["d1", "d2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
  });

  it("bulk rejects discoveries with reason", async () => {
    mockAuth
      .mockResolvedValueOnce({
        user: { email: "admin@test.com", role: "admin" as const },
      } as never)
      .mockResolvedValueOnce({
        user: { email: "admin@test.com", role: "admin" as const },
      } as never);
    mockCreateEntity.mockReturnValueOnce({
      reject: vi.fn().mockResolvedValue(undefined),
    } as never);

    const res = await POST(
      jsonRequest({
        action: "reject",
        ids: ["d1"],
        reason: "Not relevant",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(0);
  });

  it("reports partial failures", async () => {
    mockAuth
      .mockResolvedValueOnce({
        user: { email: "admin@test.com", role: "admin" as const },
      } as never)
      .mockResolvedValueOnce({
        user: { email: "admin@test.com", role: "admin" as const },
      } as never);
    mockCreateEntity.mockReturnValueOnce({
      approve: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Not found")),
    } as never);

    const res = await POST(
      jsonRequest({ action: "approve", ids: ["d1", "d2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);
  });

  // -------------------------------------------------------------------------
  // send_to_sources — with specific IDs
  // -------------------------------------------------------------------------

  it("sends specific discoveries to sources by IDs", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValue(APPROVED_DISCOVERY),
    } as never);
    mockCreateSCEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValue([]),
    } as never);
    mockSendToSources.mockResolvedValue({
      discoveryId: "d1",
      sourceConfigId: "d1",
      status: "created",
    });

    const res = await POST(
      jsonRequest({ action: "send_to_sources", ids: ["d1"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(1);
    expect(body.failed).toBe(0);
  });

  // -------------------------------------------------------------------------
  // send_to_sources — all approved (no IDs)
  // -------------------------------------------------------------------------

  it("sends all approved discoveries when no IDs provided", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getByStatus: vi.fn().mockResolvedValue([
        { ...APPROVED_DISCOVERY, id: "d1" },
        { ...APPROVED_DISCOVERY, id: "d2", sourceConfigId: "existing" },
      ]),
    } as never);
    mockCreateSCEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValue([]),
    } as never);
    mockSendToSources.mockResolvedValue({
      discoveryId: "d1",
      sourceConfigId: "d1",
      status: "created",
    });

    const res = await POST(jsonRequest({ action: "send_to_sources" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Only d1 should be processed (d2 already has sourceConfigId)
    expect(body.created).toBe(1);
    expect(mockSendToSources).toHaveBeenCalledTimes(1);
  });

  it("reports mixed results for send_to_sources", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi
        .fn()
        .mockResolvedValueOnce(APPROVED_DISCOVERY)
        .mockResolvedValueOnce({
          ...APPROVED_DISCOVERY,
          id: "d2",
          status: "pending_content",
        }),
    } as never);
    mockCreateSCEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValue([]),
    } as never);
    mockSendToSources
      .mockResolvedValueOnce({
        discoveryId: "d1",
        sourceConfigId: "d1",
        status: "created",
      })
      .mockResolvedValueOnce({
        discoveryId: "d2",
        status: "not_approved",
      });

    const res = await POST(
      jsonRequest({ action: "send_to_sources", ids: ["d1", "d2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(1);
    expect(body.notApproved).toBe(1);
  });

  // -------------------------------------------------------------------------
  // reprocess
  // -------------------------------------------------------------------------

  it("bulk reprocess sends SQS messages for stuck discoveries", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi
        .fn()
        .mockResolvedValueOnce({
          id: "d1",
          status: "pending_metadata",
          url: "https://example.com/1",
          title: "Doc 1",
        })
        .mockResolvedValueOnce({
          id: "d2",
          status: "pending_content",
          url: "https://example.com/2",
          title: "Doc 2",
        }),
    } as never);
    mockEnqueue.mockResolvedValueOnce({ queued: 2, failed: 0 });

    const res = await POST(
      jsonRequest({ action: "reprocess", ids: ["d1", "d2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.queued).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockEnqueue).toHaveBeenCalledWith([
      expect.objectContaining({ id: "d1" }),
      expect.objectContaining({ id: "d2" }),
    ]);
  });

  it("bulk reprocess skips approved discoveries when filtering by ids", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce({
        id: "d1",
        status: "approved",
        url: "https://example.com/1",
        title: "Doc 1",
      }),
    } as never);

    const res = await POST(jsonRequest({ action: "reprocess", ids: ["d1"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.queued).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("bulk reprocess all fetches pending_metadata and pending_content", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com", role: "admin" as const },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getByStatus: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "d1",
            status: "pending_metadata",
            url: "https://example.com/1",
            title: "Doc 1",
          },
        ])
        .mockResolvedValueOnce([]),
    } as never);
    mockEnqueue.mockResolvedValueOnce({ queued: 1, failed: 0 });

    const res = await POST(jsonRequest({ action: "reprocess" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.queued).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});
