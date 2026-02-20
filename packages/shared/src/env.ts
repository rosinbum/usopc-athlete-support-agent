import { Resource } from "sst";
import { z } from "zod";

/**
 * Retrieves a required environment variable. Throws if the variable is not set
 * or is an empty string.
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Retrieves an optional environment variable with an optional default value.
 * Returns `undefined` if the variable is not set and no default is provided.
 */
export function getOptionalEnv(
  key: string,
  defaultValue?: string,
): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value;
}

const LOCAL_DEV_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/usopc_athlete_support";

/**
 * Returns the database connection URL.
 *
 * Resolution order:
 *   1. `DATABASE_URL` environment variable (set directly or via .env)
 *   2. SST Resource binding (`Resource.Database` with `host`, `port`,
 *      `username`, `password`, `database` fields).
 *   3. In development mode, falls back to the standard local Docker URL.
 *   4. Throws if neither source is available.
 */
export function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl) {
    return directUrl;
  }

  // Attempt to use SST Resource binding (Database only exists in production stage)
  try {
    const db = (Resource as unknown as Record<string, Record<string, string>>)
      .Database!;
    return `postgresql://${encodeURIComponent(db["username"]!)}:${encodeURIComponent(db["password"]!)}@${db["host"]!}:${db["port"]!}/${db["database"]!}`;
  } catch {
    if (isDevelopment()) {
      return LOCAL_DEV_DATABASE_URL;
    }
    throw new Error(
      "DATABASE_URL is not set and SST Database resource is not available. " +
        "Provide DATABASE_URL or deploy with SST resource bindings.",
    );
  }
}

/**
 * Resolve a secret value by checking a plain environment variable first, then
 * falling back to an SST v3 Resource binding.
 *
 * This allows the same code to work both locally (with a plain env var) and
 * under `sst shell` / SST-deployed Lambdas (with resource bindings).
 */
export function getSecretValue(
  envKey: string,
  sstResourceName?: string,
): string {
  // 1. Direct env var (highest priority)
  const direct = process.env[envKey];
  if (direct) return direct;

  // 2. SST Resource binding
  if (sstResourceName) {
    try {
      const resource = (
        Resource as unknown as Record<string, { value?: string }>
      )[sstResourceName];
      if (resource?.value) return resource.value;
    } catch {
      // Resource not available — fall through to error
    }
  }

  const sources = [envKey];
  if (sstResourceName) sources.push(`Resource.${sstResourceName}`);
  throw new Error(`Missing required secret. Checked: ${sources.join(", ")}`);
}

/**
 * Resolve an optional secret value by checking a plain environment variable
 * first, then falling back to an SST v3 Resource binding. Returns the default
 * value if neither is available.
 *
 * Use this for configuration values that have sensible defaults.
 */
export function getOptionalSecretValue(
  envKey: string,
  sstResourceName: string,
  defaultValue: string,
): string {
  // 1. Direct env var (highest priority)
  const direct = process.env[envKey];
  if (direct) return direct;

  // 2. SST Resource binding
  try {
    const resource = (
      Resource as unknown as Record<string, { value?: string }>
    )[sstResourceName];
    if (resource?.value) return resource.value;
  } catch {
    // Resource not available — fall through to default
  }

  return defaultValue;
}

/**
 * Returns `true` when `NODE_ENV` is `"production"`.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Returns `true` when `NODE_ENV` is `"development"` or is not set.
 */
export function isDevelopment(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === undefined
  );
}

/**
 * Parses an environment variable as an integer using Zod.
 * Throws with a clear message if set but not a valid integer.
 * Returns `defaultValue` if the variable is unset or empty.
 */
export function parseEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const result = z.coerce.number().int().safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid integer value for ${key}: "${raw}". Expected a whole number.`,
    );
  }
  return result.data;
}

/**
 * Parses an environment variable as a float using Zod.
 * Throws with a clear message if set but not a valid number.
 * Returns `defaultValue` if the variable is unset or empty.
 */
export function parseEnvFloat(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const result = z.coerce.number().safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid numeric value for ${key}: "${raw}". Expected a number.`,
    );
  }
  return result.data;
}
