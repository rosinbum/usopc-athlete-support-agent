import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@usopc/shared", () => ({
  createAccessRequestEntity: vi.fn(),
  logger: {
    child: vi
      .fn()
      .mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("../../../lib/rate-limit.js", () => ({
  isRateLimited: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../lib/send-access-request-notification.js", () => ({
  sendAccessRequestNotification: vi.fn().mockResolvedValue(true),
}));

import { createAccessRequestEntity } from "@usopc/shared";
import { isRateLimited } from "../../../lib/rate-limit.js";
import { POST } from "./route.js";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/access-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockEntity = {
  get: vi.fn(),
  create: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAccessRequestEntity).mockReturnValue(mockEntity as never);
  vi.mocked(isRateLimited).mockReturnValue(false);
});

describe("POST /api/access-request", () => {
  it("creates an access request and returns 201", async () => {
    mockEntity.get.mockResolvedValue(null);
    mockEntity.create.mockResolvedValue({
      email: "test@example.com",
      name: "Jane",
      status: "pending",
      requestedAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await POST(
      makeRequest({ name: "Jane", email: "test@example.com" }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.status).toBe("created");
    expect(mockEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Jane", email: "test@example.com" }),
    );
  });

  it("returns already_requested for duplicate email", async () => {
    mockEntity.get.mockResolvedValue({
      email: "test@example.com",
      name: "Jane",
      status: "pending",
    });

    const res = await POST(
      makeRequest({ name: "Jane", email: "test@example.com" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("already_requested");
    expect(mockEntity.create).not.toHaveBeenCalled();
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(
      makeRequest({ name: "Jane", email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(isRateLimited).mockReturnValue(true);

    const res = await POST(
      makeRequest({ name: "Jane", email: "test@example.com" }),
    );
    expect(res.status).toBe(429);
  });

  it("passes optional sport and role", async () => {
    mockEntity.get.mockResolvedValue(null);
    mockEntity.create.mockResolvedValue({
      email: "test@example.com",
      name: "Jane",
      sport: "Swimming",
      role: "Athlete",
      status: "pending",
      requestedAt: "2026-01-01T00:00:00.000Z",
    });

    await POST(
      makeRequest({
        name: "Jane",
        email: "test@example.com",
        sport: "Swimming",
        role: "Athlete",
      }),
    );

    expect(mockEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({ sport: "Swimming", role: "Athlete" }),
    );
  });
});
