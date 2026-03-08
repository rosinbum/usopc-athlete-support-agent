---
name: dev-workflow
description: Shared implementation workflow — explores code, plans, scaffolds tests, implements, runs quality checks, and optionally opens a draft PR.
argument-hint: <issue-number>
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(cd *), Bash(gh *), Bash(pnpm *), Bash(npx prettier *), Bash(ls *), Read, Edit, Write, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet, EnterPlanMode, ExitPlanMode, mcp__github__create_pull_request
---

# Implementation Workflow

You are implementing a GitHub issue in an existing worktree. The issue number is: `$ARGUMENTS`. You should already be in the worktree directory.

If no issue number is provided, ask the user for one and stop.

## Step 1: Explore the codebase

Run `gh issue view $ARGUMENTS --json number,title,body,labels,state` to get the issue details. Read the issue body carefully.

**Use a sub-agent for exploration** to keep the main context clean. Spawn an Agent with `subagent_type: "Explore"` and a prompt like:

```
Explore the codebase for issue #<number>: <title>

<paste the issue body here>

Find and summarize:
1. Which packages and files are involved
2. Current architecture and patterns in those files
3. Existing test patterns in nearby test files
4. Any related code that would need updating

Return a concise summary with file paths and line numbers. Do NOT return full file contents — just key signatures, patterns, and relevant snippets (under 5 lines each).
```

The sub-agent will return a focused summary without flooding the main context with raw file contents.

After receiving the summary, print it for the user:

```
Relevant code:
  - packages/core/src/agent/nodes/classifier.ts:15 — current classifier logic
  - packages/core/src/agent/nodes/classifier.test.ts — existing tests (uses vi.mock inline pattern)
  - packages/shared/src/entities.ts:42 — shared types
```

## Step 2: Plan the implementation

Enter plan mode to design the implementation approach. Keep the plan focused — 10 bullet points or fewer. Do NOT expand scope beyond what the issue describes. The plan should include:

1. Files to create or modify
2. Key changes in each file
3. Test coverage plan (what test cases to add)
4. Any dependencies or order-of-operations concerns

**HARD STOP: Present the plan to the user and use `AskUserQuestion` to ask for explicit approval.** Do NOT proceed to Step 3 until the user says "go", "approved", "looks good", or similar. Do NOT self-approve. If the user requests changes, revise the plan and ask again.

## Step 3: Write tests first (TDD)

Write **real test assertions before implementation code**. Tests are the feedback loop that prevents wrong-approach detours.

For each new source file planned, create a co-located test file (`*.test.ts`) with:

- The correct import path (even though the source file may not exist yet)
- Proper Vitest mock setup following project conventions (inline `vi.mock()` factories)
- **Real assertions** that capture the expected behavior described in the issue — not placeholder `it.todo()` blocks

For existing test files, add new describe/it blocks with real assertions.

**What "real assertions" means:**
- If adding a function, test its expected inputs → outputs
- If fixing a bug, write a test that reproduces the bug (expects the correct behavior)
- If adding an API route, test the expected response shape and status codes
- If modifying state, test the expected state transitions

**After writing tests, run them:**

```bash
pnpm --filter @usopc/<pkg> test
```

Tests should **fail** at this point (since the implementation doesn't exist yet). If they pass, your tests aren't asserting anything meaningful — tighten them. If they fail for the wrong reason (e.g., import errors for a file that doesn't exist yet), create a minimal stub file that exports the expected interface but throws `new Error("Not implemented")`.

## Step 4: Implement

Examine the approved plan to determine how many **independent** packages are affected.

### Single-package changes (or tightly coupled cross-package changes)

Work through the plan in a tight test-driven loop:

1. Implement the minimal code change to make the next failing test pass
2. Run tests: `pnpm --filter @usopc/<pkg> test`
3. If tests pass, move to the next piece. If tests fail, **read the failure output carefully and fix based on what the test tells you** — do NOT explore broadly or investigate unrelated code
4. Repeat until all tests are green

**Key rule:** Let test output guide your fixes. If a test says `expected "foo" but received "bar"`, fix the code that produces "bar" — don't go searching the codebase for why "bar" might be correct. Tests are the source of truth for expected behavior.

### Multi-package changes (2+ independent packages)

When the plan touches multiple packages that can be implemented independently (e.g., a new shared utility + a new API route + a new UI component), use **parallel sub-agents** to speed up implementation:

1. **Assign file ownership**: Each sub-agent owns specific files/directories. No two agents should modify the same file.
2. **Spawn parallel Agent calls** in a single message, one per package workstream. Use `subagent_type: "agent-teams:team-implementer"` for each:

```
Implement the following in <worktree-path>:

Package: @usopc/<pkg>
Your owned files (ONLY modify these):
  - packages/<pkg>/src/newFile.ts (create)
  - packages/<pkg>/src/newFile.test.ts (create)
  - packages/<pkg>/src/existing.ts (modify)

Plan:
<paste the relevant subset of the approved plan>

Conventions:
- ESM imports with .js extensions
- Vitest with co-located tests, inline vi.mock() factories
- Run tests after implementation: pnpm --filter @usopc/<pkg> test

Return: list of files created/modified, test results (pass/fail), and any issues encountered.
```

3. **Collect results**: After all agents complete, review their outputs. If any agent reports test failures, fix them in the main context.
4. **Integration check**: If packages depend on each other (e.g., shared exports used by core), run tests across all affected packages to catch integration issues.

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
