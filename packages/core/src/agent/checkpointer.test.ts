import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFromConnString, mockSetup, MockMemorySaver } = vi.hoisted(() => {
  const mockSetup = vi.fn().mockResolvedValue(undefined);
  const mockFromConnString = vi.fn().mockReturnValue({ setup: mockSetup });
  const MockMemorySaver = vi.fn();
  return { mockFromConnString, mockSetup, MockMemorySaver };
});

vi.mock("@langchain/langgraph-checkpoint-postgres", () => ({
  PostgresSaver: { fromConnString: mockFromConnString },
}));

vi.mock("@langchain/langgraph", () => ({
  MemorySaver: MockMemorySaver,
}));

import {
  createPostgresCheckpointer,
  createMemoryCheckpointer,
} from "./checkpointer.js";

describe("createPostgresCheckpointer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PostgresSaver.fromConnString with the connection string", async () => {
    await createPostgresCheckpointer("postgresql://localhost:5432/test");

    expect(mockFromConnString).toHaveBeenCalledWith(
      "postgresql://localhost:5432/test",
    );
  });

  it("calls setup() on the saver", async () => {
    await createPostgresCheckpointer("postgresql://localhost:5432/test");

    expect(mockSetup).toHaveBeenCalledOnce();
  });

  it("returns the saver instance", async () => {
    const result = await createPostgresCheckpointer(
      "postgresql://localhost:5432/test",
    );

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
