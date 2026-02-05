import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("@usopc/shared", () => ({
  getPool: vi.fn(() => ({ query: mockQuery })),
}));

describe("GET /api/sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports GET handler", async () => {
    const { GET } = await import("./route.js");
    expect(GET).toBeDefined();
    expect(typeof GET).toBe("function");
  });

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const { GET } = await import("./route.js");
    const request = new Request("http://localhost/api/sources?action=stats");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
