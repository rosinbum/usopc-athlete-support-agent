# USOPC Athlete Support Agent

> **Work in Progress**: This project is under active development and should be treated as a prototype. It represents approximately 15 hours of development time and is not yet production-ready. Features may be incomplete, APIs may change, and the knowledge base needs additional content and quality improvements.

An AI-powered governance and compliance assistant for U.S. Olympic and Paralympic athletes. Ask questions about anti-doping rules, athlete rights, competition eligibility, and other USOPC policies — get accurate, cited answers with appropriate disclaimers.

## Features

- **Intelligent Q&A**: Natural language interface powered by Claude (Anthropic) with retrieval-augmented generation (RAG)
- **Real-Time Streaming**: Responses appear token-by-token as they're generated, so you see answers immediately
- **Adaptive Response Formats**: Concise answers for simple questions, detailed responses for complex ones
  - Factual queries: 1-3 sentences with source citation
  - Procedural queries: Overview + numbered steps
  - Deadline queries: Specific dates and timeframes
  - Complex queries: Full 5-section format with details, deadlines, and next steps
- **Smart Clarification**: When your question is ambiguous, the agent asks for clarification rather than guessing
- **Document Search**: Vector similarity search across USOPC governance documents using pgvector
- **Web Research**: Falls back to Tavily web search when local documents don't contain sufficient information
- **Citation Tracking**: Every answer includes source citations so athletes can verify information
- **Automatic Disclaimers**: Sensitive topics (medical, legal, financial) include appropriate disclaimers
- **Multiple Interfaces**:
  - Web chat application
  - Slack bot (coming soon — see [#7](https://github.com/rosinbum/usopc-athlete-support-agent/issues/7))
- **Weekly Document Sync**: Automated ingestion pipeline keeps the knowledge base current

## Architecture

This is a serverless monorepo deployed to AWS via [SST v3](https://sst.dev/).

```
apps/
  api/         tRPC + Hono backend (AWS Lambda)
  slack/       Slack Bolt bot (AWS Lambda)
  web/         Next.js 16 frontend (React 19, Tailwind 4)

packages/
  core/        LangGraph agent, RAG pipeline, vector store, tools
  ingestion/   Document ETL: load → clean → split → embed → store
  shared/      Logger, env helpers, error classes, Zod schemas
```

### AI Agent (LangGraph)

The core agent is a compiled [LangGraph](https://langchain-ai.github.io/langgraph/) state machine:

```
START → classifier → clarify | retriever | escalate
             ↓            ↓          ↓
        needsClarification?      needsMoreInfo?
             ↓                  ↓       ↓
            END          synthesizer  researcher
                              ↓           ↓
                              └─────┬─────┘
                                    ↓
                             citationBuilder → disclaimerGuard → END
```

**Nodes**:

- `classifier`: Analyzes query to determine domain, intent, and whether clarification is needed
- `clarify`: Returns a clarifying question when the query is ambiguous
- `retriever`: Performs pgvector similarity search on embedded documents
- `researcher`: Queries Tavily for additional web context
- `synthesizer`: Generates the response via Claude (with adaptive formatting based on query intent)
- `citationBuilder`: Extracts and formats source citations
- `disclaimerGuard`: Adds disclaimers for sensitive topics
- `escalate`: Routes urgent matters (abuse reports, imminent deadlines) to appropriate authorities

### Ingestion Pipeline

Fan-out architecture via SQS FIFO queue (production only):

1. **Cron job** (weekly): Checks configured sources for changes via content hashing
2. **Worker**: Processes each source — loads content (PDF/HTML/text), cleans, splits into chunks, embeds via OpenAI, stores in pgvector

### Infrastructure

| Component | Development                         | Production               |
| --------- | ----------------------------------- | ------------------------ |
| Database  | Local Docker Postgres with pgvector | Aurora Serverless v2     |
| API       | Local Lambda emulation via SST      | API Gateway + Lambda     |
| Web       | Next.js dev server                  | CloudFront + Lambda@Edge |
| Secrets   | SST dev secrets                     | SST encrypted secrets    |

## Local Development Setup

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** 9.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** (for local PostgreSQL)
- **AWS CLI** configured with credentials (for SST)

### 1. Clone and Install

```bash
git clone https://github.com/rosinbum/usopc-athlete-support-agent.git
cd usopc-athlete-support-agent
pnpm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

The `.env` file configures local development settings. API keys are managed through SST secrets (see step 4).

### 3. Start the Database

```bash
pnpm db:up        # Start PostgreSQL container with pgvector
pnpm db:migrate   # Run database migrations
```

To stop the database:

```bash
pnpm db:down
```

### 4. Set SST Secrets

SST manages API keys securely. Set each required secret:

```bash
sst secret set AnthropicApiKey <your-anthropic-api-key>
sst secret set OpenaiApiKey <your-openai-api-key>
sst secret set TavilyApiKey <your-tavily-api-key>
```

Optional secrets:

```bash
sst secret set LangchainApiKey <key>       # For LangSmith tracing
sst secret set SlackBotToken <token>       # For Slack integration
sst secret set SlackSigningSecret <secret> # For Slack integration
```

### 5. Run Development Server

```bash
pnpm dev
```

This starts SST in dev mode, which:

- Injects secrets into the environment
- Runs the API locally
- Starts the Next.js dev server at http://localhost:3000

### 6. Seed the Database (Optional)

To populate the database with sample documents:

```bash
pnpm seed
```

To run the full ingestion pipeline:

```bash
pnpm ingest
```

## Available Commands

```bash
# Development
pnpm dev              # Start all services via SST
pnpm db:up            # Start local PostgreSQL
pnpm db:down          # Stop local PostgreSQL
pnpm db:migrate       # Run database migrations

# Building & Testing
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm typecheck        # Type-check all packages
pnpm lint             # Lint all packages

# Single package commands
pnpm --filter @usopc/core test
pnpm --filter @usopc/api typecheck

# Data management
pnpm ingest           # Run document ingestion
pnpm seed             # Seed database with sample data
```

## Production Deployment

### Prerequisites

- AWS account with appropriate permissions
- SST CLI installed (`pnpm add -g sst`)
- Production secrets configured

### 1. Set Production Secrets

```bash
sst secret set AnthropicApiKey <key> --stage production
sst secret set OpenaiApiKey <key> --stage production
sst secret set TavilyApiKey <key> --stage production
sst secret set SlackBotToken <token> --stage production
sst secret set SlackSigningSecret <secret> --stage production
```

### 2. Deploy

```bash
sst deploy --stage production
```

This provisions:

- Aurora Serverless v2 PostgreSQL cluster with pgvector
- API Gateway + Lambda for the tRPC API
- API Gateway + Lambda for Slack webhooks
- CloudFront distribution + Lambda@Edge for the Next.js app
- EventBridge + SQS + Lambda for the weekly ingestion pipeline

### 3. Run Initial Ingestion

After the first deployment, trigger the ingestion pipeline to populate the knowledge base:

```bash
# Via AWS Console: manually invoke the IngestionCron Lambda
# Or wait for the weekly scheduled trigger
```

### Environment Outputs

After deployment, SST outputs the service URLs:

```
apiUrl:   https://xxx.execute-api.us-east-1.amazonaws.com
webUrl:   https://xxx.cloudfront.net
slackUrl: https://xxx.execute-api.us-east-1.amazonaws.com/slack/events
```

## Slack Integration

<!-- TODO: Document Slack app setup and configuration once #7 is complete -->

Slack integration is under development. See [#7](https://github.com/rosinbum/usopc-athlete-support-agent/issues/7) for progress.

## Contributing

1. Create a GitHub issue describing the planned work
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes with tests
4. Run `pnpm test && pnpm typecheck && pnpm lint`
5. Format code: `npx prettier --write .`
6. Open a pull request referencing the issue

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

<!-- HOURS:START -->
**Tracked build time:** 16.2 hours

- Method: terminal-activity-based (idle cutoff: 10 min)
- Last updated: 2026-02-05T12:13:35.424Z
<!-- HOURS:END -->

## License

Proprietary. All rights reserved.
