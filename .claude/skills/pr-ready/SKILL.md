---
name: pr-ready
description: Pre-PR quality gate — runs tests, typecheck, and prettier for changed packages. Reports pass/fail with actionable fix commands.
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(git diff *), Bash(git log *), Bash(git fetch *), Bash(git branch *), Bash(pnpm --filter *), Bash(pnpm test *), Bash(pnpm typecheck *), Bash(npx prettier *), Read, Glob, Grep, Agent
---

# Pre-PR Quality Gate

Run all quality checks for the current branch before creating a pull request. This does NOT commit or push — it only validates.

## Step 1: Determine context

Run `git branch --show-current` to get the current branch. If on `main`, warn the user and stop — they should be on a feature branch.

Run `git fetch origin main` to ensure we have the latest main.

## Step 2: Detect changed files and packages

Get the list of changed files compared to `origin/main`:

```bash
git diff --name-only origin/main...HEAD
```

Also include any unstaged/staged changes:

```bash
git diff --name-only
git diff --name-only --staged
```

Combine all changed files (deduplicate).

Map changed files to packages by path prefix:

- `apps/web/` → `@usopc/web`
- `apps/slack/` → `@usopc/slack`
- `packages/core/` → `@usopc/core`
- `packages/shared/` → `@usopc/shared`
- `packages/ingestion/` → `@usopc/ingestion`
- `packages/evals/` → `@usopc/evals`

If no packages were changed (only root files like CLAUDE.md, docs, etc.), skip package-specific checks and just run prettier.

## Step 3: Run tests, typecheck, and prettier in parallel

**When only 1 package changed**, run checks sequentially (tests → typecheck → prettier) — sub-agents aren't worth the overhead.

**When 2+ packages changed**, spawn parallel sub-agents to run checks simultaneously. In a **single message**, spawn one Agent per package plus one for prettier. Use `subagent_type: "general-purpose"` for each:

**Per-package agent prompt:**

```
Run quality checks for package @usopc/<pkg> in the directory <worktree-or-repo-path>.

1. Run tests: cd <path> && pnpm --filter @usopc/<pkg> test
2. Run typecheck: cd <path> && pnpm --filter @usopc/<pkg> typecheck

Return a structured result:
  Package: @usopc/<pkg>
  Tests: PASS or FAIL (with failure summary if failed)
  Typecheck: PASS or FAIL (with error summary if failed)
```

**Prettier agent prompt:**

```
Run prettier check on these files in <worktree-or-repo-path>:
<list of changed .ts/.tsx/.js/.jsx/.json/.md files>

Command: cd <path> && npx prettier --check <files>

Return:
  Prettier: PASS or FAIL (list unformatted files if failed)
```

After all agents complete, collect their results into the summary table in Step 5.

## Step 4: (reserved — merged into Step 3)

## Step 5: (reserved — merged into Step 3)

## Step 6: Agent code warning

If any changed files are under `packages/core/src/agent/`, print a warning:

```
Agent code was modified. Consider running /eval-check to verify quality.
```

## Step 7: Print summary

Print a clear pass/fail summary:

```
## PR Readiness Report

Branch: feat/my-feature (vs origin/main)
Changed packages: @usopc/core, @usopc/shared

### Tests
  @usopc/core     PASS
  @usopc/shared   PASS

### Typecheck
  @usopc/core     PASS
  @usopc/shared   PASS

### Formatting
  PASS (all files formatted)

---
All checks passed. Ready to create PR.
```

If any checks failed, print actionable fix commands:

```
### Failures

Tests:
  @usopc/core     FAIL
    Fix: pnpm --filter @usopc/core test

Formatting:
  FAIL (3 files)
    Fix: npx prettier --write src/foo.ts src/bar.ts src/baz.ts

---
Fix the above issues before creating a PR.
```

## Important notes

- For 2+ packages, run tests and typechecks in parallel via sub-agents. For 1 package, run sequentially.
- Do NOT run `pnpm test` (root-level) — only run for changed packages to save time.
- Do NOT commit, push, or modify any files. This is a read-only validation.
- If a package has no test script or typecheck script, skip it and note that in the output.
