---
name: implement
description: Full issue-to-code workflow — creates worktree, installs deps, explores code, scaffolds tests, and tracks implementation progress.
argument-hint: <issue-number>
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(cd *), Bash(gh *), Bash(pnpm *), Bash(cp *), Bash(npx prettier *), Bash(ls *), Read, Edit, Write, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet, EnterPlanMode, ExitPlanMode, mcp__github__create_pull_request
---

# Issue-to-Code Implementation Workflow

You are implementing a GitHub issue end-to-end. The issue number is: `$ARGUMENTS`.

If no issue number is provided, ask the user for one and stop.

## Step 1: Fetch issue details

Run `gh issue view $ARGUMENTS --json number,title,body,labels,state` to get the issue details.

If the issue doesn't exist or is closed, warn the user and stop.

Print a brief summary of the issue for the user to confirm scope.

## Step 2: Set up worktree

Read the file `.claude/skills/worktree/SKILL.md` and follow the **`create` subcommand** steps (Steps 1-7) for issue `$ARGUMENTS`.

## Step 3: Run the implementation workflow

Read the file `.claude/skills/dev-workflow/SKILL.md` and execute all steps (Step 1 through Step 7). The issue number is `$ARGUMENTS`.

## Important notes

- **Do NOT create a new issue.** You are implementing an existing issue — update it if the scope changes, never create a duplicate.
- **Do NOT close the issue.** The PR will close it when merged.
- **Follow project conventions**: ESM imports with `.js` extensions, Vitest with co-located tests, inline `vi.mock()` factories.
- **All work happens in the worktree directory**, not the main repo.
- If the issue description is vague, use AskUserQuestion to clarify before implementing.
