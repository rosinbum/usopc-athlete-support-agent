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

const mockDeleteChunks = vi.fn().mockResolvedValue(0);
vi.mock("@usopc/shared", () => ({
  getPool: () => "mock-pool",
  deleteChunksBySourceId: (...args: unknown[]) => mockDeleteChunks(...args),
  getResource: vi.fn((key: string) => {
    if (key === "IngestionQueue")
      return { url: "https://sqs.us-east-1.amazonaws.com/test-queue" };
    throw new Error(`SST Resource '${key}' not available`);
  }),
  logger: {
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  },
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

import { auth } from "../../../../../auth.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
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

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/sources/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/sources/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await POST(makeRequest({ action: "enable", ids: ["src1"] }));

    expect(res.status).toBe(401);
  });

  it("returns 400 when action is missing", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(makeRequest({ ids: ["src1"] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is empty", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(makeRequest({ action: "enable", ids: [] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("At least one ID is required");
  });

  it("returns 400 for invalid action", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(makeRequest({ action: "purge", ids: ["src1"] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when ids contain non-string values", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await POST(
      makeRequest({ action: "enable", ids: [123, { malicious: true }] }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when ids exceed max length", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const ids = Array.from({ length: 101 }, (_, i) => `src-${i}`);
    const res = await POST(makeRequest({ action: "enable", ids }));

    expect(res.status).toBe(400);
  });

  it("bulk enables sources", async () => {
    const mockEnable = vi.fn().mockResolvedValue(undefined);
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      enable: mockEnable,
    } as never);

    const res = await POST(
      makeRequest({ action: "enable", ids: ["src1", "src2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockEnable).toHaveBeenCalledTimes(2);
    expect(mockEnable).toHaveBeenCalledWith("src1");
    expect(mockEnable).toHaveBeenCalledWith("src2");
  });

  it("bulk disables sources", async () => {
    const mockDisable = vi.fn().mockResolvedValue(undefined);
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      disable: mockDisable,
    } as never);

    const res = await POST(makeRequest({ action: "disable", ids: ["src1"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(0);
  });

  it("counts failures when enable throws", async () => {
    const mockEnable = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("DynamoDB error"));
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      enable: mockEnable,
    } as never);

    const res = await POST(
      makeRequest({ action: "enable", ids: ["src1", "src2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);
  });

  it("bulk ingests sources via SQS", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_SOURCE),
    } as never);
    mockSqsSend.mockResolvedValueOnce({});

    const res = await POST(
      makeRequest({ action: "ingest", ids: ["usopc-bylaws"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(0);
    expect(mockSqsSend).toHaveBeenCalledOnce();
  });

  it("bulk deletes sources with chunk cleanup", async () => {
    const mockEntityDelete = vi.fn().mockResolvedValue(undefined);
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      delete: mockEntityDelete,
    } as never);
    mockDeleteChunks.mockResolvedValue(5);

    const res = await POST(
      makeRequest({ action: "delete", ids: ["src1", "src2"] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(mockDeleteChunks).toHaveBeenCalledTimes(2);
    expect(mockEntityDelete).toHaveBeenCalledWith("src1");
    expect(mockEntityDelete).toHaveBeenCalledWith("src2");
  });

  it("counts failure when source not found for ingest", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await POST(makeRequest({ action: "ingest", ids: ["missing"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(1);
  });
});
