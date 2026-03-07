import { describe, it, expect, vi, beforeEach } from "vitest";

const { MockPostgresSaver, mockSetup, MockMemorySaver } = vi.hoisted(() => {
  const mockSetup = vi.fn().mockResolvedValue(undefined);
  const MockPostgresSaver = vi.fn().mockReturnValue({ setup: mockSetup });
  const MockMemorySaver = vi.fn();
  return { MockPostgresSaver, mockSetup, MockMemorySaver };
});

vi.mock("@langchain/langgraph-checkpoint-postgres", () => ({
  PostgresSaver: MockPostgresSaver,
}));

vi.mock("@langchain/langgraph", () => ({
  MemorySaver: MockMemorySaver,
}));

import type { Pool } from "pg";
import {
  createPostgresCheckpointer,
  createMemoryCheckpointer,
} from "./checkpointer.js";

describe("createPostgresCheckpointer", () => {
  const fakePool = { query: vi.fn() } as unknown as Pool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs PostgresSaver with the provided pool", async () => {
    await createPostgresCheckpointer(fakePool);

    expect(MockPostgresSaver).toHaveBeenCalledWith(fakePool);
  });

  it("calls setup() on the saver", async () => {
    await createPostgresCheckpointer(fakePool);

    expect(mockSetup).toHaveBeenCalledOnce();
  });

  it("returns the saver instance", async () => {
    const result = await createPostgresCheckpointer(fakePool);

    expect(result).toEqual({ setup: mockSetup });
  });
});

describe("createMemoryCheckpointer", () => {
  it("returns a MemorySaver instance", () => {
    const result = createMemoryCheckpointer();

    expect(MockMemorySaver).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(MockMemorySaver);
  });
});
