---
name: eval-check
description: Run agent quality evaluations when core agent code changes. Runs fast evals automatically, asks before expensive LLM evals.
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(pnpm --filter @usopc/evals *), Bash(git diff *), Bash(git fetch *), Bash(git branch *), Read, Glob, Grep, AskUserQuestion
---

# Agent Quality Verification

Run evaluations to verify agent quality after code changes.

## Step 1: Detect changed agent files

Run `git fetch origin main` then detect changes in agent code:

```bash
git diff --name-only origin/main...HEAD -- packages/core/src/agent/ packages/core/src/tools/ packages/core/src/services/
```

Also check for unstaged changes:

```bash
git diff --name-only -- packages/core/src/agent/ packages/core/src/tools/ packages/core/src/services/
```

Categorize the changes:

- **Nodes**: `packages/core/src/agent/nodes/`
- **Edges**: `packages/core/src/agent/edges/`
- **Prompts**: files containing prompt templates or system messages
- **Tools**: `packages/core/src/tools/`
- **Services**: `packages/core/src/services/`
- **Graph structure**: `packages/core/src/agent/graph.ts` or similar

If no agent files were changed, inform the user and stop:

```
No agent code changes detected. Evals not needed.
```

## Step 2: Run fast deterministic evals

These are quick and don't cost LLM tokens. Always run them:

```bash
pnpm --filter @usopc/evals eval:classifier
```

```bash
pnpm --filter @usopc/evals eval:escalation
```

Report results for each:

```
Fast evals:
  classifier-accuracy   PASS (12/12)
  escalation            PASS (8/8)
```

If either fails, show the failure details.

## Step 3: Ask before expensive evals

The following evals call LLMs and cost money. Ask the user before running them:

Use AskUserQuestion to ask:

```
Agent code was modified. Run expensive LLM-based evals?
- Groundedness (tests answer grounding in retrieved docs)
- Correctness (tests factual accuracy)
- Trajectory (tests agent decision paths)
- Citations (tests citation formatting)
- Disclaimers (tests safety disclaimer inclusion)
```

Options:

1. **Run all** — run all LLM evals
2. **Run relevant** — only run evals related to the changed code
3. **Skip** — skip expensive evals

### If "Run all":

Run each eval:

```bash
pnpm --filter @usopc/evals eval:groundedness
pnpm --filter @usopc/evals eval:correctness
pnpm --filter @usopc/evals eval:trajectory
pnpm --filter @usopc/evals eval:citations
pnpm --filter @usopc/evals eval:disclaimers
```

### If "Run relevant":

Select evals based on what changed:

- **Node changes** (classifier) → `eval:classifier`
- **Node changes** (synthesizer, citationBuilder) → `eval:groundedness`, `eval:citations`
- **Node changes** (escalate, disclaimerGuard) → `eval:escalation`, `eval:disclaimers`
- **Edge changes** → `eval:trajectory`
- **Tool changes** → `eval:correctness`, `eval:groundedness`
- **Service changes** → `eval:correctness`
- **Graph structure** → `eval:trajectory`

### If "Skip":

Print a note and move on.

## Step 4: Print results summary

```
## Eval Results

### Fast (deterministic)
  classifier-accuracy   PASS  (12/12)
  escalation            PASS  (8/8)

### LLM-based
  groundedness          PASS  (10/10)
  correctness           PASS  (10/10)
  trajectory            FAIL  (7/10) — 3 regressions
  citations             PASS  (5/5)
  disclaimers           PASS  (5/5)

---
1 eval failed. Review trajectory results before committing.
```

If all pass:

```
All evals passed. Agent quality verified.
```

## Important notes

- Evals require AWS credentials (they run via `sst shell`). If evals fail with credential errors, tell the user to check their AWS setup.
- Do NOT modify any code. This is a read-only verification.
- If the evals package has build errors, suggest running `pnpm --filter @usopc/evals typecheck` first.
