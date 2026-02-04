import { Pool } from "pg";
import { getDatabaseUrl } from "@usopc/shared";

let pool: Pool | null = null;

/**
 * Returns a singleton database pool instance.
 * Uses getDatabaseUrl() to resolve the connection string from
 * DATABASE_URL env var or SST Resource binding.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
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
