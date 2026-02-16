import { describe, it, expect, vi, type Mock } from "vitest";
import type { DiscoveredSource } from "@usopc/shared";
import { sendDiscoveryToSources } from "./send-to-sources.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiscovery(
  overrides: Partial<DiscoveredSource> = {},
): DiscoveredSource {
  return {
    id: "disc-1",
    url: "https://example.com/page",
    title: "Test Page",
    discoveryMethod: "search",
    discoveredAt: "2025-01-01T00:00:00Z",
    discoveredFrom: null,
    status: "approved",
    metadataConfidence: 0.9,
    contentConfidence: 0.85,
    combinedConfidence: 0.87,
    documentType: "Policy",
    topicDomains: ["governance"],
    format: "html",
    ngbId: null,
    priority: "medium",
    description: "A test page",
    authorityLevel: "educational_guidance",
    metadataReasoning: null,
    contentReasoning: null,
    reviewedAt: "2025-01-02T00:00:00Z",
    reviewedBy: "admin@test.com",
    rejectionReason: null,
    sourceConfigId: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-02T00:00:00Z",
    ...overrides,
  };
}

interface MockSCEntity {
  getById: Mock;
  getAll: Mock;
  create: Mock;
}

interface MockDSEntity {
  linkToSourceConfig: Mock;
}

function makeSourceConfigEntity(
  overrides: Partial<MockSCEntity> = {},
): MockSCEntity {
  return {
    getById: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "disc-1" }),
    ...overrides,
  };
}

function makeDiscoveredSourceEntity(): MockDSEntity {
  return {
    linkToSourceConfig: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendDiscoveryToSources", () => {
  it("returns 'not_approved' for non-approved discoveries", async () => {
    const result = await sendDiscoveryToSources(
      makeDiscovery({ status: "pending_content" }),
      makeSourceConfigEntity() as never,
      makeDiscoveredSourceEntity() as never,
    );

    expect(result).toEqual({
      discoveryId: "disc-1",
      status: "not_approved",
    });
  });

  it("returns 'already_linked' when sourceConfigId exists", async () => {
    const result = await sendDiscoveryToSources(
      makeDiscovery({ sourceConfigId: "existing-sc" }),
      makeSourceConfigEntity() as never,
      makeDiscoveredSourceEntity() as never,
    );

    expect(result).toEqual({
      discoveryId: "disc-1",
      sourceConfigId: "existing-sc",
      status: "already_linked",
    });
  });

  it("returns 'already_linked' when SourceConfig with same ID exists", async () => {
    const scEntity = makeSourceConfigEntity({
      getById: vi
        .fn()
        .mockResolvedValue({ id: "disc-1", url: "https://other.com" }),
    });
    const dsEntity = makeDiscoveredSourceEntity();

    const result = await sendDiscoveryToSources(
      makeDiscovery(),
      scEntity as never,
      dsEntity as never,
    );

    expect(result).toEqual({
      discoveryId: "disc-1",
      sourceConfigId: "disc-1",
      status: "already_linked",
    });
    expect(dsEntity.linkToSourceConfig).toHaveBeenCalledWith(
      "disc-1",
      "disc-1",
    );
  });

  it("returns 'duplicate_url' when SourceConfig with same URL exists", async () => {
    const scEntity = makeSourceConfigEntity({
      getAll: vi
        .fn()
        .mockResolvedValue([
          { id: "existing-sc", url: "https://example.com/page" },
        ]),
    });
    const dsEntity = makeDiscoveredSourceEntity();

    const result = await sendDiscoveryToSources(
      makeDiscovery(),
      scEntity as never,
      dsEntity as never,
    );

    expect(result).toEqual({
      discoveryId: "disc-1",
      sourceConfigId: "existing-sc",
      status: "duplicate_url",
    });
    expect(dsEntity.linkToSourceConfig).toHaveBeenCalledWith(
      "disc-1",
      "existing-sc",
    );
  });

  it("creates a SourceConfig and links it", async () => {
    const scEntity = makeSourceConfigEntity();
    const dsEntity = makeDiscoveredSourceEntity();

    const result = await sendDiscoveryToSources(
      makeDiscovery(),
      scEntity as never,
      dsEntity as never,
    );

    expect(result).toEqual({
      discoveryId: "disc-1",
      sourceConfigId: "disc-1",
      status: "created",
    });

    expect(scEntity.create).toHaveBeenCalledWith({
      id: "disc-1",
      title: "Test Page",
      documentType: "Policy",
      topicDomains: ["governance"],
      url: "https://example.com/page",
      format: "html",
      ngbId: null,
      priority: "medium",
      description: "A test page",
      authorityLevel: "educational_guidance",
    });

    expect(dsEntity.linkToSourceConfig).toHaveBeenCalledWith(
      "disc-1",
      "disc-1",
    );
  });

  it("uses defaults for null metadata fields", async () => {
    const scEntity = makeSourceConfigEntity();
    const dsEntity = makeDiscoveredSourceEntity();

    await sendDiscoveryToSources(
      makeDiscovery({
        documentType: null,
        format: null,
        priority: null,
        description: null,
        authorityLevel: null,
      }),
      scEntity as never,
      dsEntity as never,
    );

    expect(scEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: "Unknown",
        format: "html",
        priority: "medium",
        description: "",
        authorityLevel: "educational_guidance",
      }),
    );
  });

  it("returns 'failed' when create throws", async () => {
    const scEntity = makeSourceConfigEntity({
      create: vi.fn().mockRejectedValue(new Error("DynamoDB error")),
    });

    const result = await sendDiscoveryToSources(
      makeDiscovery(),
      scEntity as never,
      makeDiscoveredSourceEntity() as never,
    );

    expect(result).toEqual({
      discoveryId: "disc-1",
      status: "failed",
      error: "DynamoDB error",
    });
  });
});
