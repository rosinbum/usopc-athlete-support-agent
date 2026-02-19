---
name: fix-bugs
description: Autonomous bug-fixing orchestrator — fetches open bug issues and spawns parallel bug-fixer sub-agents.
argument-hint: [--limit N] [--dry-run]
disable-model-invocation: true
allowed-tools: Task, mcp__github__list_issues, mcp__github__issue_read
---

# Autonomous Bug-Fixing Orchestrator

The argument string is: `$ARGUMENTS`

## Step 1: Parse arguments

Extract from `$ARGUMENTS`:

- `--limit N` — maximum number of issues to process (default: 5)
- `--dry-run` — list issues without spawning agents

## Step 2: Fetch open bug issues

Call `mcp__github__list_issues` with:

- `owner`: `rosinbum`
- `repo`: `usopc-athlete-support-agent`
- `state`: `OPEN`
- `labels`: `["bug"]`

From the results, filter out any issue whose labels array includes `"deferred"`. This gives the list of actionable open bugs.

## Step 3: Apply limit and print list

Take the first `--limit` issues from the result (default 5).

Print:

```
Bug issues to process (N total):
  #123 — Issue title
  #124 — Another issue
  ...
```

If there are no issues, print "No open bug issues found." and stop.

## Step 4: Dry-run check

If `--dry-run` was specified, stop here and print:

```
Dry run complete. No agents spawned.
```

## Step 5: Spawn parallel bug-fixer agents

For each issue in the list, spawn a Task with `subagent_type: "bug-fixer"`.

**Critical: spawn ALL agents in a single message with multiple parallel Task calls.** Do not await each one before spawning the next.

Each Task prompt should be exactly:

```
Fix GitHub issue #<number>: <title>

Issue number: <number>
```

## Step 6: Collect results and report

After all tasks complete, print a final report summarizing outcomes:

```
## Bug-Fix Run Report

✓ #123 — PR created: https://github.com/rosinbum/usopc-athlete-support-agent/pull/...
~ #124 — Commented (low confidence: 35%)
✗ #125 — Skipped (open PR already exists: #130)
✗ #126 — Failed: <brief error summary>

Total: 1 PR created, 1 commented, 1 skipped, 1 failed
```

Parse each task result for the structured `RESULT issue=#<number>` block that bug-fixer agents emit.
