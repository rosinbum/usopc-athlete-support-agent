# Commands Reference

## Monorepo-wide (via Turbo)

```bash
pnpm build          # Build all packages
pnpm dev            # Run dev servers via SST (injects secrets)
pnpm test           # Run all tests
pnpm typecheck      # Type-check all packages
pnpm lint           # Lint all packages
```

## Single-package Commands

```bash
# Testing a specific package
pnpm --filter @usopc/core test
pnpm --filter @usopc/ingestion test
pnpm --filter @usopc/api test

# Single test file (vitest pattern)
pnpm --filter @usopc/ingestion test -- src/db.test.ts

# Type-check a specific package
pnpm --filter @usopc/api typecheck
```

## Database (Local Docker Postgres with pgvector)

```bash
pnpm db:up          # Start Postgres container
pnpm db:down        # Stop container
pnpm db:migrate     # Run migrations (via @usopc/api)

# Local development database URL
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/usopc_athlete_support
```

## Ingestion Scripts

All ingestion scripts require SST context (secrets and resources).

```bash
pnpm ingest                        # Run document ingestion
pnpm ingest -- --source <id>       # Ingest single source
pnpm seed                          # Seed Postgres database
pnpm seed:dynamodb                 # Seed DynamoDB source configs from JSON
pnpm seed:dynamodb -- --dry-run    # Preview migration
```

## Source Management

```bash
pnpm sources list                  # List source configs from DynamoDB
pnpm sources show <id>             # Show source details
pnpm sources enable <id>           # Enable a source
pnpm sources disable <id>          # Disable a source
```
