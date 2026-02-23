# Cost Analysis

Projected monthly costs for production deployment. Based on 10-15 daily users with ~25 messages each (~10,000 messages/month).

> Last updated: 2026-02-23

## Summary

| Configuration | Monthly estimate |
|---|---:|
| Current (Sonnet synth + Neon) | **~$700** |
| GPT-4.1 synth + Neon (after #354) | **~$485** |
| Haiku synth + Neon | **~$340** |
| Intent-routed (Sonnet for complex, Haiku for simple) | **~$540** |

LLM costs are ~85% of the bill. Infrastructure is a rounding error at this scale.

## Assumptions

- **Users**: 10-15/day, 25 messages each = ~10,000 messages/month
- **Database**: Neon Postgres (free tier or $19 Launch plan) — see #345
- **Region**: us-east-1
- **Production sources**: 1,200-2,400 (10-20x current dev count of 120)
- **Embedding model**: OpenAI text-embedding-3-small
- **Ingestion**: Weekly cron, ~10% source change rate per cycle

## Runtime Costs (per message)

### LLM calls per agent invocation

The LangGraph agent executes multiple LLM calls per message. Not all nodes run every time — routing is conditional based on confidence scores and query intent.

| Node | Model | When | Input tokens | Output tokens |
|---|---|---|---:|---:|
| Classifier | Haiku | Every request | ~1,050 | ~100 |
| Query Planner | Haiku | Every request | ~650 | ~150 |
| Retriever | None (pgvector) | Every request | — | — |
| Retrieval Expander | Haiku | ~30% of requests (low confidence) | ~530 | ~100 |
| Researcher (web search) | Haiku + Tavily | ~40% of requests (gray zone confidence) | ~580 | ~100 |
| **Synthesizer** | **Sonnet** | Every request | **~7,500** | **~2,000** |
| Quality Checker | Haiku | Every request | ~6,000 | ~200 |
| Quality Retry | Sonnet + Haiku | ~15% of requests | ~14,000 | ~2,200 |
| Escalate | Sonnet | ~5% of requests (instead of synthesizer) | ~1,750 | ~1,000 |

The synthesizer dominates — its ~7,500 input tokens include up to 10 retrieved documents injected as context.

### Cost per message by model configuration

**Claude API pricing** (as of Feb 2026):
- Sonnet 4: $3.00 input / $15.00 output per M tokens
- Haiku 4.5: $1.00 input / $5.00 output per M tokens

**OpenAI API pricing:**
- GPT-4.1: $2.00 input / $8.00 output per M tokens
- GPT-4o: $2.50 input / $10.00 output per M tokens
- GPT-4.1-mini: $0.40 input / $1.60 output per M tokens

| Configuration | Per message | Monthly (10k) |
|---|---:|---:|
| Sonnet synth (current) | ~$0.065 | ~$650 |
| GPT-4.1 synth (after #354) | ~$0.044 | ~$435 |
| GPT-4o synth | ~$0.051 | ~$513 |
| Haiku synth | ~$0.029 | ~$290 |
| GPT-4.1-mini synth | ~$0.019 | ~$187 |
| Intent-routed (Sonnet complex / Haiku simple) | ~$0.045 | ~$450 |

> **Intent-routed** approach: Use Sonnet for `general` and `procedural` queries (~60%) and Haiku for `factual` and `deadline` queries (~40%). Preserves quality where it matters while saving on simple lookups.

### Tavily web search (runtime)

~40% of messages trigger the researcher node, which runs 1-3 Tavily searches.

| | Monthly |
|---|---:|
| Estimated searches | ~4,000 |
| Free tier | 1,000 credits/month |
| Overage (at $0.008/credit) | ~$24 |
| **Total** | **$25-30** |

### OpenAI embeddings (runtime)

Each message embeds the query (~50 tokens) for pgvector similarity search. Negligible.

| | Monthly |
|---|---:|
| **Embeddings** | **< $1** |

## Infrastructure Costs

### Database — Neon Postgres (#345)

| Tier | Cost | Storage | Compute |
|---|---:|---|---|
| Free | $0 | 0.5 GB | 190 hrs/month |
| Launch | $19 | 10 GB | 300 hrs/month |

Free tier is likely sufficient for initial deployment (~500MB with 48k vector chunks + indexes). Staging uses a Neon branch within the same project at no additional cost.

**Compared to Aurora Serverless v2**: $0-19/mo vs $88/mo per stage. No VPC required, which also eliminates the 1-2s Lambda cold start penalty from VPC attach.

### AWS Services

| Service | Monthly | Notes |
|---|---:|---|
| Lambda | $5-15 | 10k invocations, ~5s avg, 512MB |
| API Gateway | $3-5 | 10k requests at $1/M + connection time |
| DynamoDB | $2-5 | On-demand, ~10k reads + few writes/day |
| S3 | $1-2 | Document cache, versioned, < 1GB |
| CloudFront + Next.js (SST) | $5-15 | Static assets + SSR Lambda |
| SQS | < $1 | Weekly ingestion only |
| **AWS subtotal** | **$16-43** | |

### LangSmith

| | Monthly |
|---|---:|
| Free tier | 5,000 base traces/month |
| Overage (at $2.50/1k traces) | ~$12-25 |
| **Total** | **$12-25** |

## Ingestion Costs (weekly cron, separate from runtime)

### Source Discovery Pipeline

Runs weekly across ~48 NGBs. Budget-gated (configurable Tavily and Anthropic monthly limits).

| Component | Monthly | Notes |
|---|---:|---|
| Tavily Map (~48 NGBs × 5 credits) | ~$10-15 | Within or slightly over free tier |
| Tavily Search (~96 queries) | included | 1 credit each |
| LLM evaluation (Haiku, ~500 candidates) | ~$2-5 | ~400k tokens for metadata + content eval |
| **Discovery subtotal** | **$12-20** | |

### Document Ingestion

SHA-256 content hashing skips unchanged sources. Only ~10% change rate per weekly cycle.

| Component | Monthly | Notes |
|---|---:|---|
| OpenAI embeddings | $1-2 | ~1.8M tokens/month at $0.02/M |
| Lambda compute | included | Part of AWS Lambda total above |
| S3 storage | included | Part of S3 total above |
| **Ingestion subtotal** | **$1-2** | |

## Monthly Total by Configuration

| Category | Sonnet (current) | GPT-4.1 (after #354) | Haiku |
|---|---:|---:|---:|
| LLM (runtime) | $650 | $435 | $290 |
| Neon Postgres | $0-19 | $0-19 | $0-19 |
| AWS infrastructure | $16-43 | $16-43 | $16-43 |
| Tavily (runtime + discovery) | $37-50 | $37-50 | $37-50 |
| LangSmith | $12-25 | $12-25 | $12-25 |
| Ingestion (embeddings + LLM) | $3-7 | $3-7 | $3-7 |
| **Total** | **$700-810** | **$485-595** | **$340-450** |

## Cost Optimization Levers

Ordered by impact:

| Lever | Savings | Tradeoff | Issue |
|---|---:|---|---|
| Switch synthesizer to GPT-4.1 | ~$215/mo | Requires multi-provider refactor | #354 |
| Switch synthesizer to Haiku | ~$360/mo | Degraded synthesis quality on complex queries | — |
| Intent-routed model selection | ~$160/mo | Haiku for simple queries, Sonnet for complex | — |
| Replace Aurora with Neon | ~$88-157/mo | External dependency (Neon) | #345 |
| Anthropic Batch API (non-interactive) | ~50% LLM savings | Not applicable to real-time chat | — |
| Reduce retrieval topK (10 → 5) | ~$100/mo | Fewer documents in synthesizer context, lower recall | — |
| Cache frequent queries | Variable | Stale answers for governance questions | — |

## Scaling Projections

| Users/day | Messages/month | LLM (Sonnet) | Total |
|---:|---:|---:|---:|
| 10-15 | 10,000 | $650 | ~$700 |
| 50 | 37,500 | $2,400 | ~$2,600 |
| 100 | 75,000 | $4,900 | ~$5,200 |
| 500 | 375,000 | $24,400 | ~$25,000 |

LLM costs scale linearly. Infrastructure costs remain roughly flat until ~100 users/day, then Neon compute and Lambda concurrency become factors.

## Related Issues

- #345 — Replace Aurora with Neon Postgres
- #354 — Generalize LLM interface for multi-provider model selection
- #280 — Lambda cold start optimization
