import { Pool } from "pg";
import { getDatabaseUrl } from "./env.js";
import { logger } from "./logger.js";

let pool: Pool | null = null;

export interface PoolStatus {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

/**
 * Returns a singleton database pool instance.
 * Uses getDatabaseUrl() to resolve the connection string from
 * DATABASE_URL env var or SST Secret binding.
 * Enables SSL automatically for Neon Postgres connections.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    const needsSsl =
      connectionString.includes("neon.tech") ||
      connectionString.includes("sslmode=require");
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: true,
      ...(needsSsl ? { ssl: true } : {}),
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
