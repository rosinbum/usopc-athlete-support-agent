# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

USOPC Athlete Support Agent — an AI-powered governance and compliance assistant for U.S. Olympic and Paralympic athletes. Built as a serverless monorepo deployed to AWS via SST v3.

## Workflow

**Never commit directly to `main`.** Always create a feature branch and open a pull request.

**Prefer git worktrees** for parallel development. Worktrees allow multiple branches to be checked out simultaneously in separate directories, enabling work on multiple issues without stashing or switching branches.

### Git Worktrees

```bash
# Create a worktree for a new feature branch
git worktree add ../usopc-issue-<number> -b feat/short-description

# Create a worktree for an existing branch
git worktree add ../usopc-issue-<number> existing-branch-name

# List all worktrees
git worktree list

# Remove a worktree (after merging)
git worktree remove ../usopc-issue-<number>

# Prune stale worktree references
git worktree prune
```

Worktree naming convention: `../usopc-issue-<number>` (e.g., `../usopc-issue-23`). This keeps worktrees at the same directory level as the main repo for easy navigation.

**Important**: After creating a worktree, run `pnpm install` in the new directory to set up `node_modules`.

### Worktree Gotchas

- **Copy `update-hours.mjs`**: The main repo has an untracked `scripts/update-hours.mjs` used by a pre-commit hook. Copy it to new worktrees or commits will fail: `cp /path/to/main/scripts/update-hours.mjs /path/to/worktree/scripts/`
- **README merge conflicts**: The hours timestamp in README.md causes merge conflicts on nearly every PR. Resolve by keeping the later timestamp (from `origin/main`).
- **`gh pr merge` from worktrees**: Fails with "main is already used by worktree". Use `--repo owner/repo` flag or run from the main repo directory.

### Implementation Steps

For any implementation task:

1. **If no issue exists**, create a GitHub issue describing the planned work **before starting**. If an issue already exists (e.g., you're running `/implement <number>`), **update** the existing issue to reflect the planned scope — do NOT create a duplicate.
2. Create a git worktree with a feature branch off `main` (e.g., `git worktree add ../usopc-issue-<number> -b feat/short-description`)
3. Navigate to the worktree directory and run `pnpm install`
4. Write or update the corresponding `*.test.ts` file alongside the source (tests are co-located in `src/`)
5. Run the relevant tests: `pnpm --filter @usopc/<package> test`
6. Format changed files: `npx prettier --write <files>`
7. Type-check **all packages**: `pnpm typecheck` (CI runs this across the full monorepo — never use `--filter` for typecheck)
8. Commit, push, and open a PR referencing the issue (`gh pr create`)
9. After PR is merged, remove the worktree: `git worktree remove ../usopc-issue-<number>`

**Workflow skills** automate these steps — see [Workflow Skills](#workflow-skills) below.

**Keeping issues and PRs accurate:**

- Issue and PR descriptions must reflect the full scope of work — new features, architectural changes, bug fixes, tests, and any other modifications. Do not omit implementation work.
- If the plan changes during implementation (additional fixes, scope adjustments, new files added), update the GitHub issue to match (`gh issue edit`).
- PR descriptions should clearly separate categories of changes (e.g., "Implementation", "Tests", "Formatting") so reviewers can understand what was built vs. what was cleaned up.

## Issue Tracking

Proactively create GitHub issues (`gh issue create`) whenever you encounter:

- **Unimplemented features**: TODOs, placeholder responses, hardcoded stubs, or any code path that is clearly incomplete.
- **Future feature ideas**: When a conversation surfaces a new idea or improvement that isn't being implemented right now, capture it as an issue so it isn't lost.

Each issue should include a clear title, a description of what needs to be done (with relevant file paths), and a priority note if obvious. Label issues with `enhancement` or `bug` as appropriate. If the new issue depends on or relates to existing issues, reference them (e.g., "Depends on #5").

When writing code that is intentionally incomplete or deferred, add a `// TODO:` comment in the source with a short explanation and reference the GitHub issue number (e.g., `// TODO: Wire to agent graph (#5)`). This keeps the codebase searchable and links inline markers to tracked work.

## Monorepo Structure

```
apps/
  api/          # tRPC API server (Lambda)
  web/          # Next.js chat UI
  slack/        # Slack bot (Lambda)
packages/
  core/         # LangGraph agent, tools, services
  shared/       # DB pool, entities, logger, validation, circuit breaker
  ingestion/    # Document ingestion pipeline, source discovery
  evals/        # LangSmith evaluations and quality reviews
```

## Documentation

Detailed documentation is in the `docs/` folder:

- [Architecture](./docs/architecture.md) — Package structure, AI agent (LangGraph), ingestion pipeline, infrastructure (SST)
- [Commands](./docs/commands.md) — Full CLI commands reference
- [Deployment](./docs/deployment.md) — Production deployment guide
- [Conventions](./docs/conventions.md) — Formatting, testing, and technical conventions
- [Evaluation Metrics](./docs/evaluation-metrics.md) — Scoring rubric, failure taxonomy, and evaluation criteria
- [Evaluation Playbook](./docs/evaluation-playbook.md) — Running quality review rounds and configuring online evaluators
- [Tech Debt](./docs/tech-debt.md) — Known technical debt and prioritized fixes

## Quick Reference

### Common Commands

```bash
pnpm dev                              # Start dev servers via SST
pnpm test                             # Run all tests
pnpm --filter @usopc/<pkg> test       # Test single package
pnpm typecheck                        # Type-check all packages
npx prettier --write <files>          # Format files
pnpm db:up                            # Start local PostgreSQL with pgvector
pnpm db:migrate                       # Run database migrations
pnpm db:down                          # Stop local database
pnpm --filter @usopc/ingestion discovery:run  # Run source discovery pipeline
pnpm --filter @usopc/evals eval       # Run LangSmith evaluations
pnpm --filter @usopc/evals quality:seed      # Seed quality review dataset to LangSmith
pnpm --filter @usopc/evals quality:run       # Run quality review scenarios
```

### Key Conventions

- **Package manager**: pnpm 9.x with workspaces. Node >= 20 required.
- **Module system**: ESM throughout. Use `.js` extensions in imports.
- **Testing**: Vitest, tests co-located as `*.test.ts` in `src/`.
- **SST secret naming**: PascalCase for SST (`OpenaiApiKey`), SCREAMING_SNAKE_CASE for env vars (`OPENAI_API_KEY`).
- **Scripts needing AWS**: Wrap with `sst shell --` in package.json.
- **Node factory pattern**: LLM-calling graph nodes use factory functions (`createXxxNode(model)`) that capture a shared `ChatAnthropic` instance via closure. Use `createAgentModels()` from `config/modelFactory.ts` to construct models; never call `new ChatAnthropic()` directly in nodes. See [Architecture — Model Instance Management](./docs/architecture.md#model-instance-management).

### Testing Gotchas

- **Vitest mock hoisting**: Declare `vi.mock()` with inline factory functions, then use `vi.mocked()` after imports to get typed mocks. Don't declare `const mockFn = vi.fn()` above `vi.mock()` — hoisting causes "Cannot access before initialization" errors.
- **Web test paths**: File paths for `pnpm --filter @usopc/web test` don't include `src/` prefix (e.g., `components/sources/...` not `src/components/...`).
- **`vi.clearAllMocks()` clears mock results**: Access `MockConstructor.mock.results[0]` _after_ the constructor is called in your test, not before — `clearAllMocks` empties the results array.

### CI Gotchas

- **Prettier checks all files**: CI runs prettier on the entire repo, not just changed files. Unformatted files on `main` will fail your PR. Fix with `npx prettier --write <file>` and include in your commit.
- **`sst.config.ts` type errors in worktrees**: Expected — `.sst/platform/config.d.ts` is generated at runtime by `sst dev`. Ignore these diagnostics.

See [docs/conventions.md](./docs/conventions.md) for the full list.

## Workflow Skills

Custom Claude Code skills that automate the development workflow. Use these instead of running the manual steps above.

| Skill                      | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `/worktree create <issue>` | Create a worktree for an issue — handles deps, hook script copy, branch naming                   |
| `/worktree list`           | List active worktrees with ahead/behind status                                                   |
| `/worktree cleanup`        | Remove worktrees for merged branches, prune refs                                                 |
| `/pr-ready`                | Pre-PR quality gate — tests, typecheck, prettier for changed packages                            |
| `/eval-check`              | Run agent evals after core code changes (fast + optional LLM evals)                              |
| `/implement <issue>`       | Full issue-to-code workflow — worktree setup, code exploration, test scaffolding, implementation |
| `/address-pr-comments`     | Address review comments on the current PR — fetches comments, applies fixes, updates PR          |
| `/resolve-readme`          | Resolve the recurring README.md merge conflict caused by the hours timestamp pre-commit hook     |
| `/fix-bugs [--limit N] [--dry-run]` | Autonomous bug-fixing — fetches open bug issues and spawns parallel bug-fixer agents  |

### Sub-Agents

Specialized sub-agents in `.claude/agents/` provide deep domain expertise. Claude Code auto-discovers them — they activate when working in their respective areas.

| Agent                | Scope                          | When to Use                                                                                   |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `langgraph-expert`   | `packages/core/src/agent/`     | Modifying graph topology, nodes, edges, state fields, feature flags, or runner config         |
| `eval-specialist`    | `packages/evals/`              | Writing evaluators, updating datasets, running quality reviews, configuring online evaluators |
| `sst-architect`      | `sst.config.ts`, AWS resources | Adding/modifying infrastructure, secrets, Lambda config, DynamoDB entities, CI/CD workflows   |
| `frontend-architect` | `apps/web/`                    | Building UI components, admin pages, API routes, auth flows, or data fetching hooks           |
| `bug-fixer`          | Any package                    | Spawned by `/fix-bugs` — verifies issue, scopes bug, assesses confidence, implements fix, opens PR |

### Hooks

Five PostToolUse hooks fire automatically:

- **Agent-change guard** — When `Edit` or `Write` modifies a file in `packages/core/src/agent/`, prints a reminder to run `/eval-check`.
- **Test-coverage reminder** — When `Write` creates a new `.ts` file in `src/` without a corresponding `.test.ts`, prints a reminder to add tests.
- **State-field guard** — When `Edit` modifies `packages/core/src/agent/state.ts`, warns to update `makeState`/state factories across `core`, `evals`, `web`, and `ingestion`.
- **Shared-package typecheck reminder** — When `Edit` or `Write` modifies any file in `packages/shared/src/`, reminds to run `pnpm typecheck` (full monorepo).
- **Migration review reminder** — When `Write` creates a file in any `migrations/` directory, reminds to review for reversibility and index impact.

Hook scripts live in `.claude/hooks/` and are registered in `.claude/settings.json`.
