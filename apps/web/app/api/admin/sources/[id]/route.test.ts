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

const mockCountChunks = vi.fn().mockResolvedValue(0);

vi.mock("@usopc/shared", () => ({
  getPool: () => "mock-pool",
  countChunksBySourceId: (...args: unknown[]) => mockCountChunks(...args),
  logger: {
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  },
}));

const mockUpdateSource = vi.fn();
const mockDeleteSource = vi.fn();
vi.mock("../../../../../lib/services/source-service.js", () => ({
  updateSource: (...args: unknown[]) => mockUpdateSource(...args),
  deleteSource: (...args: unknown[]) => mockDeleteSource(...args),
}));

import { auth } from "../../../../../auth.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { GET, PATCH, DELETE } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createSourceConfigEntity);

const SAMPLE_SOURCE = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  enabled: true,
  url: "https://example.com/bylaws.pdf",
  format: "pdf",
  documentType: "bylaws",
  topicDomains: ["governance"],
  ngbId: null,
  priority: "high",
  description: "Bylaws doc",
  authorityLevel: "usopc_governance",
};

function authedAdmin() {
  mockAuth.mockResolvedValueOnce({
    user: { email: "admin@test.com", role: "admin" as const },
  } as never);
}

// ===========================================================================
// GET
// ===========================================================================

describe("GET /api/admin/sources/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/test"),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/test"),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 404 for missing source", async () => {
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Source not found");
  });

  it("returns source detail with chunk count", async () => {
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockCountChunks.mockResolvedValueOnce(42);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/usopc-bylaws"),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source.id).toBe("usopc-bylaws");
    expect(body.chunkCount).toBe(42);
  });
});

// ===========================================================================
// PATCH
// ===========================================================================

describe("PATCH /api/admin/sources/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("rejects unknown fields", async () => {
    authedAdmin();

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ bogusField: "foo" }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(400);
  });

  it("rejects empty body", async () => {
    authedAdmin();

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No valid fields to update");
  });

  it("rejects invalid URL", async () => {
    authedAdmin();

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ url: "not-a-url" }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Must be a valid URL");
  });

  it("rejects non-boolean enabled", async () => {
    authedAdmin();

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ enabled: "yes" }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(400);
  });

  it("delegates to updateSource and returns result", async () => {
    const updated = { ...SAMPLE_SOURCE, enabled: false };
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce("mock-entity" as never);
    mockUpdateSource.mockResolvedValueOnce({
      source: updated,
      actions: {},
    });

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/usopc-bylaws", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source.enabled).toBe(false);
    expect(body.actions).toEqual({});
    expect(mockUpdateSource).toHaveBeenCalledWith(
      "usopc-bylaws",
      { enabled: false },
      "mock-entity",
      "mock-pool",
    );
  });

  it("returns metadata update actions from service", async () => {
    const updated = { ...SAMPLE_SOURCE, title: "Updated Title" };
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce("mock-entity" as never);
    mockUpdateSource.mockResolvedValueOnce({
      source: updated,
      actions: { chunksUpdated: 5 },
    });

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/usopc-bylaws", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated Title" }),
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source.title).toBe("Updated Title");
    expect(body.actions.chunksUpdated).toBe(5);
  });

  it("returns content change actions from service", async () => {
    const updated = { ...SAMPLE_SOURCE, url: "https://example.com/new.pdf" };
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce("mock-entity" as never);
    mockUpdateSource.mockResolvedValueOnce({
      source: updated,
      actions: { chunksDeleted: 10, reIngestionTriggered: true },
    });

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/usopc-bylaws", {
        method: "PATCH",
        body: JSON.stringify({ url: "https://example.com/new.pdf" }),
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actions.chunksDeleted).toBe(10);
    expect(body.actions.reIngestionTriggered).toBe(true);
  });

  it("content-affecting change wins over metadata change", async () => {
    const updated = {
      ...SAMPLE_SOURCE,
      url: "https://example.com/new.pdf",
      title: "New Title",
    };
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce("mock-entity" as never);
    mockUpdateSource.mockResolvedValueOnce({
      source: updated,
      actions: { chunksDeleted: 3, reIngestionTriggered: true },
    });

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/usopc-bylaws", {
        method: "PATCH",
        body: JSON.stringify({
          url: "https://example.com/new.pdf",
          title: "New Title",
        }),
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actions.chunksDeleted).toBe(3);
    expect(body.actions.reIngestionTriggered).toBe(true);
    expect(mockUpdateSource).toHaveBeenCalledWith(
      "usopc-bylaws",
      { url: "https://example.com/new.pdf", title: "New Title" },
      "mock-entity",
      "mock-pool",
    );
  });

  it("accepts all new field types", async () => {
    const updated = {
      ...SAMPLE_SOURCE,
      authorityLevel: "law",
      topicDomains: ["eligibility", "governance"],
    };
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce("mock-entity" as never);
    mockUpdateSource.mockResolvedValueOnce({
      source: updated,
      actions: { chunksUpdated: 2 },
    });

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/usopc-bylaws", {
        method: "PATCH",
        body: JSON.stringify({
          authorityLevel: "law",
          topicDomains: ["eligibility", "governance"],
        }),
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actions.chunksUpdated).toBe(2);
  });
});

// ===========================================================================
// DELETE
// ===========================================================================

describe("DELETE /api/admin/sources/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await DELETE(
      new Request("http://localhost/api/admin/sources/test", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await DELETE(
      new Request("http://localhost/api/admin/sources/test", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 404 for missing source", async () => {
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await DELETE(
      new Request("http://localhost/api/admin/sources/missing", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Source not found");
  });

  it("delegates to deleteSource and returns result", async () => {
    authedAdmin();
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockDeleteSource.mockResolvedValueOnce({ chunksDeleted: 15 });

    const res = await DELETE(
      new Request("http://localhost/api/admin/sources/usopc-bylaws", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sourceId).toBe("usopc-bylaws");
    expect(body.chunksDeleted).toBe(15);
    expect(mockDeleteSource).toHaveBeenCalledWith(
      "usopc-bylaws",
      expect.anything(),
      "mock-pool",
    );
  });
});
