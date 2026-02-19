import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be declared before imports so vi.mock hoisting works
vi.mock("@usopc/shared", () => ({
  getOptionalSecretValue: vi.fn(),
}));

import { getOptionalSecretValue } from "@usopc/shared";
import {
  createContext,
  authenticated,
  publicProcedure,
  router,
} from "./trpc.js";
import { TRPCError } from "@trpc/server";

const mockGetOptionalSecretValue = vi.mocked(getOptionalSecretValue);

// Build a minimal tRPC caller to exercise the authenticated middleware
const testRouter = router({
  protected: publicProcedure.use(authenticated).query(() => "ok"),
});

function createCaller(apiKey?: string) {
  const ctx = createContext(
    apiKey
      ? {
          req: new Request("https://example.com", {
            headers: { "x-api-key": apiKey },
          }),
        }
      : undefined,
  );
  return testRouter.createCaller(ctx);
}

describe("createContext", () => {
  it("extracts x-api-key header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-api-key": "test-key" },
    });
    const ctx = createContext({ req });
    expect(ctx.apiKey).toBe("test-key");
    expect(ctx.requestId).toBeDefined();
  });

  it("sets apiKey to undefined when header is absent", () => {
    const ctx = createContext({ req: new Request("https://example.com") });
    expect(ctx.apiKey).toBeUndefined();
  });
});

describe("authenticated middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through when no API key is configured (dev mode)", async () => {
    mockGetOptionalSecretValue.mockReturnValue("");

    const caller = createCaller();
    const result = await caller.protected();
    expect(result).toBe("ok");
  });

  it("passes through with correct API key when one is configured", async () => {
    mockGetOptionalSecretValue.mockReturnValue("my-secret-key");

    const caller = createCaller("my-secret-key");
    const result = await caller.protected();
    expect(result).toBe("ok");
  });

  it("throws UNAUTHORIZED when API key is missing but one is required", async () => {
    mockGetOptionalSecretValue.mockReturnValue("my-secret-key");

    const caller = createCaller(); // no key in request
    await expect(caller.protected()).rejects.toThrow(TRPCError);
    await expect(caller.protected()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Missing x-api-key header.",
    });
  });

  it("throws UNAUTHORIZED for an incorrect API key", async () => {
    mockGetOptionalSecretValue.mockReturnValue("my-secret-key");

    const caller = createCaller("wrong-key");
    await expect(caller.protected()).rejects.toThrow(TRPCError);
    await expect(caller.protected()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid API key.",
    });
  });

  it("does not allow key bypass using the 'anonymous' string", async () => {
    mockGetOptionalSecretValue.mockReturnValue("my-secret-key");

    const caller = createCaller("anonymous");
    await expect(caller.protected()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
