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

vi.mock("../../../../../lib/discovered-source.js", () => ({
  createDiscoveredSourceEntity: vi.fn(),
}));

vi.mock("../../../../../lib/source-config.js", () => ({
  createSourceConfigEntity: vi.fn(),
}));

vi.mock("../../../../../lib/send-to-sources.js", () => ({
  sendDiscoveryToSources: vi.fn(),
}));

import { auth } from "../../../../../auth.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";
import { sendDiscoveryToSources } from "../../../../../lib/send-to-sources.js";
import { GET, PATCH } from "./route.js";

const mockAuth = vi.mocked(auth);
const mockCreateEntity = vi.mocked(createDiscoveredSourceEntity);
const mockCreateSCEntity = vi.mocked(createSourceConfigEntity);
const mockSendToSources = vi.mocked(sendDiscoveryToSources);

const SAMPLE_DISCOVERY = {
  id: "disc-1",
  title: "Test Discovery",
  url: "https://example.com",
  status: "pending_content",
  combinedConfidence: 0.72,
  sourceConfigId: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/discoveries/disc-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/discoveries/[id]
// ---------------------------------------------------------------------------

describe("GET /api/admin/discoveries/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await GET(new Request("http://localhost"), makeParams("d1"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns discovery detail", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_DISCOVERY),
    } as never);

    const res = await GET(
      new Request("http://localhost"),
      makeParams("disc-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discovery.id).toBe("disc-1");
  });

  it("returns 404 for missing discovery", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await GET(
      new Request("http://localhost"),
      makeParams("missing"),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Discovery not found");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/discoveries/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/discoveries/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const res = await PATCH(
      jsonRequest({ action: "approve" }),
      makeParams("d1"),
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("approves a discovery", async () => {
    const approved = { ...SAMPLE_DISCOVERY, status: "approved" };
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi
        .fn()
        .mockResolvedValueOnce(SAMPLE_DISCOVERY)
        .mockResolvedValueOnce(approved),
      approve: vi.fn().mockResolvedValueOnce(undefined),
    } as never);

    const res = await PATCH(
      jsonRequest({ action: "approve" }),
      makeParams("disc-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discovery.status).toBe("approved");
  });

  it("rejects a discovery with reason", async () => {
    const rejected = { ...SAMPLE_DISCOVERY, status: "rejected" };
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi
        .fn()
        .mockResolvedValueOnce(SAMPLE_DISCOVERY)
        .mockResolvedValueOnce(rejected),
      reject: vi.fn().mockResolvedValueOnce(undefined),
    } as never);

    const res = await PATCH(
      jsonRequest({ action: "reject", reason: "Not relevant" }),
      makeParams("disc-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discovery.status).toBe("rejected");
  });

  it("returns 400 when rejecting without reason", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await PATCH(
      jsonRequest({ action: "reject" }),
      makeParams("disc-1"),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid action", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);

    const res = await PATCH(
      jsonRequest({ action: "delete" }),
      makeParams("disc-1"),
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when discovery does not exist", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(null),
    } as never);

    const res = await PATCH(
      jsonRequest({ action: "approve" }),
      makeParams("missing"),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Discovery not found");
  });

  // -------------------------------------------------------------------------
  // send_to_sources
  // -------------------------------------------------------------------------

  it("sends an approved discovery to sources", async () => {
    const approved = { ...SAMPLE_DISCOVERY, status: "approved" };
    const linked = { ...approved, sourceConfigId: "disc-1" };
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi
        .fn()
        .mockResolvedValueOnce(approved)
        .mockResolvedValueOnce(linked),
    } as never);
    mockCreateSCEntity.mockReturnValueOnce({} as never);
    mockSendToSources.mockResolvedValueOnce({
      discoveryId: "disc-1",
      sourceConfigId: "disc-1",
      status: "created",
    });

    const res = await PATCH(
      jsonRequest({ action: "send_to_sources" }),
      makeParams("disc-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.discovery.sourceConfigId).toBe("disc-1");
    expect(body.result.status).toBe("created");
  });

  it("returns 400 when sending non-approved discovery to sources", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(SAMPLE_DISCOVERY),
    } as never);

    const res = await PATCH(
      jsonRequest({ action: "send_to_sources" }),
      makeParams("disc-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(
      "Discovery must be approved before sending to sources",
    );
  });

  it("returns 500 when send_to_sources fails", async () => {
    const approved = { ...SAMPLE_DISCOVERY, status: "approved" };
    mockAuth.mockResolvedValueOnce({
      user: { email: "admin@test.com" },
    } as never);
    mockCreateEntity.mockReturnValueOnce({
      getById: vi.fn().mockResolvedValueOnce(approved),
    } as never);
    mockCreateSCEntity.mockReturnValueOnce({} as never);
    mockSendToSources.mockResolvedValueOnce({
      discoveryId: "disc-1",
      status: "failed",
      error: "DynamoDB error",
    });

    const res = await PATCH(
      jsonRequest({ action: "send_to_sources" }),
      makeParams("disc-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DynamoDB error");
  });
});
