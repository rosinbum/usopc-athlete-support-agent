# Production Deployment

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
- API Gateway + Lambda for the tRPC API
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

After deployment, SST outputs the service URLs:

```
apiUrl:   https://xxx.execute-api.us-east-1.amazonaws.com
webUrl:   https://xxx.cloudfront.net
slackUrl: https://xxx.execute-api.us-east-1.amazonaws.com/slack/events
```
