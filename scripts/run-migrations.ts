/**
 * Database migration runner.
 *
 * Resolves DATABASE_URL from environment (via .env.local or Cloud Run env)
 * and runs node-pg-migrate programmatically.
 *
 * On a fresh database (e.g. new Cloud SQL instance), the bootstrap schema
 * (init-db.sql) is applied first to create extensions and base tables.
 * All statements use IF NOT EXISTS, so this is a no-op on existing databases.
 *
 * Usage: dotenv -e .env.local -- npx tsx scripts/run-migrations.ts
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { getDatabaseUrl, getPool, closePool } from "@usopc/shared";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Execute init-db.sql to ensure extensions and base tables exist.
 * All statements are IF NOT EXISTS, making this safe for existing databases.
 */
async function bootstrapSchema(): Promise<void> {
  const sqlPath = resolve(__dirname, "init-db.sql");
  const sql = await readFile(sqlPath, "utf-8");
  const pool = getPool();
  await pool.query(sql);
  console.log("Bootstrap schema applied (init-db.sql).");
  await closePool();
}

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();

  await bootstrapSchema();

  console.log("Running database migrations...");

  const migrations = await runner({
    databaseUrl,
    dir: resolve(__dirname, "migrations"),
    direction: "up",
    migrationsTable: "pgmigrations",
    verbose: false,
    log: console.log,
  });

  if (migrations.length === 0) {
    console.log("No new migrations to apply.");
  } else {
    console.log(`Applied ${migrations.length} migration(s):`);
    for (const m of migrations) {
      console.log(`  - ${m.name}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
