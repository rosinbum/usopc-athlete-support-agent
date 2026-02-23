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
START → classifier → (routeByDomain) ─→ clarify → END
                                      ├→ escalate ────────────────────────────┐
                                      └→ queryPlanner → retriever             │
                                                            │                 │
                                                      (needsMoreInfo)         │
                                                       ╱    │    ╲            │
                              emotionalSupport ← researcher │  retrievalExpander
                                     │                      │        │
                                     ↓                      │  (needsMoreInfo)
                                synthesizer ←───────────────┘   ╱         ╲
                                     │                  researcher   emotionalSupport
                               qualityChecker                           │
                                     │                            synthesizer ↑
                               (routeByQuality)
                                ╱           ╲
                         citationBuilder    retry → emotionalSupport → synthesizer
                                │
                         disclaimerGuard ←── escalate (via citationBuilder)
                                │
                               END
```

**Routing logic** (3 conditional edges):

```
START → classifier → (routeByDomain) → clarify | queryPlanner | escalate
  clarify → END
  queryPlanner → retriever
  retriever → (needsMoreInfo) → emotionalSupport→synthesizer | researcher | retrievalExpander
  retrievalExpander → (needsMoreInfo) → emotionalSupport→synthesizer | researcher
  researcher → emotionalSupport → synthesizer
  synthesizer → qualityChecker → (routeByQuality) → citationBuilder | retry(emotionalSupport→synthesizer)
  escalate → citationBuilder → disclaimerGuard → END
```

**Nodes** (12):

| Node                | Description                                                          | Model      |
| ------------------- | -------------------------------------------------------------------- | ---------- |
| `classifier`        | Analyzes query to determine domain, intent, emotional state          | Haiku      |
| `clarify`           | Returns a clarifying question when the query is ambiguous            | None       |
| `queryPlanner`      | Decomposes complex multi-domain queries into sub-queries             | Haiku      |
| `retriever`         | Performs pgvector similarity search on embedded documents            | Embeddings |
| `retrievalExpander` | Reformulates queries on low confidence, re-searches + merges results | Haiku      |
| `researcher`        | Queries Tavily for additional web context                            | None       |
| `emotionalSupport`  | Generates domain-aware, trauma-informed support guidance             | None       |
| `synthesizer`       | Generates the response via Claude with adaptive formatting           | Sonnet     |
| `qualityChecker`    | Scores answer quality (0–1), detects issues, triggers retry          | Haiku      |
| `citationBuilder`   | Extracts and formats source citations with deduplication             | None       |
| `disclaimerGuard`   | Adds domain-specific disclaimers (legal, SafeSport, anti-doping)     | None       |
| `escalate`          | Routes urgent matters (abuse, imminent deadlines) to contacts        | Sonnet     |

**Conditional edges**:

- **`routeByDomain`** (after classifier): `needsClarification` → clarify; `queryIntent === "escalation"` → escalate; default → queryPlanner
- **`needsMoreInfo`** (after retriever and retrievalExpander): confidence ≥ 0.75 → emotionalSupport → synthesizer; gray-zone (0.5–0.75) → researcher; low confidence + not expanded → retrievalExpander; low + already expanded → researcher
- **`routeByQuality`** (after qualityChecker): passed or max retries (1) exhausted → citationBuilder; failed → retry via emotionalSupport → synthesizer

Agent tools are in `packages/core/src/tools/`.

### Model Instance Management

`ChatAnthropic` instances are created once at startup and injected into graph nodes via factory closures — the same pattern as `createRetrieverNode(vectorStore)`.

**Two model roles:**

- `agentModel` (Sonnet) — synthesizer, escalate
- `classifierModel` (Haiku) — classifier, qualityChecker, queryPlanner, retrievalExpander, conversationMemory

**Shared factory:** `createAgentModels()` in `config/modelFactory.ts` constructs both instances from `getModelConfig()`. All entry points (`AgentRunner.create()`, `studio.ts`, evals) call this factory instead of constructing models directly.

**Node factory pattern:**

```typescript
// Each LLM-calling node is a factory: receives model, returns node function
export function createSynthesizerNode(model: ChatAnthropic) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    // model captured in closure — reused across all invocations
  };
}
```

**Lifecycle:** In Lambda, model instances live for the container's lifetime (cold start → warm reuse). Config changes (model name, temperature, maxTokens) take effect only on cold start. The `conversationMemory` service receives its model via `initConversationMemoryModel()` called from the entry point.

**Runtime model configuration:** Model names, temperature, and token limits are defined in `config/models.ts` (`MODEL_CONFIG`) with hardcoded defaults. In production, `getModelConfig()` reads overrides from DynamoDB (`AgentModelEntity`) with a 5-minute TTL cache. If DynamoDB is unavailable, the hardcoded defaults are used. Changes to DynamoDB config take effect on the next cold start (or after cache expiry within a warm container). There are no feature flags — all graph features (quality checker, retrieval expansion, query planning, emotional support) are always enabled.

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

Defined in `sst.config.ts`. Deployed stages (staging, production) use Neon Postgres with pgvector via the `DatabaseUrl` SST secret; dev stages use local Docker Postgres at `postgresql://postgres:postgres@localhost:5432/usopc_athlete_support`.

| Component | Development                         | Production                     |
| --------- | ----------------------------------- | ------------------------------ |
| Database  | Local Docker Postgres with pgvector | Neon Postgres (via SST Secret) |
| API       | Local Lambda emulation via SST      | API Gateway + Lambda           |
| Web       | Next.js dev server                  | CloudFront + Lambda@Edge       |
| Secrets   | SST dev secrets                     | SST encrypted secrets          |

**SST Resources:**

- **Secrets**: `AnthropicApiKey`, `OpenaiApiKey`, `TavilyApiKey`, `LangchainApiKey`, `SlackBotToken`, `SlackSigningSecret`, `AuthSecret`, `GitHubClientId`, `GitHubClientSecret`, `AdminEmails`, `ConversationMaxTurns`, `DatabaseUrl`
- **DynamoDB**: `AppTable` (single-table design for SourceConfigs, DiscoveredSources, UsageMetrics, and other entities with GSIs for querying by status, date, etc.)
- **S3**: `DocumentsBucket` (cached documents with versioning)
- **APIs**: `Api` (main tRPC), `SlackApi` (Slack events)
- **Crons**: `DiscoveryCron` (weekly discovery), `IngestionCron` (weekly ingestion)

Use `pnpm dev` (which runs `sst dev`) for local development to inject secrets. For scripts needing SST resources, use `sst shell -- <command>` or the wrapped npm scripts.

## Connection Pool

The database connection pool is a singleton in `packages/shared/src/pool.ts`. All packages import `getPool()` from `@usopc/shared` — there is no per-app pool.

**Singleton pattern:**

```typescript
// Lazy-initialized, one pool per Lambda container
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    const needsSsl =
      connectionString.includes("neon.tech") ||
      connectionString.includes("sslmode=require");
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}
```

**Configuration:**

| Setting                   | Value  | Purpose                                          |
| ------------------------- | ------ | ------------------------------------------------ |
| `max`                     | 5      | Max connections per Lambda instance              |
| `idleTimeoutMillis`       | 30,000 | Close idle connections after 30s                 |
| `connectionTimeoutMillis` | 5,000  | Fail if a connection can't be acquired within 5s |

**Connection string resolution** (`getDatabaseUrl()` in `packages/shared/src/env.ts`):

1. `DATABASE_URL` environment variable (highest priority)
2. SST Secret binding (`Resource.DatabaseUrl.value`)
3. Development fallback: `postgresql://postgres:postgres@localhost:5432/usopc_athlete_support`
4. Throws if none available

**Consumers:** The vector store (`PGVectorStore`), ingestion pipeline, API tRPC db client, and web admin API routes all call `getPool()` and share the same pool instance.

**Observability:** `getPoolStatus()` returns `{ totalConnections, idleConnections, waitingRequests }` (or `null` if the pool hasn't been created yet). Useful for health checks and debugging connection leaks.

**Lambda lifecycle:** The pool persists across warm invocations within the same Lambda container. `closePool()` drains connections and resets the singleton — used in tests and for graceful shutdown.

**Exhaustion behavior:** When all 5 connections are in use, `pg.Pool` queues additional requests internally. If a connection isn't released within `connectionTimeoutMillis` (5s), the queued request rejects with a timeout error.

| Environment | Database                            | Pool behavior                                            |
| ----------- | ----------------------------------- | -------------------------------------------------------- |
| Development | Local Docker Postgres with pgvector | Single pool, 5 connections to localhost                  |
| Production  | Neon Postgres (SSL)                 | 5 connections per Lambda instance, Neon built-in pooling |

## LangGraph State Management

The agent's shared state is defined by `AgentStateAnnotation` in `packages/core/src/agent/state.ts`. It extends LangGraph's built-in `MessagesAnnotation` and adds 26 domain-specific fields.

**Reducer strategy:** The `messages` field uses LangGraph's built-in add-messages reducer (appends new messages). All other fields use **last-write-wins** — when a node returns a partial update, the new value replaces the previous one entirely.

### State Fields by Function

| Group                      | Fields                                                                                                                                                   | Written by                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Routing/Classification** | `topicDomain`, `queryIntent`, `detectedNgbIds`, `emotionalState`, `hasTimeConstraint`, `needsClarification`, `clarificationQuestion`, `escalationReason` | `classifier`                                                    |
| **Retrieval/Knowledge**    | `retrievedDocuments`, `retrievalConfidence`, `webSearchResults`, `webSearchResultUrls`, `retrievalStatus`                                                | `retriever`, `retrievalExpander`, `researcher`                  |
| **Complex Query**          | `isComplexQuery`, `subQueries`                                                                                                                           | `queryPlanner`                                                  |
| **Quality Iteration**      | `qualityCheckResult`, `qualityRetryCount`, `expansionAttempted`, `reformulatedQueries`                                                                   | `qualityChecker`, `retrievalExpander`                           |
| **Emotional Support**      | `emotionalSupportContext`                                                                                                                                | `emotionalSupport`                                              |
| **Response/Safety**        | `answer`, `citations`, `disclaimerRequired`, `escalation`                                                                                                | `synthesizer`, `citationBuilder`, `disclaimerGuard`, `escalate` |
| **User Context**           | `conversationId`, `conversationSummary`, `userSport`                                                                                                     | Input via `buildInitialState()`                                 |

### Initial State

`AgentRunner.buildInitialState()` passes only four fields from the caller; everything else uses Annotation defaults (empty arrays, `undefined`, `false`, `0`, etc.):

```typescript
return {
  messages: input.messages,
  userSport: input.userSport,
  conversationId: input.conversationId,
  conversationSummary: input.conversationSummary,
};
```

### Adding a New State Field

> **Critical gotcha:** Adding a field to `AgentStateAnnotation` is a cross-package change. CI will fail if any state constructor is missing the new field. Update all of these:
>
> 1. `packages/core/src/agent/state.ts` — the Annotation definition
> 2. `packages/evals/src/helpers/stateFactory.ts` — `makeTestState()`
> 3. `packages/evals/src/helpers/pipeline.ts` and `multiTurnPipeline.ts` — state construction
> 4. All `packages/core/src/agent/nodes/*.test.ts` and `edges/*.test.ts` — test fixtures
>
> **Search strategy:** `grep -r "webSearchResults: \[\]" packages/` finds all state object literals that need updating.

## Admin Data Fetching (SWR)

The admin pages in `apps/web/app/admin/` use [SWR](https://swr.vercel.app/) for data fetching and mutations. Custom hooks live in `apps/web/app/admin/hooks/`:

- **`fetcher.ts`** — shared `fetcher` (for `useSWR` reads) and `mutationFetcher` (for `useSWRMutation` writes). Both parse error bodies and throw `FetchError`.
- **`use-discoveries.ts`** — `useDiscoveries(status?)`, `useDiscovery(id)`, `useDiscoveryAction(id)`, `useBulkDiscoveryAction()`
- **`use-sources.ts`** — `useSources()`, `useSource(id)`, `useSourceAction(id)`, `useSourceDelete(id)`, `useSourceIngest(id)`, `useBulkSourceAction()`

**Pattern**: Read hooks return `{ data, isLoading, error, mutate }`. Mutation hooks return `{ trigger, isMutating, error }` with `revalidate: false` (callers explicitly `mutate()` after mutations). Detail panels call their own `mutate()` then the parent's `onMutate` prop to refresh both caches.
