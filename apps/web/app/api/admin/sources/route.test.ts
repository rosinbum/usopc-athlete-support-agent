import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../auth.js", () => ({
  auth: vi.fn(),
}));

vi.mock("../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

import { auth } from "../../../../auth.js";
import { createSourceConfigEntity } from "../../../../lib/source-config.js";
import { GET } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createSourceConfigEntity);

const SAMPLE_SOURCES = [
  { id: "src1", title: "Source 1", enabled: true },
  { id: "src2", title: "Source 2", enabled: false },
];

describe("GET /api/admin/sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns sources list", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getAll: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCES),
    } as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0].id).toBe("src1");
  });

  it("returns 500 on error", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getAll: vi.fn().mockRejectedValueOnce(new Error("DynamoDB error")),
    } as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to fetch sources");
  });
});
