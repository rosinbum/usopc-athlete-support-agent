import { resolveEnv } from "./helpers/resolveEnv.js";

// Vitest sets NODE_ENV=test by default, which prevents getDatabaseUrl()
// from falling back to the local dev URL. Restore development behavior
// so resolveEnv() can resolve the local database connection.
if (process.env.NODE_ENV === "test") {
  delete process.env.NODE_ENV;
}

// Bridge SST Resource bindings to process.env before any eval runs.
resolveEnv();
