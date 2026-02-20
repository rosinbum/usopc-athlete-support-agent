import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to avoid hoisting issues with vi.mock
const { mockResource } = vi.hoisted(() => ({
  mockResource: {} as Record<string, unknown>,
}));

vi.mock("sst", () => ({
  Resource: new Proxy(mockResource, {
    get(target, prop: string | symbol) {
      if (typeof prop === "string" && prop in target) return target[prop];
      throw new Error(`Resource ${String(prop)} not found`);
    },
  }),
}));

import {
  getRequiredEnv,
  getOptionalEnv,
  getDatabaseUrl,
  getSecretValue,
  isProduction,
  isDevelopment,
  parseEnvInt,
  parseEnvFloat,
} from "./env.js";

describe("getRequiredEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the value when env var is set", () => {
    process.env.TEST_VAR = "test-value";
    expect(getRequiredEnv("TEST_VAR")).toBe("test-value");
  });

  it("throws when env var is not set", () => {
    delete process.env.MISSING_VAR;
    expect(() => getRequiredEnv("MISSING_VAR")).toThrow(
      "Missing required environment variable: MISSING_VAR",
    );
  });

  it("throws when env var is empty string", () => {
    process.env.EMPTY_VAR = "";
    expect(() => getRequiredEnv("EMPTY_VAR")).toThrow(
      "Missing required environment variable: EMPTY_VAR",
    );
  });
});

describe("getOptionalEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the value when env var is set", () => {
    process.env.OPT_VAR = "optional-value";
    expect(getOptionalEnv("OPT_VAR")).toBe("optional-value");
  });

  it("returns undefined when env var is not set and no default", () => {
    delete process.env.MISSING_OPT;
    expect(getOptionalEnv("MISSING_OPT")).toBeUndefined();
  });

  it("returns default value when env var is not set", () => {
    delete process.env.MISSING_WITH_DEFAULT;
    expect(getOptionalEnv("MISSING_WITH_DEFAULT", "fallback")).toBe("fallback");
  });

  it("returns default value when env var is empty string", () => {
    process.env.EMPTY_OPT = "";
    expect(getOptionalEnv("EMPTY_OPT", "fallback")).toBe("fallback");
  });

  it("returns actual value over default when set", () => {
    process.env.SET_VAR = "actual";
    expect(getOptionalEnv("SET_VAR", "fallback")).toBe("actual");
  });
});

describe("getDatabaseUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear mock resource
    Object.keys(mockResource).forEach((key) => delete mockResource[key]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns DATABASE_URL when set", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    expect(getDatabaseUrl()).toBe("postgresql://localhost:5432/test");
  });

  it("returns SST Resource URL when DATABASE_URL is not set", () => {
    delete process.env.DATABASE_URL;
    mockResource.Database = {
      host: "db.example.com",
      port: "5432",
      username: "user",
      password: "pass",
      database: "mydb",
    };

    expect(getDatabaseUrl()).toBe(
      "postgresql://user:pass@db.example.com:5432/mydb",
    );
  });

  it("URL-encodes special characters in username and password", () => {
    delete process.env.DATABASE_URL;
    mockResource.Database = {
      host: "db.example.com",
      port: "5432",
      username: "user@domain",
      password: "p@ss:word/123",
      database: "mydb",
    };

    const url = getDatabaseUrl();
    expect(url).toContain("user%40domain");
    expect(url).toContain("p%40ss%3Aword%2F123");
  });

  it("throws when neither DATABASE_URL nor SST Resource is available in production", () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";
    // mockResource.Database is not set, so accessing it will throw

    expect(() => getDatabaseUrl()).toThrow(
      "DATABASE_URL is not set and SST Database resource is not available",
    );
  });

  it("returns local dev default when in development mode and no other source", () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";

    expect(getDatabaseUrl()).toBe(
      "postgresql://postgres:postgres@localhost:5432/usopc_athlete_support",
    );
  });

  it("returns local dev default when NODE_ENV is unset and no other source", () => {
    delete process.env.DATABASE_URL;
    delete process.env.NODE_ENV;

    expect(getDatabaseUrl()).toBe(
      "postgresql://postgres:postgres@localhost:5432/usopc_athlete_support",
    );
  });

  it("prefers DATABASE_URL over local dev default", () => {
    process.env.DATABASE_URL = "postgresql://custom:5433/other";
    process.env.NODE_ENV = "development";

    expect(getDatabaseUrl()).toBe("postgresql://custom:5433/other");
  });

  it("prefers DATABASE_URL over SST Resource", () => {
    process.env.DATABASE_URL = "postgresql://env-url/db";
    mockResource.Database = {
      host: "sst-host",
      port: "5432",
      username: "sst-user",
      password: "sst-pass",
      database: "sst-db",
    };

    expect(getDatabaseUrl()).toBe("postgresql://env-url/db");
  });
});

describe("getSecretValue", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    Object.keys(mockResource).forEach((key) => delete mockResource[key]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns env var value when set", () => {
    process.env.API_KEY = "env-secret";
    expect(getSecretValue("API_KEY", "ApiKey")).toBe("env-secret");
  });

  it("returns SST Resource value when env var is not set", () => {
    delete process.env.API_KEY;
    mockResource.ApiKey = { value: "sst-secret" };

    expect(getSecretValue("API_KEY", "ApiKey")).toBe("sst-secret");
  });

  it("prefers env var over SST Resource", () => {
    process.env.API_KEY = "env-secret";
    mockResource.ApiKey = { value: "sst-secret" };

    expect(getSecretValue("API_KEY", "ApiKey")).toBe("env-secret");
  });

  it("throws when neither source has the secret", () => {
    delete process.env.MISSING_SECRET;
    // mockResource.MissingSecret not set

    expect(() => getSecretValue("MISSING_SECRET", "MissingSecret")).toThrow(
      "Missing required secret. Checked: MISSING_SECRET, Resource.MissingSecret",
    );
  });

  it("throws with only env key in message when no SST resource name provided", () => {
    delete process.env.ONLY_ENV;

    expect(() => getSecretValue("ONLY_ENV")).toThrow(
      "Missing required secret. Checked: ONLY_ENV",
    );
  });

  it("works without SST resource name parameter", () => {
    process.env.ENV_ONLY_SECRET = "value";
    expect(getSecretValue("ENV_ONLY_SECRET")).toBe("value");
  });
});

describe("isProduction", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
  });

  it("returns false when NODE_ENV is development", () => {
    process.env.NODE_ENV = "development";
    expect(isProduction()).toBe(false);
  });

  it("returns false when NODE_ENV is not set", () => {
    delete process.env.NODE_ENV;
    expect(isProduction()).toBe(false);
  });
});

describe("isDevelopment", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when NODE_ENV is development", () => {
    process.env.NODE_ENV = "development";
    expect(isDevelopment()).toBe(true);
  });

  it("returns true when NODE_ENV is not set", () => {
    delete process.env.NODE_ENV;
    expect(isDevelopment()).toBe(true);
  });

  it("returns false when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    expect(isDevelopment()).toBe(false);
  });

  it("returns false when NODE_ENV is test", () => {
    process.env.NODE_ENV = "test";
    expect(isDevelopment()).toBe(false);
  });
});

describe("parseEnvInt", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default when env var is not set", () => {
    delete process.env.MY_INT;
    expect(parseEnvInt("MY_INT", 42)).toBe(42);
  });

  it("returns default when env var is empty string", () => {
    process.env.MY_INT = "";
    expect(parseEnvInt("MY_INT", 42)).toBe(42);
  });

  it("parses a valid integer", () => {
    process.env.MY_INT = "10";
    expect(parseEnvInt("MY_INT", 42)).toBe(10);
  });

  it("parses a negative integer", () => {
    process.env.MY_INT = "-5";
    expect(parseEnvInt("MY_INT", 42)).toBe(-5);
  });

  it("throws for a non-integer string", () => {
    process.env.MY_INT = "abc";
    expect(() => parseEnvInt("MY_INT", 42)).toThrow(
      'Invalid integer value for MY_INT: "abc". Expected a whole number.',
    );
  });

  it("throws for a float string", () => {
    process.env.MY_INT = "1.5";
    expect(() => parseEnvInt("MY_INT", 42)).toThrow(
      'Invalid integer value for MY_INT: "1.5". Expected a whole number.',
    );
  });
});

describe("parseEnvFloat", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default when env var is not set", () => {
    delete process.env.MY_FLOAT;
    expect(parseEnvFloat("MY_FLOAT", 3.14)).toBe(3.14);
  });

  it("returns default when env var is empty string", () => {
    process.env.MY_FLOAT = "";
    expect(parseEnvFloat("MY_FLOAT", 3.14)).toBe(3.14);
  });

  it("parses a valid float", () => {
    process.env.MY_FLOAT = "2.5";
    expect(parseEnvFloat("MY_FLOAT", 3.14)).toBe(2.5);
  });

  it("parses a whole number as float", () => {
    process.env.MY_FLOAT = "7";
    expect(parseEnvFloat("MY_FLOAT", 3.14)).toBe(7);
  });

  it("parses a negative float", () => {
    process.env.MY_FLOAT = "-1.5";
    expect(parseEnvFloat("MY_FLOAT", 3.14)).toBe(-1.5);
  });

  it("throws for a non-numeric string", () => {
    process.env.MY_FLOAT = "abc";
    expect(() => parseEnvFloat("MY_FLOAT", 3.14)).toThrow(
      'Invalid numeric value for MY_FLOAT: "abc". Expected a number.',
    );
  });
});
