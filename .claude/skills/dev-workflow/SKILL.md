---
name: dev-workflow
description: Shared implementation workflow — explores code, plans, scaffolds tests, implements, runs quality checks, and optionally opens a draft PR.
argument-hint: <issue-number>
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(cd *), Bash(gh *), Bash(pnpm *), Bash(npx prettier *), Bash(ls *), Read, Edit, Write, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet, EnterPlanMode, ExitPlanMode, mcp__github__create_pull_request
---

# Implementation Workflow

You are implementing a GitHub issue in an existing worktree. The issue number is: `$ARGUMENTS`. You should already be in the worktree directory.

If no issue number is provided, ask the user for one and stop.

## Step 1: Explore the codebase

Run `gh issue view $ARGUMENTS --json number,title,body,labels,state` to get the issue details. Read the issue body carefully. Based on the issue description:

1. Use the /docs first approach to identify relevant concepts and areas of the codebase
2. Identify which packages and files are likely involved
3. Use Glob and Grep to find relevant existing code
4. Read key files to understand the current architecture and patterns
5. Identify test patterns used in nearby test files

Summarize what you found:

```
Relevant code:
  - packages/core/src/agent/nodes/classifier.ts — current classifier logic
  - packages/core/src/agent/nodes/classifier.test.ts — existing tests
  - packages/shared/src/entities.ts — shared types
```

## Step 2: Plan the implementation

Enter plan mode to design the implementation approach. The plan should include:

1. Files to create or modify
2. Key changes in each file
3. Test coverage plan (what test cases to add)
4. Any dependencies or order-of-operations concerns

Present the plan to the user for approval before writing code.

## Step 3: Scaffold test files

For each new source file planned, create a co-located test file (`*.test.ts`) with:

- The correct import path
- Describe blocks matching the planned functionality
- Placeholder `it()` blocks for each planned test case
- Proper Vitest mock setup following project conventions (inline `vi.mock()` factories)

For existing test files that need new tests, add the new describe/it blocks.

## Step 4: Implement

Work through the plan, implementing each piece:

1. Create or modify source files
2. Fill in test implementations
3. Run tests after each significant change: `pnpm --filter @usopc/<pkg> test`
4. Fix any test failures before moving on

Use TaskCreate to track implementation progress with individual tasks for each piece of work.

## Step 5: Format and stage

1. Format all changed files: `npx prettier --write <files>`
2. Stage all changed files with `git add` (specific files, not `-A`)

## Step 6: Quality checks

Read the file `.claude/skills/pr-ready/SKILL.md` and execute all steps (Step 1 through Step 7).

If any checks fail, fix the issues and re-run until the PR Readiness Report shows all checks passed.

## Step 7: Confidence assessment and draft PR

After all quality checks pass, assess your confidence across these four criteria:

1. **Solves the issue** — Does the implementation fully address what the issue describes?
2. **No regressions** — Are all existing tests still passing? Were edge cases considered?
3. **No anti-patterns** — Does the code follow project conventions (ESM `.js` imports, Vitest patterns, factory functions, no singletons duplicated across packages)?
4. **Good quality** — Is the code clean, minimal, well-tested, and appropriately scoped?

Rate each criterion as a percentage. If the **average confidence is >= 80%**, proceed automatically. Otherwise, print your assessment and use `AskUserQuestion` to ask the user whether to proceed or iterate.

**If proceeding:**

1. Commit with: `git commit -m "<type>(<scope>): <description> (#<issue>)"`
   - `<type>`: `feat`, `fix`, `refactor`, `test`, `docs` as appropriate
   - `<scope>`: primary package affected (e.g., `web`, `core`, `shared`)
   - Append `Co-Authored-By: Claude <noreply@anthropic.com>` (use the actual model name if known, e.g., "Claude Opus 4.6", "Claude Sonnet 4.6")
2. Push: `git push -u origin <branch>`
3. Open a **draft** PR using `mcp__github__create_pull_request` with `draft: true`:
   - **Title:** `<type>(<scope>): <description>` (under 70 chars)
   - **Body:** Summary bullets, test plan checklist, `Closes #<issue>` footer

Print the PR URL for the user.

## Important notes

- **Follow project conventions**: ESM imports with `.js` extensions, Vitest with co-located tests, inline `vi.mock()` factories.
- **All work happens in the worktree directory**, not the main repo.
- If the issue description is vague, use AskUserQuestion to clarify before implementing.
- **Do NOT close the issue.** The PR will close it when merged.
