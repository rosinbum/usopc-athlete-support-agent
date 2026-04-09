# GCP Migration Assessment

This document assesses what it would take to move the USOPC Athlete Support Agent from AWS (SST v3) to Google Cloud Platform. The primary motivations are:

1. **Cold start latency** — Lambda cold starts degrade the AI chat streaming experience (~1.5–2.2s overhead on first request after idle)
2. **Container-based deployment** — Consistent response times with always-warm containers vs. serverless
3. **Client requirement** — A potential client operates on GCP, not AWS

## Current AWS Infrastructure Summary

| Component         | AWS Service                           | Config                                                |
| ----------------- | ------------------------------------- | ----------------------------------------------------- |
| IaC               | SST v3 (Pulumi under the hood)        | TypeScript, 14 secrets, ~780 lines                    |
| Web app           | Lambda (Next.js via OpenNext)         | 1024 MB, 60s timeout                                  |
| Slack bot         | Lambda + API Gateway v2               | 512 MB, 120s timeout                                  |
| Ingestion workers | Lambda (SQS-triggered)                | 512–1024 MB, 10–15 min timeout                        |
| Cron jobs         | Lambda + EventBridge                  | 3 scheduled functions (discovery, ingestion, cleanup) |
| NoSQL             | DynamoDB (3 tables, OneTable pattern) | AppTable, AuthTable + S3 DocumentsBucket              |
| SQL + vectors     | PostgreSQL + pgvector (Neon)          | 1536-dim embeddings, HNSW + BM25                      |
| Queues            | SQS FIFO (2 queues + 2 DLQs)          | Content-based dedup, 1 msg batch                      |
| Object storage    | S3 (versioned)                        | Content-addressed document archive                    |
| CDN               | CloudFront (via SST Nextjs)           | Custom domains per stage                              |
| Secrets           | SST secrets (14 total)                | PascalCase naming convention                          |
| Auth              | NextAuth v5 + DynamoDB adapter        | GitHub OAuth + email magic-link                       |
| Monitoring        | CloudWatch (11 alarms, 1 dashboard)   | SNS email notifications                               |
| Email             | SES                                   | Discovery notifications                               |
| CI/CD             | GitHub Actions + AWS OIDC             | Tag-triggered deploy, staging → prod                  |

### Lambda Functions (8 total)

| Function              | Memory  | Timeout | Trigger                |
| --------------------- | ------- | ------- | ---------------------- |
| Web (Next.js)         | 1024 MB | 60s     | HTTP                   |
| Slack bot             | 512 MB  | 120s    | API Gateway            |
| Discovery feed worker | 512 MB  | 10 min  | SQS                    |
| Ingestion worker      | 1024 MB | 15 min  | SQS                    |
| Discovery cron        | 1024 MB | 15 min  | EventBridge (Mon 2 AM) |
| Ingestion cron        | 512 MB  | 5 min   | EventBridge (weekly)   |
| Checkpoint cleanup    | 256 MB  | 2 min   | EventBridge (daily)    |

### Cold Start Analysis

Estimated cold start timeline for the web Lambda (chat endpoint):

| Phase                          | Duration             |
| ------------------------------ | -------------------- |
| Module load + env var setup    | ~500–800 ms          |
| ChatAnthropic model init       | ~200–400 ms          |
| Vector store + embedding model | ~300–500 ms          |
| Checkpointer + DB pool         | ~100–200 ms          |
| Graph compilation              | ~50–100 ms           |
| **Total cold start overhead**  | **~1.2–2.2 seconds** |

This happens before any LLM API call. Combined with the first Anthropic API round-trip (~1–3s), users experience 2–5 seconds before the first token appears on a cold start. There is currently no provisioned concurrency or warm-up strategy.

Additionally, the web Lambda has a 60-second timeout but the LangGraph agent has a 90-second internal timeout — a race condition where the graph can outlive its container.

---

## Proposed GCP Architecture

### Service Mapping

| Current (AWS)                 | Proposed (GCP)                                  | Migration Effort                   |
| ----------------------------- | ----------------------------------------------- | ---------------------------------- |
| SST v3                        | **Pulumi (TypeScript)**                         | High — full IaC rewrite            |
| Lambda (Next.js via OpenNext) | **Cloud Run** (container)                       | Medium — Dockerfile + `next start` |
| Lambda (Slack bot)            | **Cloud Run** (service)                         | Medium — containerize Hono app     |
| Lambda (SQS workers)          | **Cloud Run + Pub/Sub push**                    | Medium — HTTP handler refactor     |
| Lambda (crons)                | **Cloud Scheduler → Cloud Run**                 | Low — same logic, new trigger      |
| DynamoDB (OneTable)           | **Firestore**                                   | High — data model redesign         |
| PostgreSQL + pgvector (Neon)  | **Cloud SQL for PostgreSQL**                    | Low — connection string swap       |
| SQS FIFO                      | **Pub/Sub**                                     | Medium — push vs. poll model       |
| S3                            | **Cloud Storage**                               | Low — API swap                     |
| API Gateway v2                | **Cloud Load Balancer**                         | Low — Cloud Run has built-in HTTPS |
| CloudFront                    | **Cloud CDN** (on Load Balancer)                | Low — config-level change          |
| Secrets Manager / SST secrets | **Secret Manager**                              | Low — simpler and cheaper          |
| NextAuth DynamoDB adapter     | **NextAuth Firestore adapter**                  | Medium — adapter swap              |
| CloudWatch alarms + dashboard | **Cloud Monitoring + Alerting**                 | Medium — equivalent concepts       |
| SES                           | **SendGrid or Mailgun** (GCP has no native SES) | Low — API swap                     |
| EventBridge                   | **Cloud Scheduler**                             | Low — cron syntax identical        |
| SNS (alarm notifications)     | **Pub/Sub + Cloud Monitoring**                  | Low — built into alerting          |

### Architecture Diagram

```
                    ┌──────────────────────────────────┐
                    │   Cloud Load Balancer + CDN      │
                    │   (custom domains, TLS, caching) │
                    └───────────┬──────────────────────┘
                                │
                ┌───────────────┼───────────────────┐
                │               │                   │
        ┌───────▼──────┐ ┌─────▼──────┐   ┌────────▼────────┐
        │  Cloud Run   │ │ Cloud Run  │   │  Cloud Run      │
        │  (Web App)   │ │ (Slack)    │   │  (Workers)      │
        │  Next.js     │ │ Hono.js    │   │  Ingestion,     │
        │  container   │ │ container  │   │  Discovery feed │
        │  min-inst: 1 │ │            │   │                 │
        └──────┬───────┘ └─────┬──────┘   └────────┬────────┘
               │               │                    │
       ┌───────┴───────────────┴────────────────────┤
       │                                            │
 ┌─────▼──────────┐  ┌─────────────────┐  ┌────────▼────────┐
 │ Cloud SQL      │  │ Firestore       │  │ Pub/Sub         │
 │ PostgreSQL     │  │ (sessions,      │  │ (ingestion      │
 │ + pgvector     │  │  entities,      │  │  queue,         │
 │ (embeddings,   │  │  auth,          │  │  discovery      │
 │  checkpoints,  │  │  configs)       │  │  feed)          │
 │  conversations)│  │                 │  │                 │
 └────────────────┘  └─────────────────┘  └─────────────────┘
       │
 ┌─────▼──────────┐  ┌─────────────────┐  ┌─────────────────┐
 │ Cloud Storage  │  │ Secret Manager  │  │ Cloud Scheduler │
 │ (documents)    │  │ (API keys,      │  │ (discovery cron,│
 │                │  │  tokens)        │  │  ingestion cron,│
 └────────────────┘  └─────────────────┘  │  cleanup cron)  │
                                          └─────────────────┘
```

---

## Component Deep Dives

### 1. Cloud Run (replaces Lambda)

Cloud Run is the centerpiece of this migration and directly solves the cold start problem.

**Why Cloud Run over Lambda:**

| Factor                | Lambda                              | Cloud Run                                     |
| --------------------- | ----------------------------------- | --------------------------------------------- |
| Concurrency           | 1 request per instance              | Up to 80–1000 per instance                    |
| Cold start mitigation | Provisioned concurrency ($$$)       | Min instances (~$3/mo per idle instance)      |
| Request timeout       | 15 min hard cap                     | Up to 60 min (resets per chunk for streaming) |
| Deployment            | ZIP/container + OpenNext adapter    | Standard Docker container                     |
| Streaming             | Lambda response streaming (complex) | Native HTTP chunked encoding                  |
| GPU support           | None                                | NVIDIA L4 GPUs (scale to zero)                |

**Configuration for the chat service:**

```yaml
# Cloud Run service config
service: web
image: gcr.io/PROJECT/web:latest
cpu: 1
memory: 1Gi
min-instances: 1 # Eliminates cold starts
max-instances: 10 # Cost cap
concurrency: 80 # Multiplex I/O-bound chat requests
timeout: 300s # 5 min (chunks reset timer)
billing: instance-based # Pay for full lifecycle (better for steady traffic)
```

With `min-instances: 1`, the container stays warm. The model singletons, DB pool, and graph compilation persist across requests. Estimated idle cost: ~$3.24/month for memory-only charges on the warm instance.

**Next.js deployment simplification:**

On AWS, Next.js requires the OpenNext adapter to decompose the app into Lambda functions + CloudFront + S3. On Cloud Run, it's just:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @usopc/web build
EXPOSE 3000
CMD ["node", "apps/web/.next/standalone/server.js"]
```

No OpenNext. No Lambda@Edge. No CloudFront configuration. Just a container running `next start`.

**Billing modes:**

- **Request-based** (default): Pay only while handling requests. Idle min-instances charged memory-only. Best for bursty traffic.
- **Instance-based** ("CPU always allocated"): Pay for full instance lifecycle. Better for steady traffic, background work, and streaming connections.

For an AI chat app with streaming responses, instance-based billing is recommended.

### 2. Cloud SQL for PostgreSQL (replaces Neon/RDS)

This is the lowest-risk component of the migration. Cloud SQL is a managed PostgreSQL service with full pgvector support.

**What transfers directly:**

- All SQL schema and migrations (`scripts/migrations/`)
- pgvector extension (`CREATE EXTENSION vector`)
- HNSW indexes for cosine similarity search
- BM25 tsvector indexes for full-text search
- LangGraph checkpoint tables (`checkpoints`, `checkpoint_writes`, `checkpoint_blobs`)
- Connection pooling via `pg` library (same `packages/shared/src/pool.ts`)

**What changes:**

- Connection string (swap Neon URL for Cloud SQL URL)
- SSL configuration (Cloud SQL uses the Cloud SQL Auth Proxy or IAM-based auth instead of direct SSL)
- Consider using Cloud SQL Auth Proxy as a sidecar in Cloud Run for secure connections without managing SSL certs

**Cloud SQL Auth Proxy pattern for Cloud Run:**

```yaml
# Cloud Run supports multi-container (sidecar) deployments
containers:
  - name: web
    image: gcr.io/PROJECT/web:latest
    env:
      - name: DATABASE_URL
        value: postgresql://user:pass@localhost:5432/dbname
  - name: cloud-sql-proxy
    image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:latest
    args: ["PROJECT:REGION:INSTANCE"]
```

The proxy handles authentication, encryption, and connection management. The app connects to `localhost:5432` as if the database were local.

**Future upgrade path — AlloyDB:**

If vector search performance becomes a bottleneck at scale, Google's AlloyDB offers the ScaNN index (from Google Research):

- Up to 10x faster vector queries than pgvector HNSW
- 4x smaller memory footprint for vector indices
- Same pgvector SQL syntax — migration from Cloud SQL is a connection string change

Start with Cloud SQL. Upgrade to AlloyDB only if needed. The pgvector compatibility makes this a low-friction path.

### 3. Firestore (replaces DynamoDB)

This is the **highest-effort migration item**. DynamoDB and Firestore have fundamentally different data models.

**Current DynamoDB schema (OneTable / single-table design):**

```
AppTable:
  PK: Source#{id}     SK: SourceConfig      → Source configurations
  PK: Discovery#{id}  SK: DiscoveredSource   → Discovered documents
  PK: SportOrg#{id}   SK: Profile            → Sport organizations
  PK: Agent#{id}      SK: AgentModel         → Model config overrides
  PK: Ingestion#{id}  SK: IngestionLog       → Ingestion history
  PK: Prompt#{id}     SK: Prompt             → Prompt templates
  PK: Feedback#{id}   SK: Feedback           → User feedback
  PK: Usage#{date}    SK: {service}          → API usage tracking
  PK: DiscoveryRun#{runId} SK: DiscoveryRun  → Run history

AuthTable:
  PK/SK + GSI1PK/GSI1SK → NextAuth sessions, users, accounts, invites
```

**Proposed Firestore structure:**

```
sources/{id}              → Source configurations
discoveredSources/{id}    → Discovered documents
sportOrganizations/{id}   → Sport organizations
agentModels/{id}          → Model config overrides
ingestionLogs/{id}        → Ingestion history
prompts/{id}              → Prompt templates
feedback/{id}             → User feedback
usageMetrics/{date}/services/{service} → API usage tracking
discoveryRuns/{runId}     → Run history
```

**Migration steps:**

1. Replace `packages/shared/src/entities/` — rewrite all entity definitions from OneTable/Electrodb to Firestore document references
2. Replace `@aws-sdk/client-dynamodb` with `@google-cloud/firestore`
3. Rewrite all access patterns — Firestore uses collection queries with composite indexes instead of GSIs
4. Replace NextAuth DynamoDB adapter with [Firestore adapter](https://authjs.dev/getting-started/adapters/firebase)
5. Rewrite admin API routes in `apps/web/` that query DynamoDB directly

**Alternative — keep PostgreSQL for everything:**

Given the moderate data volumes (source configs, sessions, etc.), consider consolidating DynamoDB entities into PostgreSQL tables. This eliminates the Firestore migration entirely and reduces the number of databases to manage. The trade-off is losing Firestore's real-time listeners and automatic scaling, but for this workload, PostgreSQL is more than sufficient.

### 4. Pub/Sub (replaces SQS)

The main conceptual shift: SQS is pull-based (consumers poll), Pub/Sub is push-based (delivers to HTTP endpoints).

**Current SQS pattern:**

```
Producer → SQS FIFO queue → Lambda subscriber (batch size 1)
```

**Proposed Pub/Sub pattern:**

```
Producer → Pub/Sub topic → Push subscription → Cloud Run service (HTTP POST)
```

**What changes:**

- Replace `@aws-sdk/client-sqs` with `@google-cloud/pubsub`
- Worker Lambdas become Cloud Run services that accept HTTP POST requests
- FIFO ordering: Pub/Sub supports ordering keys (equivalent to FIFO message group IDs)
- DLQ: Pub/Sub has built-in dead-letter topics
- Content-based deduplication: Not built-in; implement at the application level or use Pub/Sub's message dedup window

**Worker refactoring example:**

```typescript
// Before (Lambda SQS handler)
export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    await processMessage(message);
  }
};

// After (Cloud Run HTTP handler)
app.post("/process", async (req, res) => {
  const message = req.body.message;
  const data = JSON.parse(Buffer.from(message.data, "base64").toString());
  await processMessage(data);
  res.status(200).send(); // ACK
});
```

### 5. Cloud Storage (replaces S3)

Near-identical capabilities. Migration is straightforward.

**What changes:**

- Replace `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` with `@google-cloud/storage`
- Signed URLs: `file.getSignedUrl()` instead of `getSignedUrl(s3Client, command)`
- Bucket naming: GCP bucket names are globally unique (same as S3)
- Versioning: Supported via `bucket.enableVersioning()`
- Storage classes: Standard, Nearline, Coldline, Archive (simpler than S3's 8 tiers)

**Lower egress costs** — GCP egress pricing is notably cheaper than AWS.

### 6. Infrastructure as Code — Pulumi

**SST v3 is not recommended for GCP.** SST's high-level constructs (`NextjsSite`, `Function`, `Queue`, `Cron`) are AWS-only. SST development has slowed significantly, with the core team focused on other projects. While SST v3 uses Pulumi under the hood, GCP resources would be raw Pulumi — you'd gain nothing over using Pulumi directly.

**Recommended: Pulumi with TypeScript.**

- Same language as the codebase — no HCL to learn
- SST v3 already uses Pulumi, so the patterns are familiar
- Full GCP provider with comprehensive Cloud Run, Cloud SQL, Pub/Sub, Firestore, Secret Manager support
- State management via Pulumi Cloud or self-managed backends (GCS bucket)
- Testing with standard TypeScript test frameworks

**Example Pulumi infrastructure:**

```typescript
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// Cloud Run service (replaces SST Nextjs + Lambda)
const webService = new gcp.cloudrunv2.Service("web", {
  location: "us-central1",
  template: {
    scaling: { minInstanceCount: 1, maxInstanceCount: 10 },
    containers: [
      {
        image: "gcr.io/PROJECT/web:latest",
        resources: { limits: { cpu: "1", memory: "1Gi" } },
        envs: secrets.map((s) => ({
          name: s.envName,
          valueSource: {
            secretKeyRef: { secret: s.secretId, version: "latest" },
          },
        })),
      },
    ],
  },
});

// Cloud SQL (replaces Neon/RDS)
const db = new gcp.sql.DatabaseInstance("postgres", {
  databaseVersion: "POSTGRES_15",
  settings: {
    tier: "db-custom-2-4096",
    databaseFlags: [{ name: "cloudsql.enable_pgvector", value: "on" }],
  },
});

// Pub/Sub (replaces SQS)
const ingestionTopic = new gcp.pubsub.Topic("ingestion");
const ingestionSub = new gcp.pubsub.Subscription("ingestion-push", {
  topic: ingestionTopic.name,
  pushConfig: {
    pushEndpoint: pulumi.interpolate`${workerService.uri}/process`,
  },
  deadLetterPolicy: { deadLetterTopic: dlqTopic.id, maxDeliveryAttempts: 3 },
});

// Cloud Scheduler (replaces EventBridge crons)
const discoveryCron = new gcp.cloudscheduler.Job("discovery", {
  schedule: "0 2 * * 1", // Mon 2 AM
  httpTarget: {
    uri: pulumi.interpolate`${discoveryService.uri}/run`,
    httpMethod: "POST",
    oidcToken: { serviceAccountEmail: sa.email },
  },
});
```

### 7. Authentication

NextAuth v5 works identically on GCP. The only change is the session storage adapter:

- **Current:** `@auth/dynamodb-adapter` → DynamoDB AuthTable
- **Proposed:** `@auth/firebase-adapter` → Firestore

Alternatively, if consolidating to PostgreSQL (see Firestore section), use `@auth/pg-adapter` to store sessions in Cloud SQL — eliminating the Firestore dependency for auth entirely.

GitHub OAuth and Resend email magic-link providers are cloud-agnostic and require no changes.

### 8. Monitoring and Alerting

| AWS                     | GCP Equivalent                                  |
| ----------------------- | ----------------------------------------------- |
| CloudWatch Metrics      | Cloud Monitoring (built-in for Cloud Run)       |
| CloudWatch Alarms       | Cloud Monitoring Alerting Policies              |
| CloudWatch Dashboard    | Cloud Monitoring Dashboards                     |
| SNS email notifications | Notification Channels (email, Slack, PagerDuty) |
| CloudWatch Logs         | Cloud Logging (auto-collected from Cloud Run)   |

Cloud Run automatically emits request count, latency, instance count, and CPU/memory utilization metrics. No custom metric instrumentation needed for the basics.

### 9. CI/CD

The GitHub Actions workflows (`.github/workflows/`) need updates:

- Replace AWS OIDC authentication with GCP Workload Identity Federation
- Replace `sst deploy` with `pulumi up` + `gcloud run deploy`
- Replace `aws` CLI calls with `gcloud` CLI
- Database migrations: same `node-pg-migrate` against Cloud SQL (via Auth Proxy or direct connection with IAM)
- Docker build + push to Artifact Registry (replaces no-build Lambda ZIPs)

```yaml
# GCP authentication in GitHub Actions
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: projects/PROJECT/locations/global/workloadIdentityPools/POOL/providers/PROVIDER
    service_account: deploy@PROJECT.iam.gserviceaccount.com

- uses: google-github-actions/setup-gcloud@v2
```

---

## Migration Plan

### Phase 0: Preparation (1–2 weeks)

- [ ] Set up GCP project, enable APIs (Cloud Run, Cloud SQL, Pub/Sub, Firestore, Secret Manager, Artifact Registry)
- [ ] Set up Workload Identity Federation for GitHub Actions
- [ ] Create Pulumi project with TypeScript, configure state backend
- [ ] Provision Cloud SQL PostgreSQL instance with pgvector
- [ ] Migrate database schema — run existing `node-pg-migrate` migrations against Cloud SQL
- [ ] Set up Secret Manager with all 14 secrets

### Phase 1: Web App on Cloud Run (1–2 weeks)

- [ ] Write Dockerfile for Next.js app (standalone output mode)
- [ ] Set up Cloud Run service with min-instances=1
- [ ] Configure Cloud SQL Auth Proxy sidecar
- [ ] Swap S3 calls in web app to Cloud Storage
- [ ] Swap DynamoDB calls in web app to Firestore (or PostgreSQL)
- [ ] Replace NextAuth DynamoDB adapter with Firestore/PG adapter
- [ ] Set up Cloud Load Balancer + Cloud CDN + custom domain
- [ ] Validate: chat streaming works end-to-end with warm containers

### Phase 2: Slack Bot + Workers (1–2 weeks)

- [ ] Containerize Slack bot (Hono.js)
- [ ] Deploy as Cloud Run service with custom domain
- [ ] Refactor SQS worker handlers to HTTP POST handlers
- [ ] Set up Pub/Sub topics, subscriptions, and dead-letter topics
- [ ] Deploy discovery feed worker and ingestion worker as Cloud Run services
- [ ] Set up Cloud Scheduler for the 3 cron jobs
- [ ] Replace SES with SendGrid/Mailgun for email notifications

### Phase 3: Monitoring + CI/CD (1 week)

- [ ] Set up Cloud Monitoring alerting policies (mirror the 11 CloudWatch alarms)
- [ ] Create Cloud Monitoring dashboard
- [ ] Update GitHub Actions: GCP auth, Docker build, Pulumi deploy
- [ ] Set up staging and production environments
- [ ] Smoke test full pipeline: chat, Slack, ingestion, discovery

### Phase 4: Data Migration + Cutover (1 week)

- [ ] Migrate DynamoDB data to Firestore (or PostgreSQL)
- [ ] Migrate S3 documents to Cloud Storage (`gsutil rsync`)
- [ ] DNS cutover for custom domains
- [ ] Decommission AWS resources

**Estimated total: 5–8 weeks** for a small team, depending on the Firestore vs. PostgreSQL consolidation decision.

---

## Key Decisions

### 1. Firestore vs. PostgreSQL consolidation

**Option A: Firestore** — Direct DynamoDB replacement. Keeps the NoSQL/SQL split. Adds Firestore as a dependency.

**Option B: Consolidate into PostgreSQL** — Move all DynamoDB entities into PostgreSQL tables. Fewer databases to manage. Simplifies the stack. PostgreSQL can handle the access patterns (source configs, sessions, feedback — all moderate scale).

**Recommendation: Option B (PostgreSQL consolidation).** The DynamoDB data is not high-throughput or latency-sensitive enough to justify a separate NoSQL database. Consolidating reduces operational complexity and eliminates the Firestore migration effort. The main trade-off is losing Firestore's real-time listeners, which the app does not currently use.

### 2. Cloud Run vs. GKE

**Cloud Run** — Fully managed, simpler, auto-scales including to zero, lower operational overhead.

**GKE** — Full Kubernetes, more control, better for complex multi-service deployments or self-hosted models.

**Recommendation: Cloud Run.** The AI agent calls external LLM APIs (Anthropic, OpenAI) — it does not host models locally. The workload is I/O-bound. GKE's complexity is not justified unless you later need to self-host models.

### 3. Cloud SQL vs. AlloyDB

**Cloud SQL** — Standard managed PostgreSQL. Full pgvector support. Lower cost.

**AlloyDB** — Google's enhanced PostgreSQL with ScaNN index (up to 10x faster vector queries). 39% price premium.

**Recommendation: Start with Cloud SQL.** Upgrade to AlloyDB only if vector search becomes a bottleneck. The pgvector compatibility makes this a low-friction upgrade.

---

## Cost Comparison (Estimated)

| Component          | AWS (current estimate)               | GCP (projected)                                    | Notes                  |
| ------------------ | ------------------------------------ | -------------------------------------------------- | ---------------------- |
| Compute (web)      | Lambda: pay-per-invocation           | Cloud Run: ~$25–50/mo (1 min instance + usage)     | Eliminates cold starts |
| Compute (workers)  | Lambda: pay-per-invocation           | Cloud Run: ~$5–15/mo (scale to zero)               | Similar cost           |
| Database (SQL)     | Neon Pro: ~$19–69/mo                 | Cloud SQL: ~$30–80/mo                              | Comparable             |
| Database (NoSQL)   | DynamoDB: ~$5–15/mo                  | Firestore: ~$5–10/mo (or $0 if consolidated to PG) | Similar or free        |
| Queues             | SQS: ~$1–5/mo                        | Pub/Sub: ~$1–5/mo                                  | Comparable             |
| Storage            | S3: ~$2–5/mo                         | Cloud Storage: ~$2–5/mo                            | Comparable             |
| Secrets            | Secrets Manager: ~$6/mo (14 secrets) | Secret Manager: ~$1/mo (14 secrets)                | GCP is cheaper         |
| CDN                | CloudFront: ~$1–5/mo                 | Cloud CDN: ~$1–5/mo                                | Comparable             |
| **Total estimate** | **~$60–170/mo**                      | **~$70–170/mo**                                    | Similar range          |

The primary cost difference is Cloud Run's min-instance charge (~$3–5/mo per warm instance) in exchange for eliminating cold starts entirely.

---

## Risks and Mitigations

| Risk                                     | Impact                                                    | Mitigation                                                                   |
| ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| DynamoDB → Firestore data model redesign | High effort, potential bugs                               | Consolidate to PostgreSQL instead                                            |
| SST → Pulumi IaC rewrite                 | High effort, no SST abstractions                          | Pulumi TypeScript preserves language; extract patterns from SST config       |
| LangGraph managed deployment             | LangGraph Cloud "Bring Your Own Cloud" currently AWS-only | Self-host on Cloud Run (already the plan)                                    |
| Pub/Sub lacks native FIFO dedup          | Potential duplicate processing                            | Implement idempotency at application level (already have content-hash dedup) |
| Cloud CDN lacks WebSocket support        | Chat streaming may need workaround                        | Use Server-Sent Events (already used) or put Cloudflare in front             |
| No native SES equivalent                 | Email notifications need new provider                     | Use SendGrid/Mailgun (simple API swap)                                       |

---

## What Does NOT Change

These components are cloud-agnostic and require no migration work:

- **LangGraph agent** (`packages/core/src/agent/`) — graph topology, nodes, edges, state
- **LLM providers** — Anthropic (Claude), OpenAI (embeddings) — API calls are cloud-agnostic
- **Tavily web search** — external API, no AWS dependency
- **LangSmith tracing and evaluations** — external service
- **pgvector schema and queries** — PostgreSQL is PostgreSQL
- **Next.js UI components** — React/Next.js is cloud-agnostic
- **Vitest tests** — no cloud dependency in test suite
- **Prettier/TypeScript config** — tooling is local
