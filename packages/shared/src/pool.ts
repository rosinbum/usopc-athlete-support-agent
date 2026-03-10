import { Pool } from "pg";
import { getDatabaseUrl } from "./env.js";
import { logger } from "./logger.js";

let pool: Pool | null = null;

export interface PoolStatus {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", ""]);

/**
 * Determines whether SSL should be enabled for a database connection.
 *
 * Parses the connection string as a URL to extract the hostname and
 * `sslmode` query parameter. SSL is enabled for all non-local hosts
 * unless explicitly disabled via `sslmode=disable`.
 */
export function needsSsl(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode === "disable") return false;
    if (sslmode === "require" || sslmode === "verify-full") return true;
    return !LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    // Unparseable URL — fall back to safe default (SSL on)
    return true;
  }
}

/**
 * Returns a singleton database pool instance.
 * Uses getDatabaseUrl() to resolve the connection string from
 * DATABASE_URL env var or SST Secret binding.
 * Enables SSL automatically for all non-local connections (SEC-2).
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: true,
      ...(needsSsl(connectionString) ? { ssl: true } : {}),
    });

    // Prevent process crash on idle connection backend errors (SEC-1).
    // When Neon suspends compute or a network blip occurs, idle connections
    // emit 'error' events. Without a handler Node treats these as uncaught
    // exceptions. The pool automatically removes dead connections.
    pool.on("error", (err) => {
      logger.error("Idle pool connection error (non-fatal)", {
        message: err.message,
      });
    });
  }
  return pool;
}

/**
 * Returns pool connection metrics, or null if the pool has not been created yet.
 */
export function getPoolStatus(): PoolStatus | null {
  if (!pool) return null;
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
  };
}

/**
 * Closes the database pool. Useful for testing and cleanup.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
