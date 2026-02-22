---
name: resolve-review
description: Resolve a code review finding — validates the issue still exists, creates a GitHub issue, sets up a worktree, and implements the fix.
argument-hint: <finding-id> (e.g., SEC-C2, BP-H3)
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(cd *), Bash(gh *), Bash(pnpm *), Bash(cp *), Bash(npx prettier *), Bash(ls *), Read, Edit, Write, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet, EnterPlanMode, ExitPlanMode, mcp__github__issue_write, mcp__github__search_issues
---

# Resolve Code Review Finding

You are resolving a code review finding from a full codebase review. The finding ID is: `$ARGUMENTS`.

## Step 1: Parse the finding ID

Parse `$ARGUMENTS` into a prefix and severity-number. Examples:

- `SEC-C2` → prefix `SEC`, severity `C`, number `2`
- `BP-H3` → prefix `BP`, severity `H`, number `3`
- `TEST-M1` → prefix `TEST`, severity `M`, number `1`

Valid severity letters: `C` (Critical), `H` (High), `M` (Medium), `L` (Low).

If no argument is provided or it cannot be parsed, print usage and stop:

```
Usage: /resolve-review <finding-id>
  Example: /resolve-review SEC-C2
  Example: /resolve-review BP-H3

Valid prefixes: CQ, AR, SEC, PERF, TEST, DOC, BP, OPS
Severity levels: C (Critical), H (High), M (Medium), L (Low)
```

## Step 2: Look up the review file

Use this prefix-to-file mapping:

| Prefix | File                                       |
| ------ | ------------------------------------------ |
| `CQ`   | `.full-review/01-quality-architecture.md`  |
| `AR`   | `.full-review/01-quality-architecture.md`  |
| `SEC`  | `.full-review/02-security-performance.md`  |
| `PERF` | `.full-review/02-security-performance.md`  |
| `TEST` | `.full-review/03-testing-documentation.md` |
| `DOC`  | `.full-review/03-testing-documentation.md` |
| `BP`   | `.full-review/04-best-practices.md`        |
| `OPS`  | `.full-review/04-best-practices.md`        |

If the prefix is not in the map, print valid prefixes and stop.

**Important:** The `.full-review/` directory is untracked and only exists in the main repo. Use `git worktree list` to find the main repo root, then read the file from `<main-repo-root>/.full-review/<filename>`.

Search the file for the pattern `**$ARGUMENTS.` (e.g., `**SEC-C2.`). Extract the full finding block — everything from that header until the next `**<PREFIX>-` header or section boundary (`##`, `---`). If not found, print an error and stop.

## Step 3: Parse finding details

From the extracted finding block, extract:

- **Title**: the text after the finding ID
- **Severity**: C (Critical), H (High), M (Medium), L (Low)
- **File paths and line ranges**: referenced in the finding
- **Issue description**: what the problem is
- **Recommended fix**: how to resolve it
- **CVSS/CWE/OWASP**: if present

Print a formatted summary for the user:

```
Finding: SEC-C2 — Missing input validation on bulk upload
Severity: Critical
Files:
  - app/api/admin/sources/bulk/route.ts:15-42
  - app/api/admin/sources/bulk/route.ts:87-95
Problem: <brief description>
Fix: <brief description>
```

## Step 4: Validate finding still exists

**File path resolution:** Review file paths are typically relative to `apps/web/`. Prepend `apps/web/` to each path. For example:

- `app/api/admin/sources/bulk/route.ts` → `apps/web/app/api/admin/sources/bulk/route.ts`
- `next.config.ts` → `apps/web/next.config.ts`
- `package.json` → `apps/web/package.json`

If a path doesn't resolve with `apps/web/` prefix, try it as-is from the repo root (some findings may reference `packages/` paths directly).

For each referenced file:

1. Locate the file using Glob if the exact path doesn't match
2. Read the relevant line range (+/- 20 lines of context)
3. Check if the problematic pattern still exists:
   - **Missing validation**: grep for `z.object`, `safeParse`, `zod` near the location
   - **Missing auth**: check for `requireAdmin()` vs bare `auth()`
   - **Wrong component**: grep for the bad pattern (`<a href=`, `window.location`, `unsafe-eval`)
   - **Missing tests/docs**: check if the expected file now exists
   - **Duplicated code**: check all referenced files
   - **Config issues**: check the config value

**If resolved:** Print a detailed analysis explaining what changed, what the code looks like now, and why it's no longer a problem. **Stop here — do not proceed to further steps.**

**If uncertain:** Use `AskUserQuestion` to ask the user whether to proceed.

**If still a problem:** Continue to step 5.

## Step 5: Check for existing GitHub issues

Use `mcp__github__search_issues` to search for existing issues:

- owner: `rosinbum`
- repo: `usopc-athlete-support-agent`
- query: `$ARGUMENTS` (the finding ID)

If an open issue already exists for this finding, print it and use `AskUserQuestion` to ask whether to use the existing issue or create a new one. If using existing, skip step 6 and use that issue number going forward.

## Step 6: Create GitHub issue

Use `mcp__github__issue_write` with:

- method: `create`
- owner: `rosinbum`
- repo: `usopc-athlete-support-agent`

**Title format:** `fix(<area>): <finding title> [<FINDING-ID>]`

- `<area>` is derived from the primary file path (e.g., `web`, `core`, `shared`)

**Labels** by prefix:
| Prefix | Labels |
|--------|--------|
| `SEC` | `["bug", "security"]` |
| `PERF` | `["enhancement", "performance"]` |
| `TEST` | `["enhancement", "testing"]` |
| `DOC` | `["documentation"]` |
| `CQ` | `["enhancement"]` |
| `AR` | `["enhancement"]` |
| `BP` | `["enhancement"]` |
| `OPS` | `["enhancement", "ops"]` |

**Body:**

```markdown
## Review Finding: <FINDING-ID>

**Source:** `.full-review/<filename>`
**Severity:** <Critical|High|Medium|Low>
**Category:** <category name>

### Problem

<issue description from finding>

### File(s)

- `<file:lines>`

### Recommended Fix

<fix from finding>

### Additional Context

<CVSS, CWE, OWASP if present>

---

_Auto-generated from code review finding <FINDING-ID>._
```

## Step 7: Set up worktree

Read the file `.claude/skills/worktree/SKILL.md` and follow the **`create` subcommand** steps (Steps 1-7) for the issue number created or selected in steps 5-6.

## Step 8: Run the implementation workflow

Read the file `.claude/skills/dev-workflow/SKILL.md` and execute all steps (Step 1 through Step 7). The issue number is the one created or selected in steps 5-6.

## Important notes

- **Do NOT close the issue** — the PR will close it when merged.
- **Follow project conventions**: ESM imports with `.js` extensions, Vitest with co-located tests, inline `vi.mock()` factories.
- **All work happens in the worktree**, not the main repo.
- If the finding's recommended fix is ambiguous, use `AskUserQuestion` to clarify before implementing.
