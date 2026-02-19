---
name: resolve-readme
description: Resolve the recurring README.md merge conflict caused by the hours timestamp pre-commit hook.
argument-hint: "<pr-number>"
disable-model-invocation: true
allowed-tools: Bash(git *), Read, Grep, mcp__github__pull_request_read, mcp__github__update_pull_request_branch, mcp__github__get_file_contents, mcp__github__create_or_update_file
---

# Resolve README.md Merge Conflict

The pre-commit hook (`scripts/update-hours.mjs`) updates tracked hours and timestamps in `README.md` on every commit. Since both `main` and feature branches update these values independently, merge conflicts occur on nearly every PR.

**Resolution rule:** Accept `main`'s version of README.md (it has the latest aggregate hours), then let the pre-commit hook recalculate on the next commit.

The argument is a PR number (e.g., `/resolve-readme 252`). If no argument is provided, detect the PR from the current branch.

## Constants

- **Owner:** `rosinbum`
- **Repo:** `usopc-athlete-support-agent`

## Step 1: Identify the PR

If a PR number was provided as an argument, use it directly.

If no PR number was provided, detect it from the current branch:

```bash
git branch --show-current
```

Then find the PR for that branch using `mcp__github__pull_request_read` (method: `get`) or by searching. If no PR is found, inform the user and stop.

## Step 2: Check if the PR has a merge conflict

Use `mcp__github__pull_request_read` with method `get` to fetch the PR details. Check the `mergeable` and `mergeable_state` fields.

If the PR is already mergeable (no conflict), inform the user and stop.

## Step 3: Get README.md from main

Use `mcp__github__get_file_contents` to fetch `README.md` from the `main` branch. Save the content and the SHA.

## Step 4: Get README.md SHA from the PR branch

Use `mcp__github__pull_request_read` with method `get` to find the PR's head branch name.

Use `mcp__github__get_file_contents` to fetch `README.md` from the PR's head branch. Save the SHA (needed for the update).

## Step 5: Overwrite the PR branch's README.md with main's version

Use `mcp__github__create_or_update_file` to push main's README.md content to the PR branch:

- **path:** `README.md`
- **branch:** the PR's head branch
- **sha:** the SHA from Step 4 (the PR branch's current README.md blob SHA)
- **content:** the content from Step 3 (main's README.md)
- **message:** `chore: resolve README.md hours conflict with main`

## Step 6: Verify

Use `mcp__github__pull_request_read` with method `get` to confirm the PR is now mergeable (it may take a moment for GitHub to recompute).

## Step 7: Report

Print a summary:

```
README.md conflict resolved on PR #<number>.
Pushed main's README.md to <branch> — the pre-commit hook will recalculate hours on the next commit.
```

If the PR still shows as not mergeable, note that GitHub may need a few seconds to recompute, or there may be other conflicted files.
