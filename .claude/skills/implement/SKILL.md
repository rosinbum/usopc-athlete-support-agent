---
name: implement
description: Full issue-to-code workflow — creates worktree, installs deps, explores code, scaffolds tests, and tracks implementation progress.
argument-hint: <issue-number>
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *), Bash(pnpm *), Bash(cp *), Bash(npx prettier *), Bash(ls *), Read, Edit, Write, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet, EnterPlanMode, ExitPlanMode
---

# Issue-to-Code Implementation Workflow

You are implementing a GitHub issue end-to-end. The issue number is: `$ARGUMENTS`.

If no issue number is provided, ask the user for one and stop.

## Step 1: Fetch issue details

Run `gh issue view $ARGUMENTS --json number,title,body,labels,state` to get the issue details.

If the issue doesn't exist or is closed, warn the user and stop.

Print a brief summary of the issue for the user to confirm scope.

## Step 2: Set up worktree

### 2a: Determine the main repo root
Use `git worktree list` to find the main repo root (first entry).

### 2b: Check if worktree already exists
If `../usopc-issue-<number>` already exists, ask the user if they want to use the existing worktree or recreate it.

### 2c: Create worktree
Derive a branch name from the issue title: `feat/<kebab-case-summary>` (max 50 chars).

```bash
git fetch origin main
git worktree add <path> -b <branch> origin/main
```

### 2d: Install and set up
```bash
cd <worktree-path> && pnpm install
```

Copy the hook script:
```bash
cp <main-repo>/scripts/update-hours.mjs <worktree-path>/scripts/update-hours.mjs
```

Print:
```
Worktree ready: <path> (branch: <branch>)
```

## Step 3: Explore the codebase

Read the issue body carefully. Based on the issue description:

1. Identify which packages and files are likely involved
2. Use Glob and Grep to find relevant existing code
3. Read key files to understand the current architecture and patterns
4. Identify test patterns used in nearby test files

Summarize what you found:
```
Relevant code:
  - packages/core/src/agent/nodes/classifier.ts — current classifier logic
  - packages/core/src/agent/nodes/classifier.test.ts — existing tests
  - packages/shared/src/entities.ts — shared types
```

## Step 4: Plan the implementation

Enter plan mode to design the implementation approach. The plan should include:

1. Files to create or modify
2. Key changes in each file
3. Test coverage plan (what test cases to add)
4. Any dependencies or order-of-operations concerns

Present the plan to the user for approval before writing code.

## Step 5: Scaffold test files

For each new source file planned, create a co-located test file (`*.test.ts`) with:
- The correct import path
- Describe blocks matching the planned functionality
- Placeholder `it()` blocks for each planned test case
- Proper Vitest mock setup following project conventions (inline `vi.mock()` factories)

For existing test files that need new tests, add the new describe/it blocks.

## Step 6: Implement

Work through the plan, implementing each piece:

1. Create or modify source files
2. Fill in test implementations
3. Run tests after each significant change: `pnpm --filter @usopc/<pkg> test`
4. Fix any test failures before moving on

Use TaskCreate to track implementation progress with individual tasks for each piece of work.

## Step 7: Quality checks

After implementation is complete:

1. Run tests for all affected packages: `pnpm --filter @usopc/<pkg> test`
2. Run typecheck: `pnpm --filter @usopc/<pkg> typecheck`
3. Format all changed files: `npx prettier --write <files>`
4. If agent code was modified, suggest running `/eval-check`

## Step 8: Stage and summarize

Stage all changed files with `git add` (specific files, not `-A`).

Print a summary:
```
## Implementation Summary

Issue: #<number> — <title>
Branch: <branch-name>
Worktree: <path>

### Files changed
  - packages/core/src/agent/nodes/newNode.ts (new)
  - packages/core/src/agent/nodes/newNode.test.ts (new)
  - packages/core/src/agent/graph.ts (modified)

### Test results
  @usopc/core   PASS (24 tests)

### Next steps
  1. Review changes: git diff --staged
  2. Commit: git commit -m "feat: <description> (#<issue>)"
  3. Push: git push -u origin <branch>
  4. Create PR: gh pr create
```

## Important notes

- **Do NOT commit or push.** Stage changes and let the user decide when to commit.
- **Do NOT close the issue.** The PR will close it when merged.
- **Follow project conventions**: ESM imports with `.js` extensions, Vitest with co-located tests, inline `vi.mock()` factories.
- **All work happens in the worktree directory**, not the main repo.
- If the issue description is vague, use AskUserQuestion to clarify before implementing.
