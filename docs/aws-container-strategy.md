# AWS Container Strategy: Lambda to Always-On Compute

This document outlines a strategy for moving latency-sensitive workloads from AWS Lambda to always-on compute while staying on AWS. The goal is to eliminate cold start latency for the AI chat streaming endpoint without rearchitecting the entire stack.

## Motivation

1. **Cold start latency** — Lambda cold starts add ~1.5–2.2 seconds before the first LLM API call. Combined with the first Anthropic round-trip (~1–3s), users wait 2–5 seconds for the first token on a cold start.
2. **Timeout mismatch** — The web Lambda has a 60-second timeout, but the LangGraph agent has a 90-second internal timeout (`packages/core/src/config/settings.ts:20`), creating a race condition.
3. **No warm-up strategy** — There is currently no provisioned concurrency, no health-check ping, and no warm-up mechanism. Model singletons, DB pools, and graph compilation are all re-initialized on every cold start.
4. **Streaming limitations** — The chat endpoint uses HTTP chunked encoding via Next.js, not Lambda Response Streaming. A long-running server with native HTTP is simpler and more reliable.

### Cold Start Breakdown (Web Lambda)

| Phase                          | Duration             |
| ------------------------------ | -------------------- |
| Module load + env var setup    | ~500–800 ms          |
| ChatAnthropic model init       | ~200–400 ms          |
| Vector store + embedding model | ~300–500 ms          |
| Checkpointer + DB pool         | ~100–200 ms          |
| Graph compilation              | ~50–100 ms           |
| **Total cold start overhead**  | **~1.2–2.2 seconds** |

With an always-on server, these initializations happen once at startup. All subsequent requests reuse the warm singletons — identical to how warm Lambda instances work, but guaranteed rather than opportunistic.

---

## Recommended Architecture: EC2 + Lambda Hybrid

The simplest solution: **run the web app and Slack bot on an EC2 instance. Keep everything else on Lambda.**

An EC2 instance running Node.js with PM2 solves the cold start problem completely, with minimal operational overhead and the lowest cost. No container orchestration, no Dockerfiles, no ALB required.

### What Moves to EC2

| Component           | Current                             | Proposed                | Rationale                                                          |
| ------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| **Next.js web app** | Lambda via OpenNext (1024 MB, 60s)  | **EC2** — Node.js + PM2 | Eliminates cold starts. Always-warm. No OpenNext adapter.          |
| **Slack bot**       | Lambda + API Gateway (512 MB, 120s) | **EC2** — same instance | Slack requires ack within 3s; cold starts eat most of that budget. |

### What Stays on Lambda

| Component             | Current Config                        | Rationale                                       |
| --------------------- | ------------------------------------- | ----------------------------------------------- |
| Discovery feed worker | Lambda via SQS (512 MB, 10 min)       | Event-driven, bursty, cold-start tolerant       |
| Ingestion worker      | Lambda via SQS (1024 MB, 15 min)      | Same — batch processing, no user-facing latency |
| Discovery cron        | Lambda via EventBridge (Mon 2 AM)     | Periodic, short-lived. Lambda is cheapest.      |
| Ingestion cron        | Lambda via EventBridge (weekly)       | Same                                            |
| Checkpoint cleanup    | Lambda via EventBridge (daily, 2 min) | Trivial workload                                |

### Architecture Diagram

```
                 ┌──────────────────────────────────┐
                 │  CloudFront                      │
                 │  HTTPS termination, caching      │
                 │  Custom domain                   │
                 └───────────────┬──────────────────┘
                                 │
                 ┌───────────────▼──────────────────┐
                 │  EC2 Instance (t3.small)         │
                 │  PM2 process manager             │
                 │                                  │
                 │  ┌────────────┐ ┌─────────────┐  │
                 │  │ Next.js    │ │ Slack Bot   │  │
                 │  │ :3000      │ │ :3001       │  │
                 │  └─────┬──────┘ └──────┬──────┘  │
                 │        │               │         │
                 └────────┼───────────────┼─────────┘
                          │               │
          ┌───────────────┴───────┬───────┘
          │                       │
   ┌──────▼──────────┐    ┌──────▼─────────┐
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

## EC2 Setup

### Instance Selection

| Instance     | vCPUs | Memory | Monthly Cost | Notes                                         |
| ------------ | ----- | ------ | ------------ | --------------------------------------------- |
| **t3.small** | 2     | 2 GB   | **~$15**     | **Selected — sufficient for current traffic** |
| t3.medium    | 2     | 4 GB   | ~$30         | Upgrade if memory pressure is observed        |
| t3.large     | 2     | 8 GB   | ~$60         | For significantly higher traffic              |

The `t3.small` is sufficient for current traffic levels. The LangGraph agent is I/O-bound (waiting on Anthropic API), so CPU is rarely the bottleneck. 2 GB of memory is enough for the Next.js standalone server (~800 MB limit), Slack bot (~400 MB limit), Nginx, and OS overhead. PM2 `max_memory_restart` thresholds prevent OOM.

**With a 1-year Reserved Instance**, `t3.small` drops to ~$10/month (33% savings). Upgrade to `t3.medium` is a one-click instance type change if memory pressure is observed.

### Process Management with PM2

PM2 keeps the Node.js processes running, restarts on crash, and manages logs.

```javascript
// ecosystem.config.cjs (repo root)
module.exports = {
  apps: [
    {
      name: "web",
      script: "apps/web/.next/standalone/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      max_memory_restart: "800M",
    },
    {
      name: "slack",
      script: "apps/slack/dist/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      instances: 1,
      max_memory_restart: "400M",
    },
  ],
};
```

```bash
# Start both processes
pm2 start ecosystem.config.cjs

# Enable startup script (survives reboot)
pm2 startup systemd
pm2 save
```

### Nginx Reverse Proxy

Nginx handles HTTPS termination, routing, and static asset caching on the instance:

```nginx
# /etc/nginx/sites-available/athlete-agent
server {
    listen 80;
    server_name athlete-agent.rosinbum.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name athlete-agent.rosinbum.org;

    ssl_certificate /etc/letsencrypt/live/athlete-agent.rosinbum.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/athlete-agent.rosinbum.org/privkey.pem;

    # SSE streaming — disable buffering
    proxy_buffering off;
    proxy_cache off;

    # Next.js static assets — long cache
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Chat API — extended timeout for streaming
    location /api/chat {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 300s;  # 5 min for long streams
    }

    # All other Next.js routes
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name slack.athlete-agent.rosinbum.org;

    ssl_certificate /etc/letsencrypt/live/slack.athlete-agent.rosinbum.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/slack.athlete-agent.rosinbum.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Alternatively, keep **CloudFront in front** and point the origin to the EC2 instance's public IP or Elastic IP. This preserves the existing CDN setup and avoids managing TLS certificates on the instance (CloudFront handles termination).

### Environment Variables

Secrets currently injected by SST `link` need to be loaded on the EC2 instance. Options:

1. **AWS Systems Manager Parameter Store** — store secrets as SecureString parameters, load at startup via a shell script or `dotenv`-style loader. Free for standard parameters.
2. **AWS Secrets Manager** — same approach, $0.40/secret/month.
3. **SST `sst shell`** — run `sst shell -- pm2 start ecosystem.config.cjs` to inject linked secrets as environment variables. Works if SST is installed on the instance.
4. **`.env` file** — simplest, but requires secure handling (restricted permissions, not in git).

Recommended: **Parameter Store** for production, **`.env` file** for staging/dev.

### Deployment

Simple deployment via SSH + git pull + rebuild:

```bash
#!/bin/bash
# deploy.sh — run from CI or manually
set -e

INSTANCE="ec2-user@<instance-ip>"
APP_DIR="/home/ec2-user/app"

ssh $INSTANCE "
  cd $APP_DIR
  git pull origin main
  pnpm install --frozen-lockfile
  pnpm --filter @usopc/web build
  pnpm --filter @usopc/slack build
  pm2 restart all
"
```

For GitHub Actions, use the `appleboy/ssh-action` action or AWS CodeDeploy for more structured rollouts.

### Health Monitoring

```bash
# PM2 built-in monitoring
pm2 monit

# Simple health check (add to cron or use Route 53 health checks)
curl -sf http://localhost:3000/api/health || pm2 restart web
```

For production alerting, use **CloudWatch Agent** on the instance to push CPU, memory, and disk metrics, plus a **Route 53 health check** on the public URL to detect outages and trigger SNS notifications.

---

## What Does NOT Change

These components are unaffected by the migration:

- **LangGraph agent** (`packages/core/src/agent/`) — identical code, same runtime
- **Database** — same Neon PostgreSQL, same connection pool (`packages/shared/src/pool.ts`)
- **DynamoDB** — same tables, same entities, same access patterns
- **SQS queues** — same queues, same workers (stay on Lambda)
- **S3** — same bucket, same document storage
- **EventBridge crons** — same schedules, same Lambda handlers
- **NextAuth** — works identically on a server
- **LLM providers** — Anthropic, OpenAI, Tavily are all cloud-agnostic
- **LangSmith tracing** — external service, no AWS dependency

---

## Cost Comparison

### Current: All Lambda

| Component                              | Estimated Monthly Cost |
| -------------------------------------- | ---------------------- |
| Web Lambda (1024 MB, ~75K invocations) | ~$13                   |
| Slack Lambda (512 MB, ~5K invocations) | ~$2                    |
| Worker Lambdas (event-driven)          | ~$5                    |
| API Gateway                            | ~$3                    |
| **Total Lambda compute**               | **~$23/month**         |

### Proposed: EC2 + Lambda Hybrid

| Component                  | Estimated Monthly Cost |
| -------------------------- | ---------------------- |
| EC2 t3.small (on-demand)   | ~$15                   |
| Elastic IP                 | ~$4                    |
| Worker Lambdas (unchanged) | ~$5                    |
| **Total**                  | **~$24/month**         |

### With Reserved Instance (1-year)

| Component               | Estimated Monthly Cost |
| ----------------------- | ---------------------- |
| EC2 t3.small (reserved) | ~$10                   |
| Elastic IP              | ~$4                    |
| Worker Lambdas          | ~$5                    |
| **Total**               | **~$19/month**         |

### Cost Delta

- **On-demand**: ~$1/month more than all-Lambda (essentially cost-neutral)
- **Reserved**: ~$4/month less than all-Lambda

Compare this to the Fargate approach (~$115/month) or Fargate with Savings Plans (~$70/month). EC2 is dramatically cheaper because there's no ALB ($20/month), no NAT Gateway ($32/month), and no container orchestration overhead.

---

## Migration Plan

### Phase 1: Provision and Configure EC2 (1 day)

- [ ] Launch t3.small in us-east-1, Amazon Linux 2023 or Ubuntu 24.04
- [ ] Assign Elastic IP
- [ ] Configure security group: 80, 443 inbound; outbound to Neon PostgreSQL, DynamoDB, SQS, external APIs
- [ ] Install Node.js 20, pnpm, PM2, Nginx
- [ ] Set up Let's Encrypt (certbot) or configure CloudFront origin
- [ ] Clone repo, `pnpm install`, build both apps
- [ ] Configure PM2 ecosystem file, enable startup
- [ ] Configure Nginx reverse proxy with SSE-friendly settings
- [ ] Load secrets (Parameter Store, `.env`, or `sst shell`)

### Phase 2: Validate Chat Streaming (1 day)

- [ ] Point a test subdomain at the EC2 instance
- [ ] Test chat endpoint — verify SSE streaming works end-to-end
- [ ] Measure time-to-first-token (should be <1s vs. 2–5s with cold Lambda)
- [ ] Test Slack bot on the same instance
- [ ] Verify PM2 restarts on process crash
- [ ] Test deploy script (git pull + rebuild + pm2 restart)

### Phase 3: DNS Cutover + Monitoring (1 day)

- [ ] Update DNS for `athlete-agent.rosinbum.org` to EC2 (or CloudFront → EC2)
- [ ] Update Slack app URL to point to new Slack endpoint
- [ ] Set up CloudWatch Agent for instance metrics
- [ ] Set up Route 53 health check + SNS alarm
- [ ] Remove `sst.aws.Nextjs` and `sst.aws.ApiGatewayV2` (Slack) from SST config
- [ ] Keep old Lambda config commented out for easy rollback

**Estimated total: 2–3 days.** The simplest migration path of all options.

---

## Risks and Mitigations

| Risk                                 | Impact                         | Mitigation                                                                                                                                          |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single point of failure (1 instance) | Downtime if instance dies      | Route 53 health check auto-alerts. For HA, add a second instance behind an ALB (see Fargate upgrade path).                                          |
| OS patching                          | Security exposure if neglected | Enable automatic security updates (`unattended-upgrades` on Ubuntu, `dnf-automatic` on AL2023). Schedule monthly reboots during low-traffic window. |
| No auto-scaling                      | Can't handle traffic spikes    | For current traffic levels, a t3.medium handles it. If traffic grows significantly, upgrade to Fargate (see below).                                 |
| Manual deploys                       | Slower release cycle           | Automate with GitHub Actions SSH deploy. Or use CodeDeploy for blue/green.                                                                          |
| Instance storage is ephemeral        | App data lost on termination   | All persistent data is in Neon PostgreSQL, DynamoDB, and S3 — nothing stored locally. App code is in git.                                           |

---

## Upgrade Path: EC2 → ECS Fargate

If traffic grows to the point where a single EC2 instance isn't enough, the upgrade path to ECS Fargate is straightforward:

1. **Add a Dockerfile** — wrap the same Node.js app in a container
2. **Replace EC2 with `sst.aws.Service`** — SST v3 has first-class Fargate support
3. **Add an ALB** — auto-configured by SST's Service component
4. **Enable auto-scaling** — min 2 tasks (HA), max 10, scale on request count or CPU

SST v3's `sst.aws.Service` component handles VPC, ECS cluster, ALB, ECR, health checks, custom domains, and auto-scaling in a single construct:

```typescript
const vpc = new sst.aws.Vpc("AppVpc", { nat: "managed" });
const cluster = new sst.aws.Cluster("AppCluster", { vpc });

const web = new sst.aws.Service("Web", {
  cluster,
  path: "apps/web",
  cpu: "1 vCPU",
  memory: "2 GB",
  scaling: { min: 2, max: 10, cpuUtilization: 70 },
  loadBalancer: {
    ports: [{ listen: "443/https", forward: "3000/http" }],
    health: { path: "/api/health", interval: "30 seconds" },
    domain: {
      name: "athlete-agent.rosinbum.org",
      dns: sst.aws.dns(),
    },
  },
  link: [...linkables, ...secrets],
});
```

**Estimated Fargate cost**: ~$115/month on-demand, ~$70/month with Savings Plans (vs. ~$30–39/month for EC2). The trade-off is auto-scaling and HA in exchange for higher cost and complexity.

Move to Fargate when:

- Traffic exceeds what a single instance handles comfortably
- You need zero-downtime deploys (rolling updates across multiple tasks)
- You need auto-scaling for traffic spikes
- You want to eliminate OS management entirely

---

## Comparison of All Options

| Factor                 | Lambda (current)          | EC2 (recommended)                 | ECS Fargate                 | GCP Cloud Run              |
| ---------------------- | ------------------------- | --------------------------------- | --------------------------- | -------------------------- |
| Cold starts            | 1.5–2.2s                  | None                              | None                        | None                       |
| Monthly cost           | ~$23                      | ~$19–24                           | ~$70–115                    | ~$70–170                   |
| Operational complexity | Lowest                    | Low                               | Medium                      | Medium + cloud migration   |
| Auto-scaling           | Automatic                 | Manual (resize instance)          | Automatic                   | Automatic                  |
| HA / redundancy        | Automatic                 | Single instance (manual HA)       | Multi-AZ automatic          | Multi-zone automatic       |
| Deploy complexity      | `sst deploy`              | SSH + git pull + pm2 restart      | `sst deploy` (Docker build) | `pulumi up` (Docker build) |
| Migration effort       | —                         | 2–3 days                          | 5–7 days                    | 5–8 weeks                  |
| IaC change             | —                         | Minimal (remove Nextjs construct) | Same SST                    | New tool (Pulumi)          |
| Streaming support      | Lambda Response Streaming | Native HTTP                       | Native HTTP via ALB         | Native HTTP                |

**Recommendation**: Start with EC2. It's the fastest path to eliminating cold starts at the lowest cost and complexity. Upgrade to Fargate later if you need auto-scaling or HA.

---

## Comparison with GCP Migration

For reference, see [GCP Migration Assessment](./gcp-migration.md). The GCP migration is necessary if the client requirement is firm, but if the only goal is eliminating cold starts, EC2 is the simplest and cheapest solution.
