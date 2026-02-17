# Conventions

## Formatting

Prettier with default settings (no config file). `.prettierignore` excludes `pnpm-lock.yaml` and auto-generated `sst-env.d.ts` files. Always format files before committing:

```bash
npx prettier --write "path/to/file.ts"   # Format specific files
npx prettier --check .                   # Check entire repo
```

## Key Conventions

- **Package manager**: pnpm 9.x with workspaces. Node >= 20 required.
- **Module system**: ESM throughout. TypeScript with `"module": "ESNext"`, `"moduleResolution": "bundler"`. Use `.js` extensions in imports (e.g., `import { foo } from "./bar.js"`).
- **Testing**: Vitest with no config files — uses defaults. Tests are co-located as `*.test.ts` in `src/`. Mocking pattern: `vi.mock()` with factory functions, declare mock fns above the `vi.mock()` call (but beware hoisting — class definitions used inside `vi.mock()` factories must be defined inside the factory or imported after).
- **Build orchestration**: pnpm workspaces with `pnpm -r` for recursive commands.
- **Environment resolution**: `@usopc/shared` provides `getDatabaseUrl()` (checks `DATABASE_URL` env, then SST Resource), `getSecretValue(envKey, sstResourceName)` (checks env, then SST Secret), and `getOptionalSecretValue(envKey, sstResourceName, defaultValue)` for optional config with defaults.
- **Configuration via SST Secrets**: Always use SST secrets for configuration values, not plain environment variables. For required secrets, use `new sst.Secret("Name")`. For optional config with defaults, use `new sst.Secret("Name", "defaultValue")` and read via `getOptionalSecretValue()`. Never rely on `getOptionalEnv()` for configuration that should be managed through SST.
- **SST secret naming**: SST secrets use PascalCase (`OpenaiApiKey`), env vars use SCREAMING_SNAKE_CASE (`OPENAI_API_KEY`). Use `getSecretValue("OPENAI_API_KEY", "OpenaiApiKey")` to check both.
- **Scripts needing AWS resources**: Wrap with `sst shell --` in package.json (e.g., `"ingest": "sst shell -- tsx src/scripts/ingest.ts"`). This injects SST Resource bindings. Don't add `process.env.SOME_CONFIG` fallbacks—use SST Resources only.
- **DynamoDB GSI keys cannot be null**: When using a Global Secondary Index, omit the attribute entirely rather than setting it to `null`. This creates a sparse index where items without the attribute aren't indexed.
- **Path resolution in scripts**: Scripts in `packages/*/src/scripts/` need 4 levels up (`../../../../`) to reach repo root.
- **Database**: PostgreSQL with pgvector. Schema includes `document_chunks` (embeddings with HNSW index), `conversations`, `messages`, `feedback`. Ingestion tracking lives in DynamoDB. Migrations run through the API package.
