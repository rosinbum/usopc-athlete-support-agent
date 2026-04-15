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
 *   1. `DATABASE_URL` environment variable (set via .env.local or Cloud Run env)
 *   2. In explicit development mode (`NODE_ENV=development`), falls back to
 *      the standard local Docker URL.
 *   3. Throws if no source is available.
 */
export function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl) {
    return directUrl;
  }

  // Only fall back to localhost when NODE_ENV is explicitly "development",
  // not when it is undefined (e.g. CI environments).
  if (process.env.NODE_ENV === "development") {
    return LOCAL_DEV_DATABASE_URL;
  }
  throw new Error(
    "DATABASE_URL is not set. " +
      "Provide DATABASE_URL via environment variable or .env.local file.",
  );
}

/**
 * Resolve a secret value from an environment variable.
 */
export function getSecretValue(envKey: string): string {
  const direct = process.env[envKey];
  if (direct) return direct;

  throw new Error(`Missing required secret: ${envKey}`);
}

/**
 * Resolve an optional secret value from an environment variable.
 * Returns the default value if not available.
 */
export function getOptionalSecretValue(
  envKey: string,
  defaultValue: string,
): string {
  const direct = process.env[envKey];
  if (direct) return direct;

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
