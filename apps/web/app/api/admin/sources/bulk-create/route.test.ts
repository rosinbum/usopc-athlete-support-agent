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

vi.mock("../../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

import { auth } from "../../../../../auth.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { POST } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createSourceConfigEntity);

const VALID_SOURCE = {
  id: "test-source",
  title: "Test Source",
  documentType: "policy",
  topicDomains: ["governance"],
  url: "https://example.com/doc.pdf",
  format: "pdf",
  ngbId: null,
  priority: "medium",
  description: "A test source",
  authorityLevel: "educational_guidance",
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/sources/bulk-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/sources/bulk-create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await POST(jsonRequest({ sources: [VALID_SOURCE] }) as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await POST(jsonRequest({ sources: [VALID_SOURCE] }) as never);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when sources array is empty", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(jsonRequest({ sources: [] }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when body is missing sources key", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(jsonRequest({}) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns 201 with all sources created", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const mockCreate = vi.fn().mockResolvedValue({});
    mockCreateEntity.mockReturnValueOnce({ create: mockCreate } as never);

    const sources = [
      { ...VALID_SOURCE, id: "source-1", title: "Source 1" },
      { ...VALID_SOURCE, id: "source-2", title: "Source 2" },
    ];

    const res = await POST(jsonRequest({ sources }) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toEqual({
      id: "source-1",
      title: "Source 1",
      status: "created",
    });
    expect(body.results[1]).toEqual({
      id: "source-2",
      title: "Source 2",
      status: "created",
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("handles ConditionalCheckFailedException as duplicate", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const conflictError = new Error("Conditional check failed");
    conflictError.name = "ConditionalCheckFailedException";

    const mockCreate = vi.fn().mockRejectedValueOnce(conflictError);
    mockCreateEntity.mockReturnValueOnce({ create: mockCreate } as never);

    const res = await POST(jsonRequest({ sources: [VALID_SOURCE] }) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.results[0].status).toBe("duplicate");
    expect(body.results[0].error).toBe("Source already exists");
  });

  it("handles unexpected errors as failed", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("DynamoDB timeout"));
    mockCreateEntity.mockReturnValueOnce({ create: mockCreate } as never);

    const res = await POST(jsonRequest({ sources: [VALID_SOURCE] }) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.results[0].status).toBe("failed");
    expect(body.results[0].error).toBe("DynamoDB timeout");
  });

  it("handles partial failures (some created, some failed)", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const conflictError = new Error("Conditional check failed");
    conflictError.name = "ConditionalCheckFailedException";

    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conflictError)
      .mockRejectedValueOnce(new Error("Timeout"));
    mockCreateEntity.mockReturnValueOnce({ create: mockCreate } as never);

    const sources = [
      { ...VALID_SOURCE, id: "new-source", title: "New" },
      { ...VALID_SOURCE, id: "existing-source", title: "Existing" },
      { ...VALID_SOURCE, id: "broken-source", title: "Broken" },
    ];

    const res = await POST(jsonRequest({ sources }) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.results).toHaveLength(3);
    expect(body.results[0].status).toBe("created");
    expect(body.results[1].status).toBe("duplicate");
    expect(body.results[2].status).toBe("failed");
  });
});
