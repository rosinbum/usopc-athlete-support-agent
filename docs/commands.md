# Commands Reference

## Monorepo-wide

```bash
pnpm build          # Build all packages
pnpm dev            # Run dev servers via SST (injects secrets)
pnpm test           # Run all tests
pnpm typecheck      # Type-check all packages
```

## Single-package Commands

```bash
# Testing a specific package
pnpm --filter @usopc/core test
pnpm --filter @usopc/ingestion test

# Single test file (vitest pattern)
pnpm --filter @usopc/ingestion test -- src/db.test.ts
```

## Database (Local Docker Postgres with pgvector)

```bash
pnpm db:up          # Start Postgres container
pnpm db:down        # Stop container

# Local development database URL
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/usopc_athlete_support
```

## Ingestion Scripts

All ingestion scripts require SST context (secrets and resources).

```bash
pnpm ingest                        # Run document ingestion
pnpm ingest -- --source <id>       # Ingest single source
pnpm seed                          # Full local setup (PG + DynamoDB + optional ingest)
pnpm seed -- --skip-ingest         # PG + DynamoDB only (skip document ingestion)
pnpm seed -- --force               # Overwrite existing DynamoDB items + re-ingest all
pnpm seed -- --dry-run             # Preview DynamoDB changes, skip ingestion
pnpm seed:pg                       # Seed Postgres only (schema + ingestion)
pnpm seed:pg -- --init-only        # Postgres schema init only
pnpm seed:dynamodb                 # Seed DynamoDB source configs from JSON
pnpm seed:dynamodb -- --dry-run    # Preview DynamoDB changes
pnpm seed:dynamodb -- --force      # Overwrite existing DynamoDB items
```

## Source Management

```bash
pnpm sources list                  # List source configs from DynamoDB
pnpm sources show <id>             # Show source details
pnpm sources enable <id>           # Enable a source
pnpm sources disable <id>          # Disable a source
```

## Discovery

```bash
pnpm --filter @usopc/ingestion discovery:run              # Run source discovery
pnpm --filter @usopc/ingestion discovery:run -- --dry-run  # Preview without saving
pnpm --filter @usopc/ingestion discovery:run -- --domain <domain>  # Specific domain
pnpm --filter @usopc/ingestion discovery:run -- --query <query>    # Specific search query
pnpm --filter @usopc/ingestion discovery:run -- --json     # JSON output
```

## Evaluations (@usopc/evals)

```bash
pnpm --filter @usopc/evals eval                        # Run all LangSmith evaluations
pnpm --filter @usopc/evals seed-langsmith              # Seed LangSmith datasets
```

## Quality Review (@usopc/evals)

```bash
pnpm --filter @usopc/evals quality:seed                # Seed quality review dataset to LangSmith
pnpm --filter @usopc/evals quality:run                 # Run quality review scenarios
```
