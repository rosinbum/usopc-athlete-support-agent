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

vi.mock("../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

import { auth } from "../../../../auth.js";
import { createSourceConfigEntity } from "../../../../lib/source-config.js";
import { GET, POST } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createSourceConfigEntity);

const SAMPLE_SOURCES = [
  { id: "src1", title: "Source 1", enabled: true },
  { id: "src2", title: "Source 2", enabled: false },
];

const VALID_CREATE_BODY = {
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
// Helper to build a Request with JSON body
// ---------------------------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/sources
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /api/admin/sources
// ---------------------------------------------------------------------------

describe("POST /api/admin/sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await POST(jsonRequest(VALID_CREATE_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when required fields are missing", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(jsonRequest({}) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 for invalid URL", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(
      jsonRequest({ ...VALID_CREATE_BODY, url: "not-a-url" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.details.url).toBeDefined();
  });

  it("returns 400 for empty topicDomains", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(
      jsonRequest({ ...VALID_CREATE_BODY, topicDomains: [] }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.details.topicDomains).toBeDefined();
  });

  it("returns 400 for invalid ID format", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(
      jsonRequest({ ...VALID_CREATE_BODY, id: "INVALID ID!" }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.details.id).toBeDefined();
  });

  it("returns 201 with created source on success", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const createdSource = {
      ...VALID_CREATE_BODY,
      enabled: true,
      lastIngestedAt: null,
      lastContentHash: null,
      consecutiveFailures: 0,
      lastError: null,
      s3Key: null,
      s3VersionId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    mockCreateEntity.mockReturnValueOnce({
      create: vi.fn().mockResolvedValueOnce(createdSource),
    } as never);

    const res = await POST(jsonRequest(VALID_CREATE_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.source.id).toBe("test-source");
    expect(body.source.enabled).toBe(true);
  });

  it("returns 409 when source ID already exists", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const conflictError = new Error("Conditional check failed");
    conflictError.name = "ConditionalCheckFailedException";

    mockCreateEntity.mockReturnValueOnce({
      create: vi.fn().mockRejectedValueOnce(conflictError),
    } as never);

    const res = await POST(jsonRequest(VALID_CREATE_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("A source with this ID already exists");
  });

  it("returns 500 on unexpected error", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    mockCreateEntity.mockReturnValueOnce({
      create: vi.fn().mockRejectedValueOnce(new Error("Unexpected")),
    } as never);

    const res = await POST(jsonRequest(VALID_CREATE_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to create source");
  });
});
