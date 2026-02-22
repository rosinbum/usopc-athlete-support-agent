import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../../../auth.js", () => ({
  auth: vi.fn(),
}));
vi.mock("../../../../../../lib/auth-env.js", () => ({
  getAdminEmails: vi.fn(() => ["admin@test.com"]),
}));

vi.mock("../../../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

vi.mock("@usopc/shared", () => ({
  logger: {
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  },
}));

const mockTriggerIngestion = vi.fn();
vi.mock("../../../../../../lib/services/source-service.js", () => ({
  triggerIngestion: (...args: unknown[]) => mockTriggerIngestion(...args),
}));

import { auth } from "../../../../../../auth.js";
import { createSourceConfigEntity } from "../../../../../../lib/source-config.js";
import { POST } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createSourceConfigEntity);

const SAMPLE_SOURCE = {
  id: "usopc-bylaws",
  title: "USOPC Bylaws",
  documentType: "bylaws",
  topicDomains: ["governance"],
  url: "https://example.com/bylaws.pdf",
  format: "pdf",
  ngbId: null,
  priority: "high",
  description: "Bylaws doc",
  authorityLevel: "usopc_governance",
  enabled: true,
};

describe("POST /api/admin/sources/[id]/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await POST(
      new Request("http://localhost/api/admin/sources/test/ingest", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "test" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "user@example.com" },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/admin/sources/test/ingest", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 404 when source not found", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/admin/sources/missing/ingest", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Source not found");
  });

  it("delegates to triggerIngestion and returns success", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockTriggerIngestion.mockResolvedValueOnce({ triggered: true });

    const res = await POST(
      new Request("http://localhost/api/admin/sources/usopc-bylaws/ingest", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sourceId).toBe("usopc-bylaws");
    expect(mockTriggerIngestion).toHaveBeenCalledWith(SAMPLE_SOURCE);
  });

  it("returns 501 when triggerIngestion fails", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockTriggerIngestion.mockRejectedValueOnce(new Error("Queue unavailable"));

    const res = await POST(
      new Request("http://localhost/api/admin/sources/usopc-bylaws/ingest", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(501);
    expect(body.error).toBe("Ingestion queue not available (dev environment)");
  });
});
