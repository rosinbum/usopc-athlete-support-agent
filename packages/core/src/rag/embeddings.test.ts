import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOpenAIEmbeddings } = vi.hoisted(() => ({
  mockOpenAIEmbeddings: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: mockOpenAIEmbeddings,
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    logger: {
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
  };
});

import { createEmbeddings, createRawEmbeddings } from "./embeddings.js";

describe("createEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("should create OpenAIEmbeddings with correct model", () => {
    createEmbeddings("test-api-key");

    expect(mockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "text-embedding-3-small",
      }),
    );
  });

  it("should create embeddings with correct dimensions", () => {
    createEmbeddings("test-api-key");

    expect(mockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: 1536,
      }),
    );
  });

  it("should use provided API key", () => {
    createEmbeddings("my-custom-key");

    expect(mockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        openAIApiKey: "my-custom-key",
      }),
    );
  });

  it("should fall back to environment variable when no key provided", () => {
    process.env.OPENAI_API_KEY = "env-api-key";

    createEmbeddings();

    expect(mockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        openAIApiKey: "env-api-key",
      }),
    );
  });

  it("should use undefined for API key when not provided and env not set", () => {
    createEmbeddings();

    expect(mockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        openAIApiKey: undefined,
      }),
    );
  });

  it("should return a ProtectedOpenAIEmbeddings instance", () => {
    const mockInstance = {
      embedDocuments: vi.fn(),
      embedQuery: vi.fn(),
    };
    mockOpenAIEmbeddings.mockReturnValue(mockInstance);

    const result = createEmbeddings("key");

    // Should be a ProtectedOpenAIEmbeddings wrapper
    expect(result).toHaveProperty("embedDocuments");
    expect(result).toHaveProperty("embedQuery");
    expect(typeof result.embedDocuments).toBe("function");
    expect(typeof result.embedQuery).toBe("function");
  });
});

describe("createRawEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("should return raw OpenAIEmbeddings instance", () => {
    const mockInstance = { embedDocuments: vi.fn() };
    mockOpenAIEmbeddings.mockReturnValue(mockInstance);

    const result = createRawEmbeddings("key");

    expect(result).toBe(mockInstance);
  });

  it("should create with correct parameters", () => {
    createRawEmbeddings("test-key");

    expect(mockOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        openAIApiKey: "test-key",
        modelName: "text-embedding-3-small",
        dimensions: 1536,
      }),
    );
  });
});
