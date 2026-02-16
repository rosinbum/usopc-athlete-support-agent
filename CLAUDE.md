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

### Implementation Steps

For any implementation task:

1. Create a GitHub issue describing the planned work **before starting** (`gh issue create`). The issue should cover all implementation, not just tests or cleanup.
2. Create a git worktree with a feature branch off `main` (e.g., `git worktree add ../usopc-issue-<number> -b feat/short-description`)
3. Navigate to the worktree directory and run `pnpm install`
4. Write or update the corresponding `*.test.ts` file alongside the source (tests are co-located in `src/`)
5. Run the relevant tests: `pnpm --filter @usopc/<package> test`
6. Format changed files: `npx prettier --write <files>`
7. Type-check: `pnpm --filter @usopc/<package> typecheck`
8. Commit, push, and open a PR referencing the issue (`gh pr create`)
9. After PR is merged, remove the worktree: `git worktree remove ../usopc-issue-<number>`

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

## Documentation

Detailed documentation is in the `docs/` folder:

- [Architecture](./docs/architecture.md) — Package structure, AI agent (LangGraph), ingestion pipeline, infrastructure (SST)
- [Commands](./docs/commands.md) — Full CLI commands reference
- [Deployment](./docs/deployment.md) — Production deployment guide
- [Conventions](./docs/conventions.md) — Formatting, testing, and technical conventions
- [Quality Review](./docs/quality-review.md) — Round-by-round quality comparison framework
- [Evaluation Playbook](./docs/evaluation-playbook.md) — Running and interpreting LangSmith evaluations

## Quick Reference

### Common Commands

```bash
pnpm dev                              # Start dev servers via SST
pnpm test                             # Run all tests
pnpm --filter @usopc/<pkg> test       # Test single package
pnpm typecheck                        # Type-check all packages
npx prettier --write <files>          # Format files
pnpm --filter @usopc/evals eval       # Run LangSmith evaluations
pnpm --filter @usopc/evals quality:run       # Run quality review scenarios
pnpm --filter @usopc/evals quality:evaluate  # Evaluate quality review results
pnpm --filter @usopc/evals quality:all       # Run + evaluate + setup (combined)
```

### Key Conventions

- **Package manager**: pnpm 9.x with workspaces. Node >= 20 required.
- **Module system**: ESM throughout. Use `.js` extensions in imports.
- **Testing**: Vitest, tests co-located as `*.test.ts` in `src/`.
- **SST secret naming**: PascalCase for SST (`OpenaiApiKey`), SCREAMING_SNAKE_CASE for env vars (`OPENAI_API_KEY`).
- **Scripts needing AWS**: Wrap with `sst shell --` in package.json.

See [docs/conventions.md](./docs/conventions.md) for the full list.
