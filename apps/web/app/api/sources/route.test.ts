import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Create mock Pool class
class MockPool {
  query = vi.fn();
}

vi.mock("pg", () => ({
  Pool: MockPool,
}));

vi.mock("@usopc/shared", () => ({
  getDatabaseUrl: vi.fn(() => "postgresql://test:test@localhost:5432/test"),
}));

describe("GET /api/sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("exports GET handler", async () => {
    const { GET } = await import("./route.js");
    expect(GET).toBeDefined();
    expect(typeof GET).toBe("function");
  });

  it("handles stats action", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          total_documents: "10",
          total_organizations: "5",
          last_ingested_at: new Date("2024-01-15T10:00:00Z"),
        },
      ],
    });

    vi.doMock("pg", () => ({
      Pool: vi.fn(() => ({ query: mockQuery })),
    }));

    const { GET } = await import("./route.js");
    const request = new Request("http://localhost/api/sources?action=stats");
    const response = await GET(request);

    expect(response).toBeInstanceOf(NextResponse);
  });
});
