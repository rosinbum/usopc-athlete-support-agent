# Phase 4 Implementation Summary: Automation & Scheduling

**Status:** ✅ Complete (ready for testing and PR)

**Branch:** Should be created as `feat/discovery-automation` in worktree `../usopc-issue-149`

**Dependencies:** Phase 3 (Orchestration & Hints) merged in PR #148

---

## Overview

This phase implements automated scheduling and cost tracking for the intelligent source discovery system, completing the full automated pipeline from discovery to ingestion.

---

## Files Created

### 1. Cost Tracking Service

**File:** `packages/ingestion/src/services/costTracker.ts`
**Test:** `packages/ingestion/src/services/costTracker.test.ts`

**Features:**

- Tracks Tavily API usage (calls and estimated credits: 1 per search, 5 per map)
- Tracks Anthropic API usage (calls, tokens, cost based on Claude Sonnet 4 pricing)
- Stores daily/weekly/monthly metrics in DynamoDB (UsageMetric entity)
- Budget threshold checks with environment variables
- Export functions: `trackTavilyCall()`, `trackAnthropicCall()`, `checkBudget()`, `getUsageStats()`

**Environment Variables:**

- `TAVILY_MONTHLY_BUDGET` (default: 1000 credits)
- `ANTHROPIC_MONTHLY_BUDGET` (default: $10)

**DynamoDB Entity:** Added `UsageMetric` to `packages/shared/src/entities/schema.ts`

---

### 2. Notification Service

**File:** `packages/ingestion/src/services/notificationService.ts`
**Test:** `packages/ingestion/src/services/notificationService.test.ts`

**Features:**

- CloudWatch Logs (always enabled)
- Optional Slack webhook integration (if `SLACK_WEBHOOK_URL` env var set)
- Optional SES email notifications (if `NOTIFICATION_EMAIL` env var set)
- Discovery completion summaries with stats
- Budget alerts (warning at 80%, critical at 100%)
- Error notifications

**Environment Variables:**

- `SLACK_WEBHOOK_URL` (optional)
- `NOTIFICATION_EMAIL` (optional)
- `SES_FROM_EMAIL` (optional, default: noreply@usopc.org)

---

### 3. Discovery Lambda

**File:** `packages/ingestion/src/functions/discovery.ts`
**Test:** `packages/ingestion/src/functions/discovery.test.ts`

**Features:**

- EventBridge cron handler (runs every Monday at 2 AM UTC)
- Loads discovery config from `data/discovery-config.json`
- Creates DiscoveryOrchestrator instance
- Runs discovery from domains and search queries
- Tracks costs with CostTracker
- Sends notifications with NotificationService
- Budget checks halt execution if exceeded
- Comprehensive error handling

**Environment Variables:**

- `DISCOVERY_CONFIG_PATH` (optional, default: data/discovery-config.json)
- All cost tracking and notification env vars

---

### 4. Ingestion Integration

**File:** `packages/ingestion/src/cron.ts` (updated)

**New Function:** `processApprovedDiscoveries()`

**Features:**

- Fetches newly approved discoveries since last run
- Auto-creates SourceConfig for approved discoveries
- Links DiscoveredSource.sourceConfigId after creation
- Integrated into weekly ingestion cron (runs before source loading)
- Error handling ensures individual failures don't stop pipeline

**Test:** Added comprehensive tests to `packages/ingestion/src/cron.test.ts`

---

## Files Modified

### 1. SST Configuration

**File:** `sst.config.ts`

**Added:**

- `DiscoveryCron` EventBridge rule: `cron(0 2 ? * MON *)` (every Monday at 2 AM UTC)
- DiscoveryFunction Lambda with:
  - Handler: `packages/ingestion/src/functions/discovery.handler`
  - Timeout: 15 minutes
  - Memory: 1024 MB
  - Environment variables for budgets and notifications
  - Links to AppTable, TavilyApiKey, AnthropicApiKey

---

### 2. DynamoDB Schema

**File:** `packages/shared/src/entities/schema.ts`

**Added:** `UsageMetric` model with:

- `pk`: `Usage#{service}` (tavily or anthropic)
- `sk`: `{period}#{date}` (daily/weekly/monthly)
- `gsi1pk`: `Usage` (for cross-service queries)
- `gsi1sk`: `{date}` (for date-based queries)
- Metrics: tavilyCalls, tavilyCredits, anthropicCalls, anthropicInputTokens, anthropicOutputTokens, anthropicCost

---

### 3. DiscoveredSourceEntity

**File:** `packages/shared/src/entities/DiscoveredSourceEntity.ts`

**Added:** `getApprovedSince(since: string)` method

- Queries gsi1 for approved discoveries since timestamp
- Used by ingestion cron to fetch new approvals

---

### 4. Entities Index

**File:** `packages/ingestion/src/entities/index.ts`

**Added:**

- Export `DiscoveredSourceEntity` and types
- Factory function `createDiscoveredSourceEntity()`

---

### 5. Services Index

**File:** `packages/ingestion/src/services/index.ts`

**Added:**

- Export `CostTracker`, `createCostTracker`, and related types
- Export `NotificationService`, `createNotificationService`, and related types

---

### 6. Documentation

**Files:** `docs/deployment.md`, `docs/architecture.md`

**Added:**

- Section on automated discovery scheduling
- Budget configuration instructions
- Notification setup (Slack/email)
- Cost estimates and monitoring
- Troubleshooting guide
- Architecture details for automation components

---

## Testing Coverage

### Unit Tests Created:

1. **costTracker.test.ts**: 15 tests covering:
   - Tavily and Anthropic call tracking
   - Budget checks (within/over budget)
   - Usage stats queries
   - Error handling
   - Edge cases (zero budget, zero tokens)

2. **notificationService.test.ts**: 14 tests covering:
   - Discovery completion notifications
   - Budget alerts (warning and critical)
   - Error notifications
   - All channels (CloudWatch, Slack, SES)
   - Error handling and graceful degradation

3. **discovery.test.ts**: 10 tests covering:
   - Successful execution flow
   - Cost tracking integration
   - Budget checks and alerts
   - Error handling and recovery
   - Configuration loading

4. **cron.test.ts** (updated): 5 new tests covering:
   - Auto-creating SourceConfigs from approved discoveries
   - Skipping discoveries with existing SourceConfigs
   - Error handling and recovery
   - Empty result handling

**Total:** 44 new tests

---

## Environment Variables Summary

### Required (Production):

None - all have sensible defaults

### Optional Budget Limits:

- `TAVILY_MONTHLY_BUDGET`: Tavily credits limit (default: 1000)
- `ANTHROPIC_MONTHLY_BUDGET`: Anthropic cost limit in dollars (default: $10)

### Optional Notifications:

- `SLACK_WEBHOOK_URL`: Slack webhook for notifications
- `NOTIFICATION_EMAIL`: Email for SES notifications
- `SES_FROM_EMAIL`: From address for SES (default: noreply@usopc.org)

### Optional Config:

- `DISCOVERY_CONFIG_PATH`: Path to discovery-config.json (default: data/discovery-config.json)

---

## Workflow

### Automated Weekly Flow:

1. **Monday 2 AM UTC:** DiscoveryCron Lambda runs
   - Checks budgets (halts if exceeded)
   - Discovers URLs from configured domains and search queries
   - Evaluates each URL for relevance using LLM
   - Stores results in DynamoDB with approval status
   - Tracks API usage costs
   - Sends completion summary via configured channels

2. **Weekly:** IngestionCron Lambda runs
   - Fetches newly approved discoveries since last run
   - Auto-creates SourceConfig for each approved discovery
   - Links DiscoveredSource.sourceConfigId
   - Continues with standard ingestion pipeline
   - New sources are embedded and stored in vector database

### Budget Safety:

- Budget checks run before discovery starts
- Execution halts immediately if budget exceeded
- Critical alert sent via all configured channels
- Warning alert at 80% usage
- Monthly rollup for accurate tracking

### Notification Flow:

- **Success:** Completion summary with stats, costs, duration
- **Warning:** Budget at 80% threshold
- **Critical:** Budget exceeded, discovery halted
- **Error:** Any failure during discovery run

---

## Cost Estimates

### Tavily API:

- Map endpoint: 5 credits per domain
- Search endpoint: 1 credit per query
- Example config (7 domains + 5 queries): 40 credits/week ≈ 160 credits/month
- Well within 1000 credit default budget

### Anthropic API (Claude Sonnet 4):

- Input: $3.00 per million tokens
- Output: $15.00 per million tokens
- Estimated per URL: ~3000 input + 700 output = ~$0.02
- Example (50 URLs/week): $1/week ≈ $4/month
- Well within $10 default budget

### Total Estimated Cost:

**$5-10/month** (assuming default discovery config)

---

## Next Steps

### Before Creating PR:

1. **Create Worktree** (if not done):

   ```bash
   cd /Users/joelrosinbum/src/usopc-athlete-support-agent
   git worktree add ../usopc-issue-149 -b feat/discovery-automation
   cd ../usopc-issue-149
   pnpm install
   ```

2. **Copy update-hours.mjs** (from MEMORY.md):

   ```bash
   cp /path/to/main/scripts/update-hours.mjs ../usopc-issue-149/scripts/
   ```

3. **Copy all implementation files** to the worktree:
   - All files listed in "Files Created" section above
   - All modified files

4. **Run Tests**:

   ```bash
   pnpm --filter @usopc/ingestion test
   pnpm --filter @usopc/shared test
   ```

5. **Type Check**:

   ```bash
   pnpm typecheck
   ```

6. **Format**:

   ```bash
   npx prettier --write "packages/ingestion/src/**/*.ts"
   npx prettier --write "packages/shared/src/**/*.ts"
   npx prettier --write "sst.config.ts"
   npx prettier --write "docs/*.md"
   ```

7. **Commit**:

   ```bash
   git add .
   git commit -m "feat: Add automated discovery scheduling and cost tracking

   Implements Phase 4 of the intelligent source discovery system with:
   - Cost tracking for Tavily and Anthropic APIs with budget enforcement
   - Multi-channel notification service (CloudWatch, Slack, SES)
   - Automated weekly discovery via EventBridge cron
   - Auto-creation of SourceConfigs for approved discoveries
   - Comprehensive tests and documentation

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
   ```

8. **Push and Create PR**:
   ```bash
   git push -u origin feat/discovery-automation
   gh pr create --title "Source Discovery Phase 4: Automation & Scheduling" \
     --body "See PHASE-4-IMPLEMENTATION.md for full details"
   ```

---

## Verification Checklist

Before merging:

- [ ] All tests pass
- [ ] Type checking passes
- [ ] Code formatted with Prettier
- [ ] Documentation updated (deployment.md, architecture.md)
- [ ] Environment variables documented
- [ ] Cost estimates reviewed
- [ ] Error handling tested
- [ ] Budget enforcement tested
- [ ] Notification channels tested

---

## Production Deployment

After PR merge:

1. Set secrets:

   ```bash
   sst secret set TavilyMonthlyBudget 1000 --stage production
   sst secret set AnthropicMonthlyBudget 10 --stage production
   # Optional:
   sst secret set SlackWebhookUrl <url> --stage production
   sst secret set NotificationEmail admin@example.com --stage production
   ```

2. Deploy:

   ```bash
   sst deploy --stage production
   ```

3. Verify DiscoveryCron Lambda created and scheduled

4. Test manually:

   ```bash
   aws lambda invoke \
     --function-name usopc-athlete-support-production-DiscoveryCron \
     --region us-east-1 \
     /dev/null
   ```

5. Monitor CloudWatch logs for first run

---

## Related Issues

- Depends on: #147 (Phase 3, merged in PR #148)
- Implements: Phase 4 automation requirements
- Enables: Fully automated discovery-to-ingestion pipeline
