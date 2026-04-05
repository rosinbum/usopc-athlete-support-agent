# AWS Container Strategy: Lambda to ECS Fargate

This document outlines a strategy for moving latency-sensitive workloads from AWS Lambda to ECS Fargate containers while staying on AWS. The goal is to eliminate cold start latency for the AI chat streaming endpoint without rearchitecting the entire stack.

## Motivation

1. **Cold start latency** — Lambda cold starts add ~1.5–2.2 seconds before the first LLM API call. Combined with the first Anthropic round-trip (~1–3s), users wait 2–5 seconds for the first token on a cold start.
2. **Timeout mismatch** — The web Lambda has a 60-second timeout, but the LangGraph agent has a 90-second internal timeout (`packages/core/src/config/settings.ts:20`), creating a race condition.
3. **No warm-up strategy** — There is currently no provisioned concurrency, no health-check ping, and no warm-up mechanism. Model singletons, DB pools, and graph compilation are all re-initialized on every cold start.
4. **Streaming limitations** — The chat endpoint uses HTTP chunked encoding via Next.js, not Lambda Response Streaming. A long-running container with native HTTP is simpler and more reliable.

### Cold Start Breakdown (Web Lambda)

| Phase | Duration |
|---|---|
| Module load + env var setup | ~500–800 ms |
| ChatAnthropic model init | ~200–400 ms |
| Vector store + embedding model | ~300–500 ms |
| Checkpointer + DB pool | ~100–200 ms |
| Graph compilation | ~50–100 ms |
| **Total cold start overhead** | **~1.2–2.2 seconds** |

With Fargate, these initializations happen once at container startup. All subsequent requests reuse the warm singletons — identical to how warm Lambda instances work, but guaranteed rather than opportunistic.

---

## Recommended Architecture: Hybrid Lambda + Fargate

The key insight: **only the chat endpoint needs always-warm containers.** Everything else (workers, crons) is event-driven and tolerant of cold starts. Lambda is ideal and cheapest for those workloads.

### What Moves to Fargate

| Component | Current | Proposed | Rationale |
|---|---|---|---|
| **Next.js web app** | Lambda via OpenNext (1024 MB, 60s) | **ECS Fargate** via `sst.aws.Service` | Eliminates cold starts for chat. Always-warm. No OpenNext adapter. |
| **Slack bot** | Lambda + API Gateway (512 MB, 120s) | **ECS Fargate** (same cluster) | Slack requires acknowledgment within 3s; cold starts eat most of that budget. |

### What Stays on Lambda

| Component | Current Config | Rationale |
|---|---|---|
| Discovery feed worker | Lambda via SQS (512 MB, 10 min) | Event-driven, bursty, cold-start tolerant |
| Ingestion worker | Lambda via SQS (1024 MB, 15 min) | Same — batch processing, no user-facing latency |
| Discovery cron | Lambda via EventBridge (Mon 2 AM) | Periodic, short-lived. Lambda is cheapest. |
| Ingestion cron | Lambda via EventBridge (weekly) | Same |
| Checkpoint cleanup | Lambda via EventBridge (daily, 2 min) | Trivial workload |

### Architecture Diagram

```
                   ┌───────────────────────────────────────┐
                   │  ALB (Application Load Balancer)      │
                   │  HTTPS termination, custom domains    │
                   │  Idle timeout: 300s (for SSE)         │
                   └────────┬──────────────┬───────────────┘
                            │              │
               Host routing │              │ Host routing
          athlete-agent.    │              │ slack.athlete-agent.
          rosinbum.org      │              │ rosinbum.org
                            │              │
                   ┌────────▼───┐   ┌──────▼───────┐
                   │ Cloud Run  │   │ Cloud Run    │
                   │ FARGATE    │   │ FARGATE      │
                   │ Web App    │   │ Slack Bot    │
                   │ (Next.js)  │   │ (Hono.js)   │
                   │ min: 2     │   │ min: 1       │
                   │ max: 10    │   │ max: 5       │
                   └─────┬──┬──┘   └──────┬───────┘
                         │  │              │
          ┌──────────────┘  └──────┬───────┘
          │                        │
   ┌──────▼──────────┐    ┌───────▼────────┐
   │ PostgreSQL      │    │ DynamoDB       │
   │ (Neon)          │    │ AppTable       │
   │ + pgvector      │    │ AuthTable      │
   └─────────────────┘    └────────────────┘

   ┌──────────────────────────────────────────────┐
   │  STAYS ON LAMBDA (unchanged)                 │
   │                                              │
   │  SQS ──► Discovery Feed Worker (Lambda)      │
   │  SQS ──► Ingestion Worker (Lambda)           │
   │  EventBridge ──► Discovery Cron (Lambda)     │
   │  EventBridge ──► Ingestion Cron (Lambda)     │
   │  EventBridge ──► Checkpoint Cleanup (Lambda) │
   └──────────────────────────────────────────────┘
```

---

## SST v3 Implementation

SST v3 has first-class ECS Fargate support via the `sst.aws.Service` component. The migration stays within the same `sst.config.ts` file — no new IaC tool required.

### Current Web App Config (Lambda)

```typescript
// sst.config.ts — CURRENT (lines 526-560)
const web = new sst.aws.Nextjs("Web", {
  path: "apps/web",
  server: {
    timeout: "60 seconds",
    memory: "1024 MB",
  },
  environment: {
    APP_URL: webDomain,
    EMAIL_FROM: `Athlete Support <noreply@${emailFromDomain}>`,
  },
  domain: {
    name: isProd ? domainZone : `${stage}.${domainZone}`,
    dns: sst.aws.dns(),
  },
  link: [
    ...linkables,
    conversationMaxTurns,
    authSecret,
    gitHubClientId,
    gitHubClientSecret,
    adminEmails,
    resendApiKey,
    appTable,
    authTable,
    documentsBucket,
    discoveryFeedQueue,
    discoveryFeedDlq,
    ...(ingestionQueue ? [ingestionQueue] : []),
    ...(ingestionDlq ? [ingestionDlq] : []),
  ],
});
```

### Proposed Web App Config (Fargate)

```typescript
// sst.config.ts — PROPOSED
const vpc = new sst.aws.Vpc("AppVpc", { nat: "managed" });
const cluster = new sst.aws.Cluster("AppCluster", { vpc });

const web = new sst.aws.Service("Web", {
  cluster,
  path: "apps/web",
  cpu: "1 vCPU",
  memory: "2 GB",
  scaling: {
    min: 2,      // Always-warm + HA across AZs
    max: 10,
    cpuUtilization: 70,
    memoryUtilization: 70,
  },
  loadBalancer: {
    ports: [
      { listen: "443/https", forward: "3000/http" },
    ],
    health: {
      path: "/api/health",
      interval: "30 seconds",
      healthyThreshold: 2,
      unhealthyThreshold: 3,
    },
    domain: {
      name: isProd ? domainZone : `${stage}.${domainZone}`,
      dns: sst.aws.dns(),
    },
  },
  environment: {
    APP_URL: webDomain,
    EMAIL_FROM: `Athlete Support <noreply@${emailFromDomain}>`,
  },
  link: [
    ...linkables,
    conversationMaxTurns,
    authSecret,
    gitHubClientId,
    gitHubClientSecret,
    adminEmails,
    resendApiKey,
    appTable,
    authTable,
    documentsBucket,
    discoveryFeedQueue,
    discoveryFeedDlq,
    ...(ingestionQueue ? [ingestionQueue] : []),
    ...(ingestionDlq ? [ingestionDlq] : []),
  ],
  dev: {
    command: "pnpm --filter @usopc/web dev",
  },
});
```

### Proposed Slack Bot Config (Fargate, same cluster)

```typescript
// Slack bot shares the ALB via host-header routing
const slack = new sst.aws.Service("Slack", {
  cluster,
  path: "apps/slack",
  cpu: "0.5 vCPU",
  memory: "1 GB",
  scaling: {
    min: 1,
    max: 5,
    cpuUtilization: 70,
  },
  loadBalancer: {
    ports: [
      { listen: "443/https", forward: "3000/http" },
    ],
    domain: {
      name: isProd
        ? `slack.${domainZone}`
        : `slack-${stage}.${domainZone}`,
      dns: sst.aws.dns(),
    },
  },
  link: [...linkables, slackBotToken, slackSigningSecret, appTable],
  dev: {
    command: "pnpm --filter @usopc/slack dev",
  },
});
```

### Key SST `sst.aws.Service` Features

- **Same `link` mechanism** — secrets and resources inject as environment variables, identical to Lambda
- **Auto-scaling** — built-in `scaling` prop with min/max tasks, CPU/memory utilization targets
- **Load balancer** — automatically creates ALB with HTTPS, custom domain, health checks
- **Fargate Spot** — `capacity` prop supports mixed on-demand + Spot strategies
- **Service discovery** — automatically creates Cloud Map hostname for intra-VPC access
- **Dev mode** — runs the local dev command during `sst dev` instead of deploying the container

---

## Application Changes Required

### 1. Dockerfile for Next.js Web App

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @usopc/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

**No OpenNext adapter needed.** The app runs as a standard Node.js server.

### 2. Dockerfile for Slack Bot

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY apps/slack/package.json apps/slack/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @usopc/slack build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 3. Health Check Endpoint

Add a health check route for the ALB:

```typescript
// apps/web/app/api/health/route.ts
export async function GET() {
  return Response.json({ status: "ok" }, { status: 200 });
}
```

### 4. Graceful Shutdown

Handle SIGTERM for clean container stops during deploys and scale-in:

```typescript
// apps/web/server.ts (or instrumentation.ts)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, draining connections...");
  // Next.js standalone server handles this automatically,
  // but add custom cleanup if needed (e.g., close DB pool)
  process.exit(0);
});
```

### 5. Remove Lambda Polyfills

The `pdfjsPolyfillBanner` in `sst.config.ts:190-199` stubs `DOMMatrix`, `Path2D`, and `ImageData` because Lambda doesn't have these browser globals. In a container, install proper native dependencies instead:

```dockerfile
# In the Dockerfile for any service that uses pdf-parse
RUN apk add --no-cache canvas
```

This only affects the ingestion worker — if it stays on Lambda, the polyfill stays too.

### 6. ALB Idle Timeout

For SSE chat streaming, the ALB idle timeout must exceed the longest expected streaming response. Set to 300 seconds (5 minutes):

```typescript
// In the Service definition, via transform
transform: {
  loadBalancer: (args) => {
    args.idleTimeout = 300;
  },
},
```

### 7. Monitoring Updates

Replace Lambda-specific CloudWatch metrics with ECS + ALB metrics:

| Current (Lambda) | New (ECS/ALB) |
|---|---|
| Lambda Invocations | ALB RequestCount |
| Lambda Errors | ALB HTTPCode_Target_5XX_Count |
| Lambda Duration p99 | ALB TargetResponseTime p99 |
| Lambda ConcurrentExecutions | ECS RunningTaskCount |
| — | ECS CPUUtilization |
| — | ECS MemoryUtilization |

The 5 Lambda-based alarms for web and Slack (`WebErrorsAlarm`, `WebDurationAlarm`, `SlackErrorsAlarm`, `SlackDurationAlarm`) get replaced with ALB target group alarms. The 6 worker/cron/DLQ/DynamoDB alarms remain unchanged.

---

## What Does NOT Change

These components are unaffected by the migration:

- **LangGraph agent** (`packages/core/src/agent/`) — identical code, same runtime
- **Database** — same Neon PostgreSQL, same connection pool (`packages/shared/src/pool.ts`)
- **DynamoDB** — same tables, same entities, same access patterns
- **SQS queues** — same queues, same workers (stay on Lambda)
- **S3** — same bucket, same document storage
- **EventBridge crons** — same schedules, same Lambda handlers
- **SST secrets** — same `link` mechanism works for both Lambda and Service
- **NextAuth** — works identically in a container
- **CI/CD** — same GitHub Actions + AWS OIDC (add Docker build step)
- **LLM providers** — Anthropic, OpenAI, Tavily are all cloud-agnostic
- **LangSmith tracing** — external service, no AWS dependency

---

## Auto-Scaling Strategy

### Recommended Configuration

**Primary metric: ALB Request Count per Target**
- Target: 50–100 concurrent requests per task
- Responds directly to user demand — scales before CPU saturates
- Best for I/O-bound chat workloads (waiting on LLM API responses)

**Secondary metric: CPU Utilization**
- Target: 70%
- Catches compute-heavy scenarios (embedding generation, long agent reasoning)

AWS applies whichever policy results in more capacity, giving both demand-based and resource-based scaling simultaneously.

### Tuning Parameters

| Parameter | Value | Rationale |
|---|---|---|
| Min tasks (web) | 2 | HA across AZs + zero cold starts |
| Max tasks (web) | 10 | Cost ceiling |
| Min tasks (Slack) | 1 | Lower traffic, still warm |
| Max tasks (Slack) | 5 | Cost ceiling |
| Scale-out cooldown | 60s | Allow new tasks to register with ALB |
| Scale-in cooldown | 300s | Prevent flapping |
| Health check grace period | 90s | Let containers finish startup |
| ALB idle timeout | 300s | Accommodate long SSE streams |

### Fargate Spot for Cost Optimization

Use a capacity provider strategy mixing on-demand and Spot:

```typescript
// In sst.aws.Service config
capacity: {
  base: 2,           // 2 on-demand tasks (guaranteed)
  spot: { weight: 1 }, // Burst with Spot (up to 70% discount)
},
```

- **Base tasks** (on-demand): guaranteed, never interrupted — handles baseline traffic
- **Burst tasks** (Spot): additional capacity at ~70% discount, 2-minute interruption warning
- If Spot is reclaimed, on-demand base keeps serving users

---

## Cost Comparison

### Current: All Lambda

| Component | Estimated Monthly Cost |
|---|---|
| Web Lambda (1024 MB, ~75K invocations) | ~$13 |
| Slack Lambda (512 MB, ~5K invocations) | ~$2 |
| Worker Lambdas (event-driven) | ~$5 |
| API Gateway | ~$3 |
| Total Lambda compute | **~$23/month** |

### Proposed: Hybrid Lambda + Fargate

| Component | Estimated Monthly Cost |
|---|---|
| Web Fargate (2 tasks, 1 vCPU / 2 GB, 24/7) | ~$72 |
| Slack Fargate (1 task, 0.5 vCPU / 1 GB, 24/7) | ~$18 |
| ALB (shared across both services) | ~$20 |
| Worker Lambdas (unchanged) | ~$5 |
| Total | **~$115/month** |

### With Savings Plans (1-year commitment)

| Component | Estimated Monthly Cost |
|---|---|
| Web Fargate (50% discount) | ~$36 |
| Slack Fargate (50% discount) | ~$9 |
| ALB | ~$20 |
| Worker Lambdas | ~$5 |
| Total | **~$70/month** |

### Cost Delta

- **On-demand**: ~$92/month more than all-Lambda
- **With Savings Plans**: ~$47/month more
- **With Savings Plans + Spot for burst**: even less

The premium buys zero cold starts on every chat session and every Slack command. For a production AI product, the user experience improvement easily justifies this.

---

## Migration Plan

### Phase 1: Infrastructure Setup (1–2 days)

- [ ] Add VPC and ECS Cluster to `sst.config.ts`
- [ ] Create Dockerfiles for web and Slack apps
- [ ] Add health check endpoint (`/api/health`)
- [ ] Configure `sst.aws.Service` for web app with ALB, domain, scaling
- [ ] Deploy to staging, verify containers start and health checks pass

### Phase 2: Validate Chat Streaming (1–2 days)

- [ ] Test chat endpoint on Fargate — verify SSE streaming works end-to-end
- [ ] Measure time-to-first-token (should be <1s on warm container vs. 2–5s with cold Lambda)
- [ ] Load test with concurrent chat sessions to validate auto-scaling
- [ ] Tune ALB idle timeout for long-running streams
- [ ] Verify graceful shutdown during rolling deploys

### Phase 3: Move Slack Bot (1 day)

- [ ] Create Dockerfile for Slack bot
- [ ] Configure `sst.aws.Service` for Slack with host-header routing
- [ ] Update Slack app URL to point to ALB domain
- [ ] Verify 3-second acknowledgment deadline is consistently met
- [ ] Remove old Slack Lambda + API Gateway config

### Phase 4: Monitoring + Cleanup (1 day)

- [ ] Replace Lambda-based CloudWatch alarms with ECS/ALB alarms
- [ ] Update CloudWatch dashboard with new metrics
- [ ] Remove `sst.aws.Nextjs` and `sst.aws.ApiGatewayV2` (Slack) from config
- [ ] Remove OpenNext-specific config from `next.config.ts`
- [ ] Remove `pdfjsPolyfillBanner` if no remaining Lambda uses pdf-parse
- [ ] Update CI/CD workflow to build + push Docker images to ECR

### Phase 5: Production Deploy (1 day)

- [ ] Deploy to production
- [ ] Monitor ALB metrics, ECS task health, error rates
- [ ] Verify DNS cutover for custom domains
- [ ] Confirm Savings Plans enrollment (if applicable)

**Estimated total: 5–7 days** of engineering work. The migration is lower-risk than a full cloud migration because all supporting services (DynamoDB, SQS, S3, PostgreSQL, secrets) remain unchanged.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Fargate task startup (~20–60s for new tasks) | Slow scale-out during traffic spikes | Keep min tasks >= 2; use predictive scaling for known patterns |
| ALB cost overhead (~$20/month) | Fixed cost even at zero traffic | Shared across web + Slack services; ECS Express Mode can share across up to 25 services |
| VPC NAT Gateway cost | ~$32/month for managed NAT | Use `nat: "managed"` with single AZ for staging; multi-AZ for production |
| Docker image size affecting startup | Larger images = slower new task launches | Multi-stage builds, Alpine base, `.dockerignore`. Use AWS Seekable OCI (SOCI) for lazy-loading. |
| Static asset serving from container | Slightly slower than CloudFront + S3 | Add CloudFront in front of ALB, or serve `/_next/static/*` from S3 |
| Rolling deploy drops connections | In-flight SSE streams interrupted | Configure deployment circuit breaker + min healthy percent; SIGTERM handler drains connections |

---

## Comparison with GCP Migration

For reference, see [GCP Migration Assessment](./gcp-migration.md). Key differences:

| Factor | AWS Container Strategy | GCP Migration |
|---|---|---|
| Scope | Move 2 workloads to Fargate | Full cloud migration |
| IaC change | Same SST v3 | New tool (Pulumi) |
| Database change | None | Connection string swap (Cloud SQL) |
| NoSQL change | None | DynamoDB → Firestore (or PG consolidation) |
| Queue change | None | SQS → Pub/Sub |
| Effort | 5–7 days | 5–8 weeks |
| Risk | Low — reversible, incremental | High — full rearchitecture |
| Cold start fix | Yes | Yes |
| Client on GCP | No | Yes |

**If the only goal is eliminating cold starts**, the AWS container strategy is dramatically simpler. If the GCP client requirement is firm, the GCP migration is necessary regardless.
