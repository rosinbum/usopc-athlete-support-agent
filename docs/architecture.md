# Architecture

USOPC Athlete Support Agent is a serverless monorepo deployed to AWS via [SST v3](https://sst.dev/).

## Package Structure

```
packages/
  core/        @usopc/core       — LangGraph agent, RAG, vector store, tools
  evals/       @usopc/evals      — LangSmith evaluations, quality review pipeline
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

### Intelligent Source Discovery

Automated discovery pipeline to find new governance documents across NGB websites:

**Discovery Pipeline** (`packages/ingestion/src/discoveryOrchestrator.ts`):

1. **Discovery**: Find URLs via Tavily Map (site crawl) or Search (targeted queries)
2. **Metadata Evaluation**: Fast LLM pre-filter based on URL, title, and domain (with context hints)
3. **Content Extraction**: Load web content for relevant URLs
4. **Content Evaluation**: Deep LLM analysis of extracted content (with context hints)
5. **Storage**: Save to DynamoDB with evaluation results and auto-approval status

**Context Hints** (`packages/ingestion/src/services/contextHints.ts`):

- NGB-specific hints for 5 major NGBs (USA Swimming, USA Track & Field, USA Gymnastics, USA Basketball, USA Hockey)
- Each NGB has URL patterns, document types, topic domains, and keywords
- Topic keyword mappings for all 7 topic domains (team_selection, dispute_resolution, safesport, anti_doping, eligibility, governance, athlete_rights)
- Context hints injected into LLM evaluation prompts to improve accuracy

**Orchestration Features**:

- Configurable concurrency (default: 3 URLs at a time)
- Progress tracking with real-time stats (discovered/evaluated/approved/rejected/skipped/errors)
- Error recovery: individual URL failures don't stop the pipeline
- Dry run mode for testing without DB writes
- Progress callbacks for live updates

**Discovery CLI** (`packages/ingestion/src/scripts/discoveryCli.ts`):

- `--dry-run`: Preview without saving to DynamoDB
- `--domain <domain>`: Discover from specific domain only
- `--query <query>`: Discover from specific search query only
- `--concurrency <n>`: Control parallel processing
- `--json`: Output results as JSON for scripting
- Real-time progress display and comprehensive summary

Configuration in `data/discovery-config.json` defines domains, search queries, and auto-approval threshold.

**Automated Discovery & Scheduling** (Production Only):

The discovery pipeline runs automatically via EventBridge cron:

- **Discovery Lambda** (`packages/ingestion/src/functions/discovery.ts`): Scheduled EventBridge handler that runs every Monday at 2 AM UTC
  - Loads discovery config from `data/discovery-config.json`
  - Checks budget status before running (Tavily and Anthropic)
  - Creates DiscoveryOrchestrator and runs discovery from configured domains and search queries
  - Tracks API usage costs via CostTracker service
  - Sends notifications via NotificationService (CloudWatch, Slack, SES)
  - Includes error handling with proper notifications

- **Cost Tracking** (`packages/ingestion/src/services/costTracker.ts`): Tracks API usage and enforces budgets
  - Tracks Tavily API usage (calls and estimated credits: 1 per search, 5 per map)
  - Tracks Anthropic API usage (calls, tokens, estimated cost based on Claude Sonnet 4 pricing)
  - Stores daily/weekly/monthly metrics in DynamoDB (UsageMetric table)
  - Budget threshold checks with environment variables (`TAVILY_MONTHLY_BUDGET`, `ANTHROPIC_MONTHLY_BUDGET`)
  - Prevents budget overruns by halting execution when limits exceeded

- **Notifications** (`packages/ingestion/src/services/notificationService.ts`): Multi-channel notification system
  - CloudWatch Logs (always enabled)
  - Optional Slack webhook integration (if `SLACK_WEBHOOK_URL` set)
  - Optional SES email notifications (if `NOTIFICATION_EMAIL` set)
  - Sends discovery completion summaries with stats (discovered/approved/rejected, costs, duration, errors)
  - Sends budget alerts (warning at 80%, critical at 100%)
  - Sends error notifications for failed discovery runs

- **Ingestion Integration** (`packages/ingestion/src/cron.ts`): Auto-config creation for approved discoveries
  - `processApprovedDiscoveries()`: Fetches newly approved discoveries since last run
  - Automatically creates SourceConfig for each approved discovery
  - Links DiscoveredSource.sourceConfigId after creation
  - Integrated into weekly ingestion cron (runs before source loading)
  - Error handling ensures failures don't stop processing of other discoveries

**Workflow**:

1. Discovery Lambda runs Monday 2 AM UTC, discovers URLs, evaluates relevance, stores in DynamoDB
2. Ingestion Cron runs weekly (7 days later), auto-creates SourceConfigs for approved discoveries
3. New sources are ingested into knowledge base via standard ingestion pipeline

**Budget Safety**: Discovery halts if monthly budgets exceeded. Default budgets: 1000 Tavily credits, $10 Anthropic.

## Infrastructure (SST)

Defined in `sst.config.ts`. Production uses Aurora Serverless v2 with pgvector; dev stages use local Docker Postgres at `postgresql://postgres:postgres@localhost:5432/usopc_athlete_support`.

| Component | Development                         | Production               |
| --------- | ----------------------------------- | ------------------------ |
| Database  | Local Docker Postgres with pgvector | Aurora Serverless v2     |
| API       | Local Lambda emulation via SST      | API Gateway + Lambda     |
| Web       | Next.js dev server                  | CloudFront + Lambda@Edge |
| Secrets   | SST dev secrets                     | SST encrypted secrets    |

**SST Resources:**

- **Secrets**: `AnthropicApiKey`, `OpenaiApiKey`, `TavilyApiKey`, `LangchainApiKey`, `SlackBotToken`, `SlackSigningSecret`, `AuthSecret`, `GitHubClientId`, `GitHubClientSecret`, `AdminEmails`, `ConversationMaxTurns`
- **DynamoDB**: `AppTable` (single-table design for SourceConfigs, DiscoveredSources, UsageMetrics, and other entities with GSIs for querying by status, date, etc.)
- **S3**: `DocumentsBucket` (cached documents with versioning)
- **APIs**: `Api` (main tRPC), `SlackApi` (Slack events)
- **Crons**: `DiscoveryCron` (weekly discovery), `IngestionCron` (weekly ingestion)

Use `pnpm dev` (which runs `sst dev`) for local development to inject secrets. For scripts needing SST resources, use `sst shell -- <command>` or the wrapped npm scripts.

## Admin Data Fetching (SWR)

The admin pages in `apps/web/app/admin/` use [SWR](https://swr.vercel.app/) for data fetching and mutations. Custom hooks live in `apps/web/app/admin/hooks/`:

- **`fetcher.ts`** — shared `fetcher` (for `useSWR` reads) and `mutationFetcher` (for `useSWRMutation` writes). Both parse error bodies and throw `FetchError`.
- **`use-discoveries.ts`** — `useDiscoveries(status?)`, `useDiscovery(id)`, `useDiscoveryAction(id)`, `useBulkDiscoveryAction()`
- **`use-sources.ts`** — `useSources()`, `useSource(id)`, `useSourceAction(id)`, `useSourceDelete(id)`, `useSourceIngest(id)`, `useBulkSourceAction()`

**Pattern**: Read hooks return `{ data, isLoading, error, mutate }`. Mutation hooks return `{ trigger, isMutating, error }` with `revalidate: false` (callers explicitly `mutate()` after mutations). Detail panels call their own `mutate()` then the parent's `onMutate` prop to refresh both caches.
