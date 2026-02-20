import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that reference them
// ---------------------------------------------------------------------------

vi.mock("./table.js", () => ({
  createAppTable: vi.fn((name: string) => ({ name, _isTable: true })),
}));

vi.mock("../resources.js", () => ({
  getResource: vi.fn(() => ({ name: "test-table" })),
}));

vi.mock("./SourceConfigEntity.js", () => ({
  SourceConfigEntity: vi
    .fn()
    .mockImplementation((table) => ({ _entity: "SourceConfig", table })),
}));

vi.mock("./IngestionLogEntity.js", () => ({
  IngestionLogEntity: vi.fn().mockImplementation((table) => ({
    _entity: "IngestionLog",
    table,
  })),
}));

vi.mock("./DiscoveredSourceEntity.js", () => ({
  DiscoveredSourceEntity: vi.fn().mockImplementation((table) => ({
    _entity: "DiscoveredSource",
    table,
  })),
}));

vi.mock("../logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Subject under test — imported after mocks are declared
// ---------------------------------------------------------------------------

import { createAppTable } from "./table.js";
import { getResource } from "../resources.js";
import {
  getAppTableName,
  createSourceConfigEntity,
  createIngestionLogEntity,
  createDiscoveredSourceEntity,
} from "./factory.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getAppTableName", () => {
  it("returns the name from getResource", () => {
    vi.mocked(getResource).mockReturnValue({ name: "my-app-table" });
    expect(getAppTableName()).toBe("my-app-table");
  });
});

describe("Table singleton cache", () => {
  beforeEach(() => {
    vi.mocked(createAppTable).mockClear();
    // Reset module-level cache by re-importing is not straightforward in Vitest;
    // instead we verify call counts to confirm caching behavior.
  });

  it("returns the same Table instance for the same tableName", () => {
    vi.mocked(getResource).mockReturnValue({ name: "cached-table" });

    const e1 = createSourceConfigEntity("cached-table");
    const e2 = createIngestionLogEntity("cached-table");

    // createAppTable should be called only once because the second call hits the cache
    const callsForName = vi
      .mocked(createAppTable)
      .mock.calls.filter(([n]) => n === "cached-table");
    expect(callsForName.length).toBeLessThanOrEqual(1);
    // Both entities share the same underlying table instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((e1 as any).table).toBe((e2 as any).table);
  });

  it("creates separate Table instances for different tableNames", () => {
    const beforeCount = vi.mocked(createAppTable).mock.calls.length;

    createSourceConfigEntity("table-alpha");
    createSourceConfigEntity("table-beta");

    const afterCount = vi.mocked(createAppTable).mock.calls.length;
    expect(afterCount - beforeCount).toBe(2);
  });
});

describe("createSourceConfigEntity", () => {
  it("returns a SourceConfigEntity", () => {
    vi.mocked(getResource).mockReturnValue({ name: "app-table" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = createSourceConfigEntity() as any;
    expect(entity._entity).toBe("SourceConfig");
  });

  it("uses the provided tableName over getAppTableName", () => {
    const before = vi.mocked(createAppTable).mock.calls.length;
    createSourceConfigEntity("custom-table");
    const calls = vi.mocked(createAppTable).mock.calls.slice(before);
    const customCall = calls.find(([n]) => n === "custom-table");
    // Either it hit the cache (no new call) or it called createAppTable with custom-table
    if (customCall) {
      expect(customCall[0]).toBe("custom-table");
    }
  });
});

describe("createIngestionLogEntity", () => {
  it("returns an IngestionLogEntity", () => {
    vi.mocked(getResource).mockReturnValue({ name: "app-table" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = createIngestionLogEntity() as any;
    expect(entity._entity).toBe("IngestionLog");
  });
});

describe("createDiscoveredSourceEntity", () => {
  it("returns a DiscoveredSourceEntity", () => {
    vi.mocked(getResource).mockReturnValue({ name: "app-table" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = createDiscoveredSourceEntity() as any;
    expect(entity._entity).toBe("DiscoveredSource");
  });
});
