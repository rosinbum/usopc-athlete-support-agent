import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAppVersion } from "./version.js";

describe("getAppVersion", () => {
  const originalVersion = process.env.APP_VERSION;
  const originalCommit = process.env.APP_COMMIT;

  beforeEach(() => {
    delete process.env.APP_VERSION;
    delete process.env.APP_COMMIT;
  });

  afterEach(() => {
    if (originalVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = originalVersion;
    if (originalCommit === undefined) delete process.env.APP_COMMIT;
    else process.env.APP_COMMIT = originalCommit;
  });

  it("falls back to dev when env vars are unset", () => {
    expect(getAppVersion()).toEqual({
      version: "dev",
      commit: "dev",
      commitShort: "dev",
    });
  });

  it("returns a 7-char short SHA from APP_COMMIT", () => {
    process.env.APP_VERSION = "v0.6.2";
    process.env.APP_COMMIT = "2d465321abcdef1234567890";
    expect(getAppVersion()).toEqual({
      version: "v0.6.2",
      commit: "2d465321abcdef1234567890",
      commitShort: "2d46532",
    });
  });

  it("leaves commitShort as 'dev' when commit is 'dev'", () => {
    process.env.APP_VERSION = "v1.0.0";
    expect(getAppVersion().commitShort).toBe("dev");
  });
});
