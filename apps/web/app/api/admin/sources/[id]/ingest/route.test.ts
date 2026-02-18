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

const mockSqsSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn(() => ({ send: mockSqsSend })),
  SendMessageCommand: vi.fn((input: unknown) => input),
}));

vi.mock("sst", () => ({
  Resource: {
    IngestionQueue: { url: "https://sqs.us-east-1.amazonaws.com/test-queue" },
  },
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

  it("sends SQS message and returns success", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockSqsSend.mockResolvedValueOnce({});

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
    expect(mockSqsSend).toHaveBeenCalledOnce();
  });

  it("returns 500 when SQS send fails", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockSqsSend.mockRejectedValueOnce(new Error("SQS error"));

    const res = await POST(
      new Request("http://localhost/api/admin/sources/usopc-bylaws/ingest", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "usopc-bylaws" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to trigger ingestion");
  });
});
