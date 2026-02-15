---
name: address-pr-comments
description: Address PR review comments by evaluating suggestions, making code changes when warranted, replying to each thread, and resolving addressed threads.
argument-hint: [PR-number]
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(git *), Bash(gh *), Bash(npx prettier *), mcp__github__pull_request_read, mcp__github__add_issue_comment
---

# Address PR Review Comments

You are processing review comments on a pull request. The PR number is provided as the argument: `$ARGUMENTS`.

## Step 1: Determine repo context

Run `gh repo view --json owner,name` to get the owner and repo name for MCP tool calls.

Determine the current branch with `git branch --show-current`. Ensure you are on the correct feature branch for this PR. If not, warn the user and stop.

## Step 2: Fetch review threads

Use `mcp__github__pull_request_read` with method `get_review_comments` to fetch all review comment threads on the PR.

Paginate if needed (use `perPage: 100`).

## Step 3: Filter threads

Process only threads that are:

- **Not resolved** (`isResolved` is false)
- **Not outdated** (`isOutdated` is false)

If there are no actionable threads, report that and stop.

## Step 4: Evaluate and address each thread

For each unresolved, non-outdated review thread:

### 4a. Read context

- Read the file referenced in the comment at and around the referenced lines (use the `Read` tool with enough surrounding context — at least 20 lines before and after)
- Read the full comment body and any replies in the thread

### 4b. Evaluate the suggestion

Consider:

- **Correctness**: Does the suggestion fix a real bug or prevent a real issue?
- **Clarity**: Does it meaningfully improve readability or maintainability?
- **Safety**: Does it address a security concern or error-handling gap?
- **Project conventions**: Does it align with conventions in `CLAUDE.md` and `docs/conventions.md`?
- **Context**: Is the reviewer missing context that makes the current code correct?

Classify the suggestion as one of:

1. **Apply** — the suggestion is valid and improves the code
2. **Partially apply** — the core idea is right but the exact suggestion needs adjustment
3. **Decline** — the suggestion is incorrect, unnecessary, or would reduce code quality

### 4c. Take action

**If applying or partially applying:**

1. Make the code change using the `Edit` tool
2. Reply to the thread via `gh api` explaining what was changed:
   ```bash
   gh api graphql -f query='
     mutation {
       addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "THREAD_NODE_ID", body: "REPLY_BODY"}) {
         comment { id }
       }
     }'
   ```
   Reply format: `"Applied — [brief description of what changed]."`

**If declining:**

1. Do NOT modify the code
2. Reply to the thread explaining why:
   Reply format: `"Respectfully declining — [clear reason]. [Optional: brief explanation of why the current approach is preferred]."`

### 4d. Track changes

Keep a running list of:

- Files modified
- Threads addressed (with thread node IDs)
- Threads declined (with reasons)

## Step 5: Resolve addressed threads

For each thread where changes were applied (not declined), resolve the thread:

```bash
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: {threadId: "THREAD_NODE_ID"}) {
      thread { isResolved }
    }
  }'
```

Do NOT resolve threads that were declined — leave those open for further discussion.

## Step 6: Format changed files

Run `npx prettier --write` on all files that were modified.

## Step 7: Check types changed files

Run `npx typecheck` on all files that were modified. Fix types if needed.

## Step 8: Stage and summarize

Stage all changed files with `git add` (add specific files, not `-A`).

Print a summary:

```
## PR Comment Review Summary

**Applied changes:**
- file.ts:42 — [description] (thread by @reviewer)
- file.ts:87 — [description] (thread by @reviewer)

**Declined:**
- file.ts:15 — [reason] (thread by @reviewer)

**Files modified:** file.ts, other-file.ts

Changes are staged but NOT committed. Review with `git diff --staged`, then commit when ready.
```

## Important notes

- **Do NOT commit.** Stage changes only. The user decides when to commit.
- **Do NOT push.** The user will push when ready.
- **Be concise in replies.** Reviewers appreciate brief, clear responses — not essays.
- **Respect the reviewer.** Even when declining, be respectful and explain your reasoning.
- **Batch formatting.** Run prettier once at the end on all changed files, not after each edit.
- **If a suggestion is ambiguous**, err on the side of applying it — reviewers took time to leave feedback.
