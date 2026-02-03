import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOpenAIEmbeddings } = vi.hoisted(() => ({
  mockOpenAIEmbeddings: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: mockOpenAIEmbeddings,
}));

import { createEmbeddings } from "./embeddings.js";

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

  it("should return the created embeddings instance", () => {
    const mockInstance = { embedDocuments: vi.fn() };
    mockOpenAIEmbeddings.mockReturnValue(mockInstance);

    const result = createEmbeddings("key");

    expect(result).toBe(mockInstance);
  });
});
