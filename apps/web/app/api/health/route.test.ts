import { describe, it, expect } from "vitest";
import { GET } from "./route.js";

describe("GET /api/health", () => {
  it("returns 200 with status ok and timestamp", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
