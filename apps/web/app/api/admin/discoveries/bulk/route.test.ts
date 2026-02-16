import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../../auth.js", () => ({
  auth: vi.fn(),
}));

vi.mock("../../../../../lib/discovered-source.js", () => ({
  createDiscoveredSourceEntity: vi.fn(),
}));

import { auth } from "../../../../../auth.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";
import { POST } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createDiscoveredSourceEntity);

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

  it("returns 400 for empty ids", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(jsonRequest({ action: "approve", ids: [] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when rejecting without reason", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(jsonRequest({ action: "reject", ids: ["d1"] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Reason is required when rejecting");
  });

  it("bulk approves discoveries", async () => {
    mockAuth
      .mockResolvedValueOnce({ user: { email: "admin@test.com" } } as never)
      .mockResolvedValueOnce({ user: { email: "admin@test.com" } } as never);
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
      .mockResolvedValueOnce({ user: { email: "admin@test.com" } } as never)
      .mockResolvedValueOnce({ user: { email: "admin@test.com" } } as never);
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
      .mockResolvedValueOnce({ user: { email: "admin@test.com" } } as never)
      .mockResolvedValueOnce({ user: { email: "admin@test.com" } } as never);
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
});
