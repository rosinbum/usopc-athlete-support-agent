# Deployment Procedure

## Overview

Deployments use a hybrid **tag + workflow dispatch** pipeline:

1. **Tag push** (`v*`) — automatically deploys to **staging** and runs smoke tests
2. **Manual workflow dispatch** — deploys a specified tag to **production** with an approval gate
3. **Rollback** — dispatch a previous tag to production, or automatic rollback on smoke test failure

This gives version history via git tags, automatic staging feedback, and deliberate production control.

## Pipeline Flow

```
git tag v1.2.3 && git push origin v1.2.3
        │
        ▼
┌─────────────────┐
│ deploy-staging   │  (automatic on tag push)
│ sst deploy       │
│ --stage staging  │
└────────┬────────┘
         │ smoke tests pass
         ▼
┌─────────────────────────────┐
│ Actions → Run workflow      │  (manual trigger)
│ Select tag: v1.2.3          │
│ environment: production     │
│ (requires reviewer approval)│
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────┐       ┌─────────────────────┐
│ deploy-production    │──✗──▶│ rollback-production  │
│ sst deploy           │      │ redeploy prev tag    │
│ --stage production   │      └─────────────────────┘
└─────────────────────┘
```

## One-Time Prerequisites

### 1. AWS OIDC Provider

Create an IAM OIDC identity provider for GitHub Actions so the workflow authenticates without static AWS keys:

```bash
# Create the OIDC provider (one-time per AWS account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  --client-id-list sts.amazonaws.com
```

### 2. IAM Deploy Role

Create a role that GitHub Actions can assume. The trust policy restricts to the repo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:rosinbum/usopc-athlete-support-agent:*"
        }
      }
    }
  ]
}
```

Attach the permissions policy that SST needs (CloudFormation, S3, Lambda, API Gateway, CloudFront, DynamoDB, SQS, EventBridge, IAM, etc.). See the [SST IAM permissions docs](https://sst.dev/docs/iam-credentials) for the full list.

### 3. GitHub Repository Secret

Add the IAM role ARN as a repository secret:

- **Name:** `AWS_DEPLOY_ROLE_ARN`
- **Value:** `arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>`

### 4. GitHub Environments

Create two environments in **Settings → Environments**:

- **staging** — no protection rules (auto-deploys on tag push)
- **production** — enable **Required reviewers** and add at least one approver

### 5. Staging Secrets

Set SST secrets for the staging stage (mirrors production):

```bash
sst secret set AnthropicApiKey <key> --stage staging
sst secret set OpenaiApiKey <key> --stage staging
sst secret set TavilyApiKey <key> --stage staging
sst secret set SlackBotToken <token> --stage staging
sst secret set SlackSigningSecret <secret> --stage staging
sst secret set AuthSecret <secret> --stage staging
sst secret set GitHubClientId <id> --stage staging
sst secret set GitHubClientSecret <secret> --stage staging
sst secret set AdminEmails <comma-separated-emails> --stage staging
sst secret set DatabaseUrl <neon-staging-connection-string> --stage staging
```

Optional:

```bash
sst secret set LangchainApiKey <key> --stage staging
sst secret set ConversationMaxTurns 5 --stage staging
```

## Creating a Release

Tag the commit and push to trigger the staging deploy:

```bash
# Tag the current commit
git tag v1.2.3

# Push the tag (triggers staging deploy)
git push origin v1.2.3
```

Use [semantic versioning](https://semver.org/):

- **Patch** (`v1.2.3` → `v1.2.4`): bug fixes, dependency updates
- **Minor** (`v1.2.3` → `v1.3.0`): new features, non-breaking changes
- **Major** (`v1.2.3` → `v2.0.0`): breaking changes, major rewrites

## Deploying to Production

1. Verify the staging deploy succeeded (check the Actions tab for the tag push workflow)
2. Go to **Actions → Deploy → Run workflow**
3. Enter the tag to deploy (e.g., `v1.2.3`)
4. Select **production** as the target stage
5. Click **Run workflow**
6. A reviewer must approve the deployment in the GitHub environment approval prompt
7. Monitor the workflow — smoke tests run automatically after deploy

## Pre-Deployment Checklist

- [ ] All CI checks pass on `main`
- [ ] Tag pushed and staging deploy succeeded
- [ ] Staging smoke tests passed
- [ ] Any new SST secrets set for production (`sst secret set ... --stage production`)
- [ ] Database migrations applied if needed
- [ ] No active incidents

## Post-Deployment Verification

After a successful production deploy:

1. Verify API health: `curl https://<api-url>/health`
2. Verify Web health: `curl https://<web-url>/api/health`
3. Test a sample chat query in the web UI
4. Check CloudWatch logs for errors in the first few minutes
5. Verify Slack bot responds (if applicable)

## Manual Deployment Override

If CI/CD is unavailable, deploy directly from a local machine:

```bash
# Authenticate with AWS
aws sso login --profile default

# Deploy to staging first
npx sst deploy --stage staging

# Verify staging, then deploy to production
npx sst deploy --stage production
```

**Only use manual deployment when the CI/CD pipeline is down.** Always prefer the workflow dispatch method for audit trail and approval gates.

## Rollback

### Automatic Rollback

If the production deploy smoke tests fail, the `rollback-production` job automatically:

1. Finds the previous `v*` tag (sorted by creation date)
2. Checks out that tag
3. Redeploys to production
4. Runs smoke tests against the rolled-back deployment

### Manual Rollback

Dispatch a previous known-good tag to production:

1. Find the last working tag: `git tag --sort=-creatordate | head -5`
2. Go to **Actions → Deploy → Run workflow**
3. Enter the previous tag (e.g., `v1.2.2`)
4. Approve and monitor

### Database Rollback

If the deployment included database migrations, you may need to manually revert them. SST does not manage database schema — check `packages/shared/src/migrations/` for the relevant down migration.
