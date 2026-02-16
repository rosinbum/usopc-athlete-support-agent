---
name: worktree
description: Smart worktree management — create, list, and clean up git worktrees with automatic gotcha handling (pnpm install, hook script copy, issue validation).
argument-hint: <create|list|cleanup> [issue-number]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(pnpm install), Bash(cp *), Bash(gh issue view *), Bash(gh repo view *), Bash(ls *), Glob, Read
---

# Smart Worktree Management

You are managing git worktrees for the USOPC Athlete Support Agent monorepo. The argument is: `$ARGUMENTS`.

Parse the argument to determine the subcommand:
- `create <issue-number>` — Create a new worktree for an issue
- `list` — List active worktrees with status
- `cleanup` — Remove worktrees whose branches have been merged

If no subcommand is provided or the argument is empty, print the usage:
```
Usage: /worktree <command> [args]
  create <issue-number>  — Create worktree for a GitHub issue
  list                   — List active worktrees with branch status
  cleanup                — Remove merged worktrees and prune refs
```

## Subcommand: `create <issue-number>`

### Step 1: Validate the issue exists

Run `gh issue view <issue-number> --json number,title,state` to confirm the issue exists and is open. If the issue doesn't exist or is closed, warn the user and stop.

### Step 2: Determine paths

- Get the main repo root: `git rev-parse --show-toplevel` (if in a worktree, use `git worktree list` to find the main repo)
- Worktree path: `../usopc-issue-<number>` relative to the main repo (i.e., a sibling directory)
- Derive a short branch name from the issue title: `feat/<kebab-case-summary>` (max 50 chars, lowercase, hyphens only)

### Step 3: Fetch latest main

Run `git fetch origin main` to ensure we branch from the latest main.

### Step 4: Create the worktree

```bash
git worktree add <worktree-path> -b <branch-name> origin/main
```

If the worktree path already exists, warn and stop.

### Step 5: Install dependencies

```bash
cd <worktree-path> && pnpm install
```

### Step 6: Copy hook script

The main repo has an untracked `scripts/update-hours.mjs` needed by a pre-commit hook. Copy it:

```bash
cp <main-repo>/scripts/update-hours.mjs <worktree-path>/scripts/update-hours.mjs
```

Create the `scripts/` directory in the worktree first if needed (it should already exist from the repo, but be safe).

### Step 7: Print summary

```
Worktree created:
  Path:   <worktree-path>
  Branch: <branch-name>
  Issue:  #<number> — <title>

Dependencies installed. Hook script copied.
Navigate with: cd <worktree-path>
```

## Subcommand: `list`

### Step 1: List worktrees

Run `git worktree list` and parse the output.

### Step 2: For each worktree (excluding bare/main)

- Show the path, branch name
- Run `git -C <path> log --oneline -1` for latest commit
- Run `git -C <path> rev-list --left-right --count origin/main...<branch>` for ahead/behind status

### Step 3: Print formatted table

```
Active worktrees:
  ../usopc-issue-42  feat/add-auth        +3 / -0  (latest: abc1234 Add auth middleware)
  ../usopc-issue-55  fix/query-perf       +1 / -2  (latest: def5678 Fix slow query)
```

## Subcommand: `cleanup`

### Step 1: List worktrees

Run `git worktree list` and identify non-main worktrees.

### Step 2: Check each branch

For each worktree branch, check if it has been merged into `origin/main`:
```bash
git branch --merged origin/main | grep <branch-name>
```

### Step 3: Remove merged worktrees

For each merged worktree, remove it:
```bash
git worktree remove <path>
```

Print which worktrees were removed.

### Step 4: Prune and clean up

```bash
git worktree prune
git fetch --prune origin
```

### Step 5: Print summary

```
Cleaned up:
  Removed: ../usopc-issue-42 (feat/add-auth — merged)
  Removed: ../usopc-issue-55 (fix/query-perf — merged)
  Pruned stale worktree references.
```

If no worktrees were eligible for cleanup, say so.

## Important notes

- Always use absolute paths when running git commands to avoid confusion between worktree and main repo.
- The main repo root can be found via `git worktree list` — it's the first entry (the one without `[branch]` or with `[main]`).
- If `scripts/update-hours.mjs` doesn't exist in the main repo, skip the copy step and warn the user.
