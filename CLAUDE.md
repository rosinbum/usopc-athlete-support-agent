# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

USOPC Athlete Support Agent — an AI-powered governance and compliance assistant for U.S. Olympic and Paralympic athletes. Built as a serverless monorepo deployed to AWS via SST v3.

## Commands

```bash
# Monorepo-wide (via Turbo)
pnpm build          # Build all packages
pnpm dev            # Run all dev servers
pnpm test           # Run all tests
pnpm typecheck      # Type-check all packages
pnpm lint           # Lint all packages

# Single-package testing
pnpm --filter @usopc/core test
pnpm --filter @usopc/ingestion test
pnpm --filter @usopc/api test

# Single test file (vitest pattern)
pnpm --filter @usopc/ingestion test -- src/db.test.ts

# Database (local Docker Postgres with pgvector)
pnpm db:up          # Start Postgres container
pnpm db:down        # Stop container
pnpm db:migrate     # Run migrations (via @usopc/api)

# Ingestion scripts
pnpm ingest         # Run document ingestion (tsx)
pnpm seed           # Seed database
```

## Architecture

```
packages/
  core/        @usopc/core       — LangGraph agent, RAG, vector store, tools
  ingestion/   @usopc/ingestion  — Document ETL: load → clean → split → embed → store
  shared/      @usopc/shared     — Logger, env helpers, error classes, Zod schemas

apps/
  api/         @usopc/api        — tRPC + Hono backend (Lambda)
  slack/       @usopc/slack      — Slack Bolt bot (Lambda)
  web/         @usopc/web        — Next.js 15 frontend (React 19, Tailwind 4)
```

**Dependency flow**: `apps/*` → `packages/core` → `packages/shared`; `packages/ingestion` → `packages/core` + `packages/shared`.

### AI Agent (LangGraph)

The core agent is a compiled LangGraph state machine in `packages/core/src/agent/graph.ts`:

```
START → classifier → (routeByDomain) → retriever | escalate
  retriever → (needsMoreInfo) → synthesizer | researcher
  researcher → synthesizer
  synthesizer → citationBuilder → disclaimerGuard → END
```

Key nodes: classifier, retriever (pgvector RAG), researcher (Tavily web search), synthesizer (Anthropic), citationBuilder, disclaimerGuard. Agent tools are in `packages/core/src/tools/`.

### Ingestion Pipeline

Fan-out architecture via SQS FIFO queue (production only):

- **Cron** (`packages/ingestion/src/cron.ts`): Weekly EventBridge trigger. Loads source configs from `data/sources/*.json`, fetches content, computes SHA-256 hash, skips unchanged sources, enqueues changed ones to SQS.
- **Worker** (`packages/ingestion/src/worker.ts`): Processes one source per SQS message. Pipeline: load (PDF/HTML/text) → clean → split → enrich metadata → extract sections → batch embed (OpenAI) → store in pgvector. Handles `QuotaExhaustedError` by purging the queue.

### Infrastructure (SST)

Defined in `sst.config.ts`. Production uses Aurora Serverless v2 with pgvector; dev stages use local Docker Postgres at `postgresql://postgres:postgres@localhost:5432/usopc_athlete_support`. SST Resource bindings provide secrets (`AnthropicApiKey`, `OpenaiApiKey`, `TavilyApiKey`, `SlackBotToken`, `SlackSigningSecret`) and resource URLs.

## Formatting

Prettier with default settings (no config file). `.prettierignore` excludes `pnpm-lock.yaml` and auto-generated `sst-env.d.ts` files. Always format files before committing:

```bash
npx prettier --write "path/to/file.ts"   # Format specific files
npx prettier --check .                   # Check entire repo
```

## Workflow

**Never commit directly to `main`.** Always create a feature branch and open a pull request.

For any implementation task:

1. Create a GitHub issue describing the planned work **before starting** (`gh issue create`). The issue should cover all implementation, not just tests or cleanup.
2. Create a feature branch off `main` (e.g., `feat/short-description` or `fix/short-description`)
3. Write or update the corresponding `*.test.ts` file alongside the source (tests are co-located in `src/`)
4. Run the relevant tests: `pnpm --filter @usopc/<package> test`
5. Format changed files: `npx prettier --write <files>`
6. Type-check: `pnpm --filter @usopc/<package> typecheck`
7. Commit, push, and open a PR referencing the issue (`gh pr create`)

**Keeping issues and PRs accurate:**

- Issue and PR descriptions must reflect the full scope of work — new features, architectural changes, bug fixes, tests, and any other modifications. Do not omit implementation work.
- If the plan changes during implementation (additional fixes, scope adjustments, new files added), update the GitHub issue to match (`gh issue edit`).
- PR descriptions should clearly separate categories of changes (e.g., "Implementation", "Tests", "Formatting") so reviewers can understand what was built vs. what was cleaned up.

## Issue Tracking

Proactively create GitHub issues (`gh issue create`) whenever you encounter:

- **Unimplemented features**: TODOs, placeholder responses, hardcoded stubs, or any code path that is clearly incomplete.
- **Future feature ideas**: When a conversation surfaces a new idea or improvement that isn't being implemented right now, capture it as an issue so it isn't lost.

Each issue should include a clear title, a description of what needs to be done (with relevant file paths), and a priority note if obvious. Label issues with `enhancement` or `bug` as appropriate. If the new issue depends on or relates to existing issues, reference them (e.g., "Depends on #5").

When writing code that is intentionally incomplete or deferred, add a `// TODO:` comment in the source with a short explanation and reference the GitHub issue number (e.g., `// TODO: Wire to agent graph (#5)`). This keeps the codebase searchable and links inline markers to tracked work.

## Key Conventions

- **Package manager**: pnpm 9.x with workspaces. Node >= 20 required.
- **Module system**: ESM throughout. TypeScript with `"module": "ESNext"`, `"moduleResolution": "bundler"`. Use `.js` extensions in imports (e.g., `import { foo } from "./bar.js"`).
- **Testing**: Vitest with no config files — uses defaults. Tests are co-located as `*.test.ts` in `src/`. Mocking pattern: `vi.mock()` with factory functions, declare mock fns above the `vi.mock()` call (but beware hoisting — class definitions used inside `vi.mock()` factories must be defined inside the factory or imported after).
- **Build orchestration**: Turbo. `build`, `test`, `typecheck`, and `lint` depend on `^build` (deps build first).
- **Environment resolution**: `@usopc/shared` provides `getDatabaseUrl()` (checks `DATABASE_URL` env, then SST Resource) and `getSecretValue(envKey, sstResourceName)` (checks env, then SST Secret).
- **Database**: PostgreSQL with pgvector. Schema includes `document_chunks` (embeddings with HNSW index), `conversations`, `messages`, `feedback`, `ingestion_status`. Migrations run through the API package.
