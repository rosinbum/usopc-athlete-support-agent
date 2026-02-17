# USOPC Athlete Support Agent

> **Work in Progress**: This project is under active development and should be treated as a prototype. It represents approximately 57.9 hours of development time and is not yet production-ready. Features may be incomplete, APIs may change, and the knowledge base needs additional content and quality improvements.

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

## Documentation

- [Architecture](./docs/architecture.md) — Package structure, AI agent, ingestion pipeline, infrastructure
- [Commands](./docs/commands.md) — Full CLI commands reference
- [Deployment](./docs/deployment.md) — Production deployment guide
- [Conventions](./docs/conventions.md) — Formatting, testing, and technical conventions
- [Quality Review](./docs/quality-review.md) — Round-by-round quality comparison framework
- [Evaluation Playbook](./docs/evaluation-playbook.md) — Running and interpreting LangSmith evaluations

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

Auth secrets (required for web login):

```bash
sst secret set AuthSecret <secret>
sst secret set GitHubClientId <id>
sst secret set GitHubClientSecret <secret>
sst secret set AdminEmails <comma-separated-emails>
```

Optional secrets:

```bash
sst secret set LangchainApiKey <key>              # For LangSmith tracing
sst secret set SlackBotToken <token>              # For Slack integration
sst secret set SlackSigningSecret <secret>        # For Slack integration
sst secret set ConversationMaxTurns <number>      # Default: 5
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

## Slack Integration

<!-- TODO: Document Slack app setup and configuration once #7 is complete -->

Slack integration is under development. See [#7](https://github.com/rosinbum/usopc-athlete-support-agent/issues/7) for progress.

## Contributing

1. Create a GitHub issue describing the planned work
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes with tests
4. Run `pnpm test && pnpm typecheck`
5. Format code: `npx prettier --write .`
6. Open a pull request referencing the issue

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

<!-- HOURS:START -->

**Tracked build time:** 57.9 hours

- Method: terminal-activity-based (idle cutoff: 10 min)
- Last updated: 2026-02-17T02:39:34.335Z
<!-- HOURS:END -->

## License

Proprietary. All rights reserved.
