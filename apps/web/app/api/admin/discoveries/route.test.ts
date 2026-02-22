import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../auth.js", () => ({
  auth: vi.fn(),
}));
vi.mock("../../../../lib/auth-env.js", () => ({
  getAdminEmails: vi.fn(() => ["admin@test.com"]),
}));

vi.mock("../../../../lib/discovered-source.js", () => ({
  createDiscoveredSourceEntity: vi.fn(),
}));

import { auth } from "../../../../auth.js";
import { createDiscoveredSourceEntity } from "../../../../lib/discovered-source.js";
import { GET } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createDiscoveredSourceEntity);

const SAMPLE_DISCOVERIES = [
  { id: "d1", title: "Discovery 1", status: "pending_content" },
  { id: "d2", title: "Discovery 2", status: "approved" },
];

// ---------------------------------------------------------------------------
// Helper to build a NextRequest with search params
// ---------------------------------------------------------------------------

function buildRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/discoveries");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return { nextUrl: url } as unknown as import("next/server").NextRequest;
}

// ---------------------------------------------------------------------------
// GET /api/admin/discoveries
// ---------------------------------------------------------------------------

describe("GET /api/admin/discoveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns all discoveries with hasMore false", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValueOnce(SAMPLE_DISCOVERIES),
    } as never);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discoveries).toHaveLength(2);
    expect(body.hasMore).toBe(false);
  });

  it("passes limit to entity getAll", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    const mockGetAll = vi.fn().mockResolvedValueOnce(SAMPLE_DISCOVERIES);
    mockCreateEntity.mockReturnValueOnce({
      getAll: mockGetAll,
    } as never);

    await GET(buildRequest());

    // Default limit=1000, so fetches 1001
    expect(mockGetAll).toHaveBeenCalledWith({ limit: 1001 });
  });

  it("returns filtered discoveries by status", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    const pending = [SAMPLE_DISCOVERIES[0]];
    const mockGetByStatus = vi.fn().mockResolvedValueOnce(pending);
    mockCreateEntity.mockReturnValueOnce({
      getByStatus: mockGetByStatus,
    } as never);

    const res = await GET(buildRequest({ status: "pending_content" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discoveries).toHaveLength(1);
    expect(body.discoveries[0].id).toBe("d1");
    expect(mockGetByStatus).toHaveBeenCalledWith("pending_content", {
      limit: 1001,
    });
  });

  it("returns hasMore true when dataset exceeds limit", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    const manyDiscoveries = Array.from({ length: 3 }, (_, i) => ({
      id: `d${i}`,
      title: `Discovery ${i}`,
      status: "approved",
    }));
    mockCreateEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValueOnce(manyDiscoveries),
    } as never);

    const res = await GET(buildRequest({ limit: "2" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discoveries).toHaveLength(2);
    expect(body.hasMore).toBe(true);
  });

  it("respects custom limit query param", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValueOnce(SAMPLE_DISCOVERIES),
    } as never);

    const res = await GET(buildRequest({ limit: "1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discoveries).toHaveLength(1);
    expect(body.hasMore).toBe(true);
  });

  it("returns 400 for invalid status", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await GET(buildRequest({ status: "bogus" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid status filter");
  });

  it("returns 500 on error", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getAll: vi.fn().mockRejectedValueOnce(new Error("DynamoDB error")),
    } as never);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to fetch discoveries");
  });
});
