---
name: pr-ready
description: Pre-PR quality gate — runs tests, typecheck, and prettier for changed packages. Reports pass/fail with actionable fix commands.
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(git diff *), Bash(git log *), Bash(git fetch *), Bash(git branch *), Bash(pnpm --filter *), Bash(pnpm test *), Bash(npx prettier *), Read, Glob, Grep
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

- `apps/api/` → `@usopc/api`
- `apps/web/` → `@usopc/web`
- `apps/slack/` → `@usopc/slack`
- `packages/core/` → `@usopc/core`
- `packages/shared/` → `@usopc/shared`
- `packages/ingestion/` → `@usopc/ingestion`
- `packages/evals/` → `@usopc/evals`

If no packages were changed (only root files like CLAUDE.md, docs, etc.), skip package-specific checks and just run prettier.

## Step 3: Run tests for each changed package

For each affected package, run:

```bash
pnpm --filter @usopc/<pkg> test
```

Track pass/fail for each.

## Step 4: Run typecheck for each changed package

For each affected package, run:

```bash
pnpm --filter @usopc/<pkg> typecheck
```

Track pass/fail for each.

## Step 5: Run prettier check on changed files

Run prettier in check mode on all changed files (only `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md` files):

```bash
npx prettier --check <file1> <file2> ...
```

If prettier fails, record which files need formatting.

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

- Run tests and typechecks sequentially per package to keep output readable.
- Do NOT run `pnpm test` (root-level) — only run for changed packages to save time.
- Do NOT commit, push, or modify any files. This is a read-only validation.
- If a package has no test script or typecheck script, skip it and note that in the output.
