import { Pool } from "pg";
import { getDatabaseUrl } from "./env.js";

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
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
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
