import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChatAnthropic, mockChatOpenAI, mockChatGoogle, mockChatVertexAI } =
  vi.hoisted(() => ({
    mockChatAnthropic: vi
      .fn()
      .mockImplementation(() => ({ _type: "anthropic" })),
    mockChatOpenAI: vi.fn().mockImplementation(() => ({ _type: "openai" })),
    mockChatGoogle: vi.fn().mockImplementation(() => ({ _type: "google" })),
    mockChatVertexAI: vi
      .fn()
      .mockImplementation(() => ({ _type: "google-vertex" })),
  }));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: mockChatAnthropic,
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: mockChatOpenAI,
}));

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: mockChatGoogle,
}));

vi.mock("@langchain/google-vertexai", () => ({
  ChatVertexAI: mockChatVertexAI,
}));

vi.mock("./models.js", () => ({
  getModelConfig: vi.fn().mockResolvedValue({
    agent: {
      model: "claude-sonnet-4-20250514",
      temperature: 0.1,
      maxTokens: 4096,
      provider: "anthropic",
    },
    classifier: {
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
      maxTokens: 1024,
      provider: "anthropic",
    },
  }),
}));

import { createChatModel, createAgentModels } from "./modelFactory.js";

describe("createChatModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates ChatAnthropic for anthropic provider", () => {
    createChatModel({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
    });
    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
    });
  });

  it("defaults to ChatAnthropic when no provider specified", () => {
    createChatModel({ model: "claude-sonnet-4-20250514" });
    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
    });
  });

  it("creates ChatOpenAI for openai provider", () => {
    createChatModel({ model: "gpt-4.1", provider: "openai" });
    expect(mockChatOpenAI).toHaveBeenCalledWith({ model: "gpt-4.1" });
  });

  it("creates ChatGoogleGenerativeAI for google provider", () => {
    createChatModel({ model: "gemini-2.0-flash", provider: "google" });
    expect(mockChatGoogle).toHaveBeenCalledWith({ model: "gemini-2.0-flash" });
  });

  it("passes temperature when provided", () => {
    createChatModel({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      temperature: 0.5,
    });
    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
      temperature: 0.5,
    });
  });

  it("passes maxTokens for anthropic", () => {
    createChatModel({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      maxTokens: 2048,
    });
    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
      maxTokens: 2048,
    });
  });

  it("passes maxTokens for openai", () => {
    createChatModel({ model: "gpt-4.1", provider: "openai", maxTokens: 2048 });
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: "gpt-4.1",
      maxTokens: 2048,
    });
  });

  it("maps maxTokens to maxOutputTokens for google", () => {
    createChatModel({
      model: "gemini-2.0-flash",
      provider: "google",
      maxTokens: 2048,
    });
    expect(mockChatGoogle).toHaveBeenCalledWith({
      model: "gemini-2.0-flash",
      maxOutputTokens: 2048,
    });
  });

  it("creates ChatVertexAI for google-vertex provider", () => {
    createChatModel({ model: "gemini-2.0-flash", provider: "google-vertex" });
    expect(mockChatVertexAI).toHaveBeenCalledWith({
      model: "gemini-2.0-flash",
    });
  });

  it("maps maxTokens to maxOutputTokens for google-vertex", () => {
    createChatModel({
      model: "gemini-2.0-flash",
      provider: "google-vertex",
      maxTokens: 4096,
      temperature: 0.2,
    });
    expect(mockChatVertexAI).toHaveBeenCalledWith({
      model: "gemini-2.0-flash",
      maxOutputTokens: 4096,
      temperature: 0.2,
    });
  });

  it("omits temperature and maxTokens when not provided", () => {
    createChatModel({ model: "gpt-4.1", provider: "openai" });
    expect(mockChatOpenAI).toHaveBeenCalledWith({ model: "gpt-4.1" });
  });

  it("defaults unknown provider to anthropic", () => {
    createChatModel({ model: "some-model", provider: "unknown" });
    expect(mockChatAnthropic).toHaveBeenCalled();
  });
});

describe("createAgentModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agentModel and classifierModel", async () => {
    const models = await createAgentModels();
    expect(models).toHaveProperty("agentModel");
    expect(models).toHaveProperty("classifierModel");
  });

  it("creates both models from config", async () => {
    await createAgentModels();
    expect(mockChatAnthropic).toHaveBeenCalledTimes(2);
  });

  it("passes agent config to first model", async () => {
    await createAgentModels();
    expect(mockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-20250514",
        temperature: 0.1,
        maxTokens: 4096,
      }),
    );
  });

  it("passes classifier config to second model", async () => {
    await createAgentModels();
    expect(mockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        temperature: 0,
        maxTokens: 1024,
      }),
    );
  });
});
