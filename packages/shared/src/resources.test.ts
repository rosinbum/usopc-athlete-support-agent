import { describe, it, expect, vi } from "vitest";

vi.mock("sst", () => ({
  Resource: {
    AppTable: { name: "test-table" },
    IngestionQueue: { url: "https://sqs.example.com/ingestion" },
    DocumentsBucket: { name: "test-bucket" },
    // DiscoveryFeedQueue intentionally omitted to test missing resource
  },
}));

import { getResource } from "./resources.js";

describe("getResource", () => {
  it("returns AppTable resource", () => {
    expect(getResource("AppTable")).toEqual({ name: "test-table" });
  });

  it("returns IngestionQueue resource", () => {
    expect(getResource("IngestionQueue")).toEqual({
      url: "https://sqs.example.com/ingestion",
    });
  });

  it("returns DocumentsBucket resource", () => {
    expect(getResource("DocumentsBucket")).toEqual({ name: "test-bucket" });
  });

  it("throws when resource is missing", () => {
    expect(() => getResource("DiscoveryFeedQueue")).toThrow(
      "SST Resource 'DiscoveryFeedQueue' not available",
    );
  });
});
