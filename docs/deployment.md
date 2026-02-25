# Production Deployment

> **See also:** [Deployment Procedure](./deployment-procedure.md) for the CI/CD pipeline
> (staging → approval gate → production) and [Incident Response](./incident-response.md)
> for rollback and incident handling.

## Prerequisites

- AWS account with appropriate permissions
- SST CLI installed (`pnpm add -g sst`)
- Production secrets configured

## 1. Set Production Secrets

```bash
sst secret set AnthropicApiKey <key> --stage production
sst secret set OpenaiApiKey <key> --stage production
sst secret set TavilyApiKey <key> --stage production
sst secret set SlackBotToken <token> --stage production
sst secret set SlackSigningSecret <secret> --stage production
sst secret set AuthSecret <secret> --stage production
sst secret set GitHubClientId <id> --stage production
sst secret set GitHubClientSecret <secret> --stage production
sst secret set AdminEmails <comma-separated-emails> --stage production
```

Optional secrets:

```bash
sst secret set LangchainApiKey <key> --stage production          # LangSmith tracing
sst secret set ConversationMaxTurns <number> --stage production  # Default: 5
```

## 2. Deploy

```bash
sst deploy --stage production
```

This provisions:

- Aurora Serverless v2 PostgreSQL cluster with pgvector
- API Gateway + Lambda for Slack webhooks
- CloudFront distribution + Lambda@Edge for the Next.js app
- EventBridge + SQS + Lambda for the weekly ingestion pipeline

## 3. Run Initial Ingestion

After the first deployment, trigger the ingestion pipeline to populate the knowledge base:

```bash
# Via AWS Console: manually invoke the IngestionCron Lambda
# Or wait for the weekly scheduled trigger
```

## Environment Outputs

After deployment, SST outputs the service URLs. With custom domains configured (see [Deployment Procedure — Custom Domains](./deployment-procedure.md#custom-domains)):

```
webUrl:   https://app.rosinbum.org
slackUrl: https://slack.rosinbum.org
```

Without custom domains (local dev stages), raw AWS URLs are used:

```
webUrl:   https://xxx.cloudfront.net
slackUrl: https://xxx.execute-api.us-east-1.amazonaws.com
```

## 4. Configure Automated Source Discovery

The source discovery system runs automatically every Monday at 2 AM UTC via EventBridge. It discovers new governance documents and evaluates them for relevance.

### Budget Configuration

Set budget limits to prevent unexpected costs:

```bash
# Tavily API monthly budget (credits)
sst secret set TavilyMonthlyBudget 1000 --stage production

# Anthropic API monthly budget (dollars)
sst secret set AnthropicMonthlyBudget 10 --stage production
```

**Defaults:**

- Tavily: 1000 credits/month
- Anthropic: $10/month

The discovery Lambda checks budgets before running and will halt if exceeded.

### Notification Configuration

Configure optional notification channels for discovery results and alerts:

#### Slack Notifications

```bash
# Create Slack webhook (https://api.slack.com/messaging/webhooks)
# Then set the webhook URL
sst secret set SlackWebhookUrl <webhook-url> --stage production
```

#### Email Notifications (via SES)

```bash
# Set notification email recipient
sst secret set NotificationEmail admin@example.com --stage production

# Set from address (optional, defaults to noreply@usopc.org)
sst secret set SesFromEmail notifications@example.com --stage production
```

**Note:** Email addresses must be verified in AWS SES. In production, move SES out of sandbox mode.

### Discovery Configuration

Discovery sources are defined in `data/discovery-config.json`:

```json
{
  "domains": ["teamusa.org", "usopc.org", "usatf.org"],
  "searchQueries": ["USOPC team selection procedures"],
  "maxResultsPerDomain": 20,
  "maxResultsPerQuery": 10,
  "autoApprovalThreshold": 0.85
}
```

**Fields:**

- `domains`: Domains to crawl using Tavily Map API
- `searchQueries`: Search queries for Tavily Search API
- `maxResultsPerDomain`: Max results per domain crawl (default: 20)
- `maxResultsPerQuery`: Max results per search query (default: 10)
- `autoApprovalThreshold`: Confidence threshold for auto-approval (0-1, default: 0.85)

### Workflow

1. **Discovery Lambda** runs every Monday at 2 AM UTC
2. Checks budgets (Tavily and Anthropic)
3. Discovers URLs from configured domains and search queries
4. Evaluates each URL for relevance using LLM
5. Stores results in DynamoDB with approval status
6. Sends completion summary via configured channels
7. **Ingestion Cron** (runs weekly) automatically creates SourceConfigs for approved discoveries
8. New sources are ingested into the knowledge base

### Manual Triggers

Trigger discovery manually for testing or one-off runs:

```bash
# Invoke the discovery Lambda directly
aws lambda invoke \
  --function-name usopc-athlete-support-production-DiscoveryCron \
  --region us-east-1 \
  /dev/null
```

### Cost Estimates

**Tavily API:**

- Map endpoint: 5 credits per domain
- Search endpoint: 1 credit per query
- Example: 7 domains + 5 queries = 40 credits/week = ~160 credits/month

**Anthropic API (Claude Sonnet 4):**

- Metadata evaluation: ~1000 input + 200 output tokens per URL
- Content evaluation: ~2000 input + 500 output tokens per URL
- Total per URL: ~3000 input + 700 output = ~$0.02
- Example: 50 URLs/week = ~$1/week = ~$4/month

**Total estimated monthly cost:** ~$5-10 (well within default budgets)

## Updating Model Configuration

Model instances (`agentModel` for Sonnet, `classifierModel` for Haiku) are constructed once at Lambda cold start and reused for the container's lifetime. Config changes stored in DynamoDB are cached for 5 minutes by `getModelConfig()`, but the `ChatAnthropic` instances themselves are never recreated.

**To apply model config changes (model name, temperature, maxTokens):**

1. Update the config in DynamoDB (via admin UI or direct update)
2. Force a cold start by redeploying: `sst deploy --stage production`
3. Or wait for Lambda to naturally recycle containers (up to ~2 hours)

**Note:** Changing just the DynamoDB config without a redeploy will **not** update the running model instances. The 5-minute config cache TTL only affects `getModelConfig()` calls, not already-constructed `ChatAnthropic` instances.

## Troubleshooting

### Discovery Not Running

Check the DiscoveryCron Lambda logs:

```bash
aws logs tail /aws/lambda/usopc-athlete-support-production-DiscoveryCron \
  --follow \
  --region us-east-1
```

Common issues:

- Budget exceeded (check CloudWatch for budget alerts)
- API keys expired or invalid
- Network timeouts (increase Lambda timeout if needed)

### Budget Alerts Not Received

1. Verify notification channels are configured (Slack webhook or SES email)
2. Check Lambda logs for notification errors
3. For email: ensure email addresses are verified in SES
4. For Slack: test webhook URL manually

### Approved Discoveries Not Ingested

The ingestion cron processes approved discoveries automatically. Check:

1. Verify discoveries have `status: "approved"` in DynamoDB
2. Check IngestionCron Lambda logs for errors
3. Ensure `sourceConfigId` is null (already linked discoveries are skipped)

### High Costs

1. Review usage metrics in CloudWatch
2. Adjust budgets or reduce discovery frequency
3. Narrow discovery scope (fewer domains/queries)
4. Increase `autoApprovalThreshold` to reduce false positives
