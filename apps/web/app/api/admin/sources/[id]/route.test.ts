import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../../auth.js", () => ({
  auth: vi.fn(),
}));

vi.mock("../../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

import { auth } from "../../../../../auth.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { GET, PATCH } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createSourceConfigEntity);

const SAMPLE_SOURCE = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  enabled: true,
  url: "https://example.com/bylaws.pdf",
};

describe("GET /api/admin/sources/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/test"),
      {
        params: Promise.resolve({ id: "test" }),
      },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 for missing source", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/missing"),
      {
        params: Promise.resolve({ id: "missing" }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Source not found");
  });

  it("returns source detail", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);

    const res = await GET(
      new Request("http://localhost/api/admin/sources/usopc-bylaws"),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source.id).toBe("usopc-bylaws");
  });
});

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

  it("rejects unknown fields", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ authorityLevel: "law" }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
  });

  it("rejects empty body", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

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
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

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
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/admin/sources/test", {
        method: "PATCH",
        body: JSON.stringify({ enabled: "yes" }),
      }),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(400);
  });

  it("updates allowed fields", async () => {
    const updated = { ...SAMPLE_SOURCE, enabled: false };
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      update: vi.fn().mockResolvedValueOnce(updated),
    } as never);

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
  });
});
