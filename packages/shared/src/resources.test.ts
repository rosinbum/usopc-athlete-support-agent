import { describe, it, expect, vi, beforeEach } from "vitest";

import { getResource } from "./resources.js";

describe("getResource", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns IngestionQueue from env", () => {
    vi.stubEnv("INGESTION_QUEUE_URL", "https://sqs.example.com/ingestion");
    expect(getResource("IngestionQueue")).toEqual({
      url: "https://sqs.example.com/ingestion",
    });
  });

  it("returns DocumentsBucket from env", () => {
    vi.stubEnv("DOCUMENTS_BUCKET_NAME", "test-bucket");
    expect(getResource("DocumentsBucket")).toEqual({ name: "test-bucket" });
  });

  it("throws when resource is missing", () => {
    expect(() => getResource("DiscoveryFeedQueue")).toThrow(
      "Resource 'DiscoveryFeedQueue' not available",
    );
  });
});
