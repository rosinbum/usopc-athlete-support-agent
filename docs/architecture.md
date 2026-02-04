# Architecture

USOPC Athlete Support Agent is a serverless monorepo deployed to AWS via [SST v3](https://sst.dev/).

## Package Structure

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

## AI Agent (LangGraph)

The core agent is a compiled [LangGraph](https://langchain-ai.github.io/langgraph/) state machine in `packages/core/src/agent/graph.ts`:

```
START → classifier → clarify | retriever | escalate
             ↓            ↓          ↓
        needsClarification?      needsMoreInfo?
             ↓                  ↓       ↓
            END          synthesizer  researcher
                              ↓           ↓
                              └─────┬─────┘
                                    ↓
                             citationBuilder → disclaimerGuard → END
```

**Routing logic**:

```
START → classifier → (routeByDomain) → clarify | retriever | escalate
  clarify → END
  retriever → (needsMoreInfo) → synthesizer | researcher
  researcher → synthesizer
  synthesizer → citationBuilder → disclaimerGuard → END
  escalate → citationBuilder → disclaimerGuard → END
```

**Nodes**:

- `classifier`: Analyzes query to determine domain, intent, and whether clarification is needed
- `clarify`: Returns a clarifying question when the query is ambiguous
- `retriever`: Performs pgvector similarity search on embedded documents
- `researcher`: Queries Tavily for additional web context
- `synthesizer`: Generates the response via Claude (with adaptive formatting based on query intent)
- `citationBuilder`: Extracts and formats source citations
- `disclaimerGuard`: Adds disclaimers for sensitive topics
- `escalate`: Routes urgent matters (abuse reports, imminent deadlines) to appropriate authorities

Agent tools are in `packages/core/src/tools/`.

## Ingestion Pipeline

Fan-out architecture via SQS FIFO queue (production only):

- **Source configs**: Stored in DynamoDB (`SourceConfigs` table) in production, loaded from `data/sources/*.json` in development. Entity class in `packages/ingestion/src/entities/SourceConfigEntity.ts`.
- **Cron** (`packages/ingestion/src/cron.ts`): Weekly EventBridge trigger. Loads source configs, fetches content with retry logic (`fetchWithRetry`), computes SHA-256 hash, skips unchanged sources, enqueues changed ones to SQS. Tracks success/failure in DynamoDB.
- **Worker** (`packages/ingestion/src/worker.ts`): Processes one source per SQS message. Pipeline: load (PDF/HTML/text) → clean → split → enrich metadata → extract sections → batch embed (OpenAI) → store in pgvector. Handles `QuotaExhaustedError` by purging the queue.
- **Document storage**: Fetched documents cached in S3 (`DocumentsBucket`) for resilience and audit trail.

## Infrastructure (SST)

Defined in `sst.config.ts`. Production uses Aurora Serverless v2 with pgvector; dev stages use local Docker Postgres at `postgresql://postgres:postgres@localhost:5432/usopc_athlete_support`.

| Component | Development                         | Production               |
| --------- | ----------------------------------- | ------------------------ |
| Database  | Local Docker Postgres with pgvector | Aurora Serverless v2     |
| API       | Local Lambda emulation via SST      | API Gateway + Lambda     |
| Web       | Next.js dev server                  | CloudFront + Lambda@Edge |
| Secrets   | SST dev secrets                     | SST encrypted secrets    |

**SST Resources:**

- **Secrets**: `AnthropicApiKey`, `OpenaiApiKey`, `TavilyApiKey`, `LangchainApiKey`, `SlackBotToken`, `SlackSigningSecret`
- **DynamoDB**: `SourceConfigs` table (source config management with GSIs for ngbId and enabled status)
- **S3**: `DocumentsBucket` (cached documents with versioning)
- **APIs**: `Api` (main tRPC), `SlackApi` (Slack events)

Use `pnpm dev` (which runs `sst dev`) for local development to inject secrets. For scripts needing SST resources, use `sst shell -- <command>` or the wrapped npm scripts.
