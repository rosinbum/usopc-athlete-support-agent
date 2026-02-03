import { Resource } from "sst";

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

/**
 * Returns the database connection URL.
 *
 * Resolution order:
 *   1. `DATABASE_URL` environment variable (set directly or via .env)
 *   2. SST Resource binding (`Resource.Database` with `host`, `port`,
 *      `username`, `password`, `database` fields).
 *   3. Throws if neither source is available.
 */
export function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl) {
    return directUrl;
  }

  // Attempt to use SST Resource binding (Database only exists in production stage)
  try {
    const db = (Resource as unknown as Record<string, Record<string, string>>)
      .Database;
    return `postgresql://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${db.database}`;
  } catch {
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
