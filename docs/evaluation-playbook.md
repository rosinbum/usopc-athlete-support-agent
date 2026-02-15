# Evaluation Playbook

How to run evaluation rounds, compare results, and track quality over time. This is the **round-by-round comparison workflow** — for the scoring rubric, failure taxonomy, and annotation process, see [quality-review.md](./quality-review.md).

## Purpose

Each evaluation round runs the full set of quality review scenarios against the current agent, producing LangSmith traces that can be annotated and compared against previous rounds. This lets us:

- Measure whether fixes actually improved the targeted scenarios
- Catch regressions in scenarios that were previously passing
- Track quality trends over time with a consistent methodology

## When to Run

Run a new evaluation round after merging changes that affect agent behavior:

- Classifier prompt or routing logic changes
- Synthesizer prompt or response generation changes
- Escalation handling updates
- Knowledge base content additions or updates
- Retriever tuning (similarity thresholds, top-K, reranking)
- New or modified disclaimers

You do **not** need a new round for infrastructure-only changes (deployment config, CI, formatting) that don't affect agent responses.

## Running a New Round

### 1. Choose a tag

Use a descriptive tag to identify the round in LangSmith:

- Sequential: `round-1`, `round-2`, `round-3`
- Descriptive: `post-escalation-fix`, `new-kb-content`, `classifier-v2`

### 2. Record the start timestamp

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

Save this — you'll use it to filter the report to only this round's results.

### 3. Run scenarios

```bash
# All scenarios
pnpm --filter @usopc/evals quality:run -- --tag <tag>

# Single category (for targeted checks)
pnpm --filter @usopc/evals quality:run -- --tag <tag> --category emotional_urgent
```

This executes each scenario through the full agent pipeline and logs traces to the `usopc-quality-review` LangSmith project. Each trace is tagged with your tag name and includes metadata (scenario ID, category, difficulty, domains).

The script prints progress with execution trajectories:

```
  ✅ [sport-01] ... (classifier → retriever → synthesizer) 4.2s
  ✅ [emot-03] ... (classifier → escalation_responder) 2.1s
  ❌ [cross-05] ... (classifier → clarify) 1.8s   ← unexpected path
```

### 4. Generate the report

```bash
pnpm --filter @usopc/evals quality:report -- --since <timestamp>
```

The `--since` flag filters to only runs after your timestamp, isolating this round from previous runs. Add `--format json` for machine-readable output.

### 5. (Optional) Set up annotation queue

If you want human reviewers to score the new traces:

```bash
pnpm --filter @usopc/evals quality:setup
```

This adds the new traces to the LangSmith annotation queue. Must be re-run after every `quality:run` — new traces are not automatically queued.

### 6. Run automated evaluation

After `quality:run`, run automated evaluators to get immediate feedback scores without waiting for human annotation:

```bash
# Evaluate all runs since a timestamp
pnpm --filter @usopc/evals quality:evaluate -- --since <timestamp>

# Evaluate runs with a specific tag
pnpm --filter @usopc/evals quality:evaluate -- --tag <tag>

# Combine filters
pnpm --filter @usopc/evals quality:evaluate -- --since <timestamp> --tag <tag>
```

This posts four feedback keys to each LangSmith trace:

| Key                       | Type      | When                                     |
| ------------------------- | --------- | ---------------------------------------- |
| `auto_trajectory_match`   | 1.0 / 0.0 | Run has `expected_path` in metadata      |
| `auto_trajectory_subset`  | 1.0 / 0.0 | Run has `expected_path` in metadata      |
| `auto_disclaimer_present` | 1.0 / 0.0 | All runs (clarification paths auto-pass) |
| `auto_fact_coverage`      | 0.0-1.0   | Run has `required_facts` in metadata     |

The `auto_` prefix distinguishes these from human annotations. The report generator (`quality:report`) picks up these keys automatically since it includes any feedback key with a numeric score.

Alternatively, run all steps in one command:

```bash
pnpm --filter @usopc/evals quality:all
```

This chains `quality:run`, `quality:evaluate`, and `quality:setup` in sequence.

## Comparing Rounds

### In LangSmith

1. Open the `usopc-quality-review` project
2. Filter by tag (e.g., `round-2`) to see only that round's traces
3. Compare specific scenarios side-by-side by searching for the scenario ID in metadata (e.g., `emot-01`)

### Key things to compare

| What to check           | Where to look                                                                   |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Trajectory changes**  | Did `classifier → clarify` become `classifier → retriever → synthesizer`?       |
| **Answer completeness** | Does the response cover all required facts from `expectedOutput.requiredFacts`? |
| **Tone**                | For emotional/urgent scenarios, is the response empathetic and supportive?      |
| **Escalation quality**  | For escalation scenarios, are contacts specific (not generic boilerplate)?      |
| **Context retention**   | For multi-turn scenarios, does the agent reference earlier messages?            |

### Using reports

Generate reports for each round with `--since` to scope them:

```bash
# Round 1 report (original run)
pnpm --filter @usopc/evals quality:report -- --since 2026-01-15T00:00:00Z

# Round 2 report (after fixes)
pnpm --filter @usopc/evals quality:report -- --since 2026-02-15T18:50:00Z
```

Compare the priority matrices and failure frequencies between rounds to confirm that targeted failure modes decreased without new ones appearing.

## Adding New Test Scenarios

Scenarios live in `packages/evals/src/quality-review/scenarios.ts`.

### Scenario structure

```typescript
{
  id: "cat-NN",        // category prefix + number (e.g., "emot-06")
  input: {
    messages: [{ role: "user", content: "..." }],
    userSport?: "swimming",  // optional sport context
  },
  metadata: {
    category: "emotional_urgent",      // one of 10 categories
    domains: ["safesport", "athlete_rights"],  // topic domains tested
    difficulty: "hard",
    description: "Short description of what this tests",
  },
  expectedOutput: {                    // optional
    referenceAnswer: "...",            // ideal response
    requiredFacts: ["fact 1", "fact 2"],
    expectedPath: "classifier → escalation_responder",
  },
}
```

### ID conventions

| Category           | Prefix   |
| ------------------ | -------- |
| `sport_specific`   | `sport-` |
| `cross_domain`     | `cross-` |
| `multi_turn`       | `multi-` |
| `ambiguous`        | `ambig-` |
| `emotional_urgent` | `emot-`  |
| `boundary`         | `bound-` |
| `paralympic`       | `para-`  |
| `financial`        | `fin-`   |
| `procedural_deep`  | `proc-`  |
| `current_events`   | `curr-`  |

### After adding scenarios

Re-seed the LangSmith dataset so it picks up the new scenarios:

```bash
pnpm --filter @usopc/evals quality:seed
```

The seed script is idempotent — it will recreate the dataset if the scenario count changed.

## Adding New Failure Modes

The failure taxonomy lives in `packages/evals/src/quality-review/taxonomy.ts`.

### Failure mode structure

```typescript
{
  code: "NODE_DESCRIPTION",    // e.g., "SYN_HALLUCINATION"
  label: "Short human label",
  node: "synthesizer",         // classifier | retriever | synthesizer | citation | disclaimer | escalation | cross-cutting
  severity: "critical",        // critical | high | medium | low
  description: "When to apply this code",
}
```

### Severity weights (used in priority matrix)

| Severity | Weight |
| -------- | ------ |
| critical | 4      |
| high     | 3      |
| medium   | 2      |
| low      | 1      |

### After adding failure modes

Re-run the annotation queue setup so the rubric and feedback keys reflect the new codes:

```bash
pnpm --filter @usopc/evals quality:setup
```

Also update `docs/quality-review.md` to include the new codes in the failure mode reference tables.

## Round History

| Round | Date       | Tag          | Trigger                          | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ---------- | ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | 2026-01-29 | _(untagged)_ | Initial quality review (#131)    | Identified 4 high-priority failure patterns: over-clarification (#132), generic escalation (#133), lack of emotional intelligence (#134), context loss in multi-turn (#135)                                                                                                                                                                                                                                                                            |
| 2     | 2026-02-15 | `round-2`    | Fixes for #132, #133, #134, #135 | 62/62 scenarios passed (0 runtime failures). Key improvements: cross-domain queries now route to retriever instead of clarify (#132); escalation responses use LLM-generated context-specific guidance (#133); emotional scenarios detected and routed appropriately (#134); multi-turn context retained (#135). Annotation pending. Note: hit DB connection pool exhaustion mid-run (#141) — worked around by running categories in separate batches. |

## Online Evaluators (LangSmith UI)

In addition to the local `quality:evaluate` script, LangSmith supports **online evaluators** that auto-score traces as they arrive. These must be configured through the LangSmith UI (no SDK API).

### Setup instructions

1. Navigate to LangSmith → project `usopc-quality-review` → Settings → Online Evaluators
2. Click "Add Evaluator"
3. Configure each evaluator below
4. Set "Sampling rate" to 1.0 (evaluate every trace)
5. Save — evaluators will auto-run on all new traces going forward

### Code evaluators

Paste these JavaScript functions into the LangSmith "Code" evaluator editor.

**1. Disclaimer Check** (`online_disclaimer_present`)

```javascript
function evaluator({ run }) {
  const answer = run.outputs?.answer ?? "";
  const hasSeparator = answer.includes("---");
  const hasContact = /ombudsman|safesport|1-833-5US-SAFE|833-587-7233/i.test(
    answer,
  );
  return {
    key: "online_disclaimer_present",
    score: hasSeparator && hasContact ? 1.0 : 0.0,
  };
}
```

**2. Trajectory Match** (`online_trajectory_match`)

```javascript
function evaluator({ run }) {
  const expected = run.extra?.metadata?.expected_path;
  if (!expected) return { key: "online_trajectory_match", score: null };
  const expectedNodes = expected.split(" \u2192 ");
  const actual = run.outputs?.trajectory ?? [];
  const match =
    actual.length === expectedNodes.length &&
    actual.every((n, i) => n === expectedNodes[i]);
  return { key: "online_trajectory_match", score: match ? 1.0 : 0.0 };
}
```

### LLM-as-judge evaluators

Configure these as "LLM" evaluators in the LangSmith UI. Map input to `run.inputs.messages[-1].content` and output to `run.outputs.answer`.

**3. Tone Score** (`online_tone`)

- Model: Claude Haiku or GPT-4o-mini
- Prompt:

```
You are evaluating an AI assistant's response to a U.S. Olympic/Paralympic athlete.
Rate the TONE on a scale of 1-5:
1 = Cold, dismissive, or robotic
2 = Neutral but lacks warmth
3 = Professional and adequate
4 = Warm, supportive, and empathetic
5 = Exceptional empathy, genuinely supportive

Athlete's question: {input}
Agent's response: {output}

Return ONLY a JSON object: {"score": <1-5>, "reasoning": "<brief explanation>"}
```

**4. Completeness Score** (`online_completeness`)

- Model: Claude Haiku or GPT-4o-mini
- Prompt:

```
You are evaluating an AI assistant's response for completeness.
The athlete asked: {input}
The agent responded: {output}

Rate completeness on 1-5:
1 = Missing most relevant information
2 = Covers some basics but misses key details
3 = Covers the main points adequately
4 = Comprehensive with good detail
5 = Thorough and anticipates follow-up questions

Return ONLY a JSON object: {"score": <1-5>, "reasoning": "<brief explanation>"}
```
