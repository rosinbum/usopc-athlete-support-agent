/**
 * Database migration runner.
 *
 * Resolves DATABASE_URL via SST Resource bindings (getDatabaseUrl from @usopc/shared)
 * and runs node-pg-migrate programmatically.
 *
 * Usage: sst shell --stage <stage> -- npx tsx scripts/run-migrations.ts
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { getDatabaseUrl } from "@usopc/shared";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
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
