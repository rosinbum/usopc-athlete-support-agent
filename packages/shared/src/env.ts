/**
 * Retrieves a required environment variable. Throws if the variable is not set
 * or is an empty string.
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${key}`,
    );
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
 *   2. SST Resource binding — constructs a URL from individual SST-injected vars
 *      (`SST_RESOURCE_Database` JSON with `host`, `port`, `username`, `password`,
 *       `database` fields).
 *   3. Throws if neither source is available.
 */
export function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl) {
    return directUrl;
  }

  // Attempt to construct from SST Resource binding
  const sstRaw = process.env.SST_RESOURCE_Database;
  if (sstRaw) {
    try {
      const resource = JSON.parse(sstRaw) as {
        host: string;
        port: number | string;
        username: string;
        password: string;
        database: string;
      };
      return `postgresql://${encodeURIComponent(resource.username)}:${encodeURIComponent(resource.password)}@${resource.host}:${resource.port}/${resource.database}`;
    } catch {
      throw new Error(
        "Failed to parse SST_RESOURCE_Database. Ensure it is valid JSON.",
      );
    }
  }

  throw new Error(
    "DATABASE_URL is not set and SST_RESOURCE_Database is not available. " +
      "Provide DATABASE_URL or deploy with SST resource bindings.",
  );
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
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === undefined
  );
}
