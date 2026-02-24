# Incident Response Runbook

## Severity Levels

| Level | Description            | Response SLA | Examples                                            |
| ----- | ---------------------- | ------------ | --------------------------------------------------- |
| P0    | Service fully down     | 15 minutes   | API unreachable, database connection failure        |
| P1    | Major feature broken   | 1 hour       | Agent not responding, Slack bot down, auth failures |
| P2    | Degraded functionality | 4 hours      | Slow responses, partial ingestion failures          |
| P3    | Minor issue / cosmetic | 24 hours     | UI glitch, non-critical log errors                  |

## Detection

### Health Endpoints

| Service | Endpoint          | Expected Response                   |
| ------- | ----------------- | ----------------------------------- |
| API     | `GET /health`     | `{"status":"ok"}`                   |
| Web     | `GET /api/health` | `{"status":"ok","timestamp":"..."}` |

### CloudWatch Log Groups

```
/aws/lambda/usopc-athlete-support-production-Api
/aws/lambda/usopc-athlete-support-production-Web
/aws/lambda/usopc-athlete-support-production-SlackApi
/aws/lambda/usopc-athlete-support-production-IngestionCron
/aws/lambda/usopc-athlete-support-production-DiscoveryCron
```

### Recommended CloudWatch Alarms

Configure these alarms for early detection:

- **API 5xx rate** > 5% over 5 minutes → P0
- **API latency p99** > 10s over 5 minutes → P1
- **Lambda errors** > 10 in 5 minutes per function → P1
- **Lambda throttles** > 0 → P2
- **Neon Postgres connection count / compute usage** elevated → P2
- **DynamoDB throttled reads/writes** > 0 → P2

## Triage Decision Tree

```
Is the health endpoint responding?
├── No
│   ├── Is it a DNS/CloudFront issue?  → Check AWS status page
│   ├── Is the Lambda function erroring?  → Check Lambda logs (see below)
│   └── Is the API Gateway responding?  → Check API Gateway metrics
│
└── Yes, but degraded
    ├── Are agent responses failing?
    │   ├── Check Anthropic API status
    │   ├── Check ANTHROPIC_API_KEY secret
    │   └── Check Lambda timeout / memory
    │
    ├── Is the database unreachable?
    │   ├── Check DATABASE_URL secret
    │   ├── Check Neon dashboard / project status
    │   └── Check Neon connection limits
    │
    └── Is ingestion/discovery failing?
        ├── Check SQS DLQ for failed messages
        ├── Check Tavily/OpenAI API keys
        └── Check budget thresholds
```

### Checking Lambda Logs

```bash
# Tail API Lambda logs
aws logs tail /aws/lambda/usopc-athlete-support-production-Api \
  --follow --region us-east-1

# Search for errors in the last hour
aws logs filter-log-events \
  --log-group-name /aws/lambda/usopc-athlete-support-production-Api \
  --start-time $(date -d '1 hour ago' +%s000) \
  --filter-pattern "ERROR" \
  --region us-east-1
```

## Mitigation

### Rollback via Tag Dispatch

The fastest way to restore a known-good state:

1. Find the last working tag: `git tag --sort=-creatordate | head -5`
2. Go to **Actions → Deploy → Run workflow**
3. Enter the previous tag (e.g., `v1.2.2`)
4. Approve and monitor

See [Deployment Procedure — Rollback](./deployment-procedure.md#rollback) for details.

### Circuit Breakers

The agent has built-in circuit breakers for external API calls (Anthropic, Tavily, OpenAI). When an external dependency is down:

- Circuit opens after consecutive failures
- Requests fail fast instead of timing out
- Circuit auto-resets after a cooldown period

Check circuit breaker state in Lambda logs — look for `circuit open` messages.

### Lambda Scaling

If Lambda is throttling under load:

```bash
# Check current concurrency
aws lambda get-function-concurrency \
  --function-name usopc-athlete-support-production-Api \
  --region us-east-1

# Increase reserved concurrency (if needed)
aws lambda put-function-concurrency \
  --function-name usopc-athlete-support-production-Api \
  --reserved-concurrent-executions 100 \
  --region us-east-1
```

### Emergency: Manual Redeploy

If the CI/CD pipeline itself is down:

```bash
aws sso login --profile default
npx sst deploy --stage production
```

## Communication

### Slack Channel

Post incident updates in `#ops-alerts`. Use this template:

```
🔴 INCIDENT — [P0/P1/P2/P3]

**Summary:** [One-line description]
**Impact:** [Who/what is affected]
**Status:** [Investigating / Mitigating / Resolved]
**ETA:** [Expected resolution time, if known]

Updates will follow in this thread.
```

### Stakeholder Updates

For P0/P1 incidents, notify stakeholders at these intervals:

- **P0:** Every 15 minutes until mitigated
- **P1:** Every 30 minutes until mitigated
- Post a final resolution message when the incident is closed

## Post-Mortem Template

Create a post-mortem document for any P0 or P1 incident:

```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Duration:** [Start time] – [End time] (X hours Y minutes)
**Severity:** P0 / P1
**Author:** [Name]

## Summary

[2-3 sentence summary of what happened and the impact.]

## Timeline

| Time (UTC) | Event                     |
| ---------- | ------------------------- |
| HH:MM      | [First detection / alert] |
| HH:MM      | [Investigation started]   |
| HH:MM      | [Root cause identified]   |
| HH:MM      | [Mitigation applied]      |
| HH:MM      | [Service restored]        |

## Root Cause

[Detailed explanation of what went wrong and why.]

## Impact

- **Users affected:** [Number or scope]
- **Duration:** [How long were users impacted]
- **Data loss:** [Yes/No — describe if yes]

## What Went Well

- [Thing that helped]

## What Went Poorly

- [Thing that made it worse or took too long]

## Action Items

| Action                  | Owner | Due Date   |
| ----------------------- | ----- | ---------- |
| [Preventive measure]    | [Who] | YYYY-MM-DD |
| [Detection improvement] | [Who] | YYYY-MM-DD |
| [Process change]        | [Who] | YYYY-MM-DD |
```
