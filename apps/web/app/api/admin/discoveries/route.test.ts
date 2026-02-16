import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../auth.js", () => ({
  auth: vi.fn(),
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

  it("returns all discoveries when no status filter", async () => {
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
  });

  it("returns filtered discoveries by status", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    const pending = [SAMPLE_DISCOVERIES[0]];
    mockCreateEntity.mockReturnValueOnce({
      getByStatus: vi.fn().mockResolvedValueOnce(pending),
    } as never);

    const res = await GET(buildRequest({ status: "pending_content" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discoveries).toHaveLength(1);
    expect(body.discoveries[0].id).toBe("d1");
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
