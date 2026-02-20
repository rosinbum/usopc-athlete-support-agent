import { describe, expect, it } from "vitest";
import { apiError } from "./apiResponse.js";

describe("apiError", () => {
  it("returns a response with the given status code", async () => {
    const response = apiError("Not found", 404);
    expect(response.status).toBe(404);
  });

  it("returns JSON body with error field", async () => {
    const response = apiError("Something went wrong", 500);
    const body = await response.json();
    expect(body).toEqual({ error: "Something went wrong" });
  });

  it("includes optional code field when provided", async () => {
    const response = apiError("Unauthorized", 401, "AUTH_REQUIRED");
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized", code: "AUTH_REQUIRED" });
  });

  it("omits code field when not provided", async () => {
    const response = apiError("Bad request", 400);
    const body = await response.json();
    expect(body.error).toBe("Bad request");
  });
});
