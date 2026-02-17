# Evaluation Playbook

How to run quality review rounds — the operational playbook. For metric definitions, scoring rubric, and failure taxonomy, see [evaluation-metrics.md](./evaluation-metrics.md).

## Prerequisites

- LangSmith account with API key configured (via `LANGCHAIN_API_KEY`)
- SST dev environment running (`sst dev` or `sst shell` access)
- Database with ingested documents (for the agent's vector store)
- Environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`

## Running a Round

### 1. Seed scenarios to LangSmith

```bash
pnpm --filter @usopc/evals quality:seed
```

Creates the `usopc-quality-review` dataset in LangSmith with ~60 scenarios. Idempotent — skips if the dataset already exists with the expected count.

### 2. Run scenarios

**Important:** The database must be running before executing this step.

```bash
# Run all scenarios with a round tag
pnpm --filter @usopc/evals quality:run -- --tag round-N

# Filter by category
pnpm --filter @usopc/evals quality:run -- --tag round-N --category emotional_urgent
```

This executes each scenario through the full agent pipeline and logs traces to the `usopc-quality-review` LangSmith project. Each trace includes:

- Full run outputs: `answer`, `trajectory`, `durationMs`, `expected_path`, `required_facts`, `category`, `difficulty`
- Metadata: scenario ID, domains, description, sport
- Tags: category, difficulty, and your custom tag

Online evaluators fire automatically on new traces (see below).

## Online Evaluators

Online evaluators auto-score traces as they arrive in LangSmith. They are configured through the LangSmith UI.

### Shared setup steps

1. Navigate to **Tracing Projects** > `usopc-quality-review` > **Evaluators** tab
2. Click **"+ New"** > **"New Evaluator"**
3. Select the evaluator type: **Code** or **LLM-as-a-judge**
4. Name the evaluator
5. (Optional) Create a filter to restrict which traces are evaluated
6. (Optional) Set a sampling rate (decimal 0–1; omit or use `1.0` for every trace)
7. Configure the evaluator-specific settings (see below)
8. Click **"Test Code"** (code) or **Preview** (LLM) to validate against a recent run
9. Save — evaluators will auto-run on all new traces going forward

To backfill existing traces, toggle **"Apply to past runs"** and set a start date.

### Code evaluators

Code evaluators run deterministic logic. The function **must be named `perform_eval`** and accepts a single `run` parameter. Returns a dictionary where keys are feedback names and values are scores.

**1. `online_disclaimer_present`** — Binary 0/1

```javascript
function performEval(run) {
  const answer = run.outputs?.answer ?? "";
  const trajectory = run.outputs?.trajectory ?? [];
  // Auto-pass for clarify trajectories
  if (
    trajectory.length > 0 &&
    trajectory[trajectory.length - 1] === "clarify"
  ) {
    return { online_disclaimer_present: true };
  }
  const hasSeparator = answer.includes("---");
  const hasContact = /ombuds|safesport|1-833-5US-SAFE|833-587-7233/i.test(
    answer,
  );
  return { online_disclaimer_present: hasSeparator && hasContact };
}
```

**2. `online_trajectory_match`** — Binary 0/1 (only fires when expected_path is non-null)

```javascript
function performEval(run) {
  const expected = run.outputs?.expected_path;
  if (!expected) return {};
  const expectedNodes = expected.split(" \u2192 ");
  const actual = run.outputs?.trajectory ?? [];
  const match =
    actual.length === expectedNodes.length &&
    actual.every((n, i) => n === expectedNodes[i]);
  return { online_trajectory_match: match };
}
```

**3. `online_trajectory_subset`** — Binary 0/1 (only fires when expected_path is non-null)

```javascript
function performEval(run) {
  const expected = run.outputs?.expected_path;
  if (!expected) return {};
  const expectedNodes = expected.split(" \u2192 ");
  const actual = run.outputs?.trajectory ?? [];
  const subset = expectedNodes.every((n) => actual.includes(n));
  return { online_trajectory_subset: subset };
}
```

**4. `online_fact_coverage`** — Continuous 0–1 (only fires when required_facts is non-null)

```javascript
function performEval(run) {
  const facts = run.outputs?.required_facts;
  if (!facts || !Array.isArray(facts) || facts.length === 0) return {};
  const answer = (run.outputs?.answer ?? "").toLowerCase();
  const found = facts.filter((f) => answer.includes(f.toLowerCase())).length;
  return { online_fact_coverage: found / facts.length };
}
```

### LLM-as-judge evaluators

All use Claude Haiku or GPT-4o-mini. Continuous 0–1 with reasoning enabled.

**Variable mapping** (shared across all 5):

- `{question}` > Input > `messages` (last user message)
- `{response}` > Output > `answer`

**Feedback configuration** (shared):

- Type: **Continuous**, range: 0.0–1.0
- Reasoning: **enabled**

**5. `online_quality`**

```
You are a quality evaluator for the USOPC Athlete Support Agent, which helps U.S. Olympic and Paralympic athletes with governance, compliance, team selection, SafeSport, anti-doping, and eligibility questions.

Rate the overall quality of the agent's response on a 0-1 scale.

## Scoring Anchors

- 1.0 (Excellent): Directly answers the athlete's question with accurate, specific USOPC/NGB policy details. Cites sources. Provides actionable next steps (contacts, deadlines, forms). Appropriate disclaimers present. An athlete could act on this immediately.
- 0.75 (Good): Answers the question correctly with relevant policy context. Minor gaps -- might miss a secondary contact or a nuance. Still useful for the athlete.
- 0.5 (Acceptable): Core answer is roughly right but lacks specificity. Uses generic language ("contact your NGB") instead of naming the specific body or providing contact info. Athlete needs follow-up research.
- 0.25 (Poor): Addresses the topic area but has factual errors, misses the actual question, or provides outdated information. Could mislead the athlete.
- 0.0 (Unusable): Completely wrong, harmful, hallucinates policy that doesn't exist, or fails to respond meaningfully.

## What to evaluate

Consider accuracy, completeness, actionability, appropriate citations, and whether the response serves an athlete who may be stressed or in a time-sensitive situation.

{{few_shot_examples}}

Athlete's question: {question}
Agent's response: {response}
```

**6. `online_helpfulness`**

```
You are evaluating whether an athlete could take concrete action based on this response from the USOPC Athlete Support Agent.

Rate helpfulness on a 0-1 scale.

## Scoring Anchors

- 1.0: Provides specific next steps the athlete can follow right now -- named contacts with phone/email, specific forms or processes, deadlines, and what to expect. The athlete does not need to do additional research.
- 0.75: Gives clear direction with most contacts/steps, but the athlete may need to look up one detail (e.g., a specific phone number or form name).
- 0.5: Points in the right direction ("file a complaint with SafeSport") but doesn't provide the specific mechanism, contact, or timeline. Athlete needs moderate follow-up.
- 0.25: Vaguely relevant but the athlete wouldn't know what to do next. Generic advice like "consult the relevant authority."
- 0.0: No actionable value. Restates the question, provides irrelevant information, or says "I don't know" without directing to resources.

{{few_shot_examples}}

Athlete's question: {question}
Agent's response: {response}
```

**7. `online_accuracy`**

```
You are a factual accuracy evaluator for the USOPC Athlete Support Agent. The agent answers questions about U.S. Olympic governance, USOPC bylaws, NGB policies, SafeSport, USADA anti-doping, team selection procedures, athlete rights, and dispute resolution.

Rate factual accuracy on a 0-1 scale. Focus on verifiable claims.

## Scoring Anchors

- 1.0: All claims are factually correct. Policy names, organizations, processes, contacts, and deadlines are accurate. No fabricated information.
- 0.75: Core facts are correct. Minor imprecision (e.g., slightly outdated contact info, or a simplified description of a multi-step process) that wouldn't materially mislead.
- 0.5: Main thrust is correct but contains one unsupported or incorrect claim that could cause confusion (e.g., wrong deadline, misattributed authority).
- 0.25: Multiple factual errors or a single critical error (e.g., wrong organization responsible for a process, fabricated policy name, wrong legal standard).
- 0.0: Predominantly fabricated or fundamentally wrong. Cites policies that don't exist, names wrong governing bodies, or inverts correct procedures.

## Important

- If the response includes appropriate hedging ("this may vary by NGB", "verify with..."), do not penalize for acknowledged uncertainty.
- If the response correctly declines to answer because it lacks information, score 0.75+ (accuracy by omission is better than fabrication).

{{few_shot_examples}}

Athlete's question: {question}
Agent's response: {response}
```

**8. `online_completeness`**

```
You are evaluating whether the USOPC Athlete Support Agent fully addressed the athlete's question.

Rate completeness on a 0-1 scale.

## Scoring Anchors

- 1.0: Addresses every aspect of the question. If the question has multiple parts, all are covered. Anticipates the obvious follow-up ("You'll also want to know..."). Includes relevant context the athlete may not have thought to ask about.
- 0.75: Covers the main question and most sub-parts. Misses one secondary aspect or a likely follow-up, but the primary need is fully met.
- 0.5: Answers the core question but skips important related information. For example, explains *what* to do but not *when* or *how*, or answers about eligibility but doesn't mention the appeals process.
- 0.25: Partially addresses the question. Significant aspects are missing -- e.g., only answers one part of a multi-part question, or gives a surface-level answer to a procedural question.
- 0.0: Does not meaningfully address what was asked. Off-topic, or answers a different question entirely.

## Important

- Brevity is not incompleteness. A concise answer that covers all key points scores higher than a verbose answer that misses aspects.
- For clarification responses (asking the athlete to specify), score based on whether the clarifying question is well-targeted, not on answer completeness.

{{few_shot_examples}}

Athlete's question: {question}
Agent's response: {response}
```

**9. `online_tone`**

```
You are evaluating the tone of the USOPC Athlete Support Agent's response. Athletes using this system may be stressed, confused, facing deadlines, dealing with SafeSport issues, or navigating complex bureaucratic processes.

Rate tone on a 0-1 scale.

## Scoring Anchors

- 1.0: Warm, empathetic, and professional. Acknowledges the athlete's situation when appropriate. Uses clear, accessible language (no unnecessary jargon). Feels like advice from a knowledgeable, caring advocate.
- 0.75: Professional and appropriate. Doesn't dismiss or minimize. Clear language. May lack warmth in situations that call for empathy (e.g., SafeSport reports, failed appeals).
- 0.5: Neutral/bureaucratic. Correct but reads like a policy manual, not a conversation. Doesn't acknowledge emotional context. Uses organizational jargon without explanation.
- 0.25: Cold, overly formal, or inadvertently dismissive. Uses language that could make an already-stressed athlete feel unheard or overwhelmed.
- 0.0: Actively inappropriate -- condescending, dismissive of a serious concern, trivializes a safety issue, or uses language that could re-traumatize (especially for SafeSport-related queries).

## Important

- For factual/procedural questions with no emotional component, neutral-professional (0.75) is fine -- not every response needs to be warm.
- For SafeSport, harassment, abuse, or emotional distress scenarios, empathetic acknowledgment is essential -- score harshly if missing.

{{few_shot_examples}}

Athlete's question: {question}
Agent's response: {response}
```

## Comparing Rounds in LangSmith

### Using experiment comparison

1. Open the `usopc-quality-review` project in LangSmith
2. Filter by tag (e.g., `round-2`) to see only that round's traces
3. Use **Experiment Comparison** to compare two rounds side by side
4. Compare specific scenarios by searching for the scenario ID in metadata (e.g., `emot-01`)

### Key things to compare

| What to check           | Where to look                                                                   |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Trajectory changes**  | Did `classifier > clarify` become `classifier > retriever > synthesizer`?       |
| **Answer completeness** | Does the response cover all required facts from `expectedOutput.requiredFacts`? |
| **Tone**                | For emotional/urgent scenarios, is the response empathetic and supportive?      |
| **Escalation quality**  | For escalation scenarios, are contacts specific (not generic boilerplate)?      |
| **Context retention**   | For multi-turn scenarios, does the agent reference earlier messages?            |

## Human Review

Use the built-in LangSmith annotation queue UI for human review. No setup script needed — annotation queues are created and managed directly in the LangSmith UI.

1. Open the `usopc-quality-review` project
2. Navigate to **Annotation Queues**
3. Create a queue (or use an existing one) and add traces from a specific round
4. Score each trace on the 5 dimensions (0–1 scale) defined in [evaluation-metrics.md](./evaluation-metrics.md)
5. Tag failure modes using codes from the taxonomy (e.g., `SYN_HALLUCINATION, CIT_MISSING`)

## Adding New Scenarios

Scenarios live in `packages/evals/src/quality-review/scenarios.ts`. After adding scenarios, re-seed:

```bash
pnpm --filter @usopc/evals quality:seed
```

The seed script is idempotent — it will recreate the dataset if the scenario count changed.

### Scenario structure

```typescript
{
  id: "cat-NN",        // category prefix + number (e.g., "emot-06")
  input: {
    messages: [{ role: "user", content: "..." }],
    userSport?: "swimming",
  },
  metadata: {
    category: "emotional_urgent",
    domains: ["safesport", "athlete_rights"],
    difficulty: "hard",
    description: "Short description of what this tests",
  },
  expectedOutput: {
    referenceAnswer: "...",
    requiredFacts: ["fact 1", "fact 2"],
    expectedPath: "classifier > escalation_responder",
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

## Adding New Failure Modes

The failure taxonomy lives in `packages/evals/src/quality-review/taxonomy.ts`. After adding codes:

1. Update `docs/evaluation-metrics.md` with the new failure mode tables
2. No script setup needed — online evaluators don't reference specific failure codes

## Round History

| Round | Date       | Tag          | Trigger                          | Summary                                                                                                                                                                                                              |
| ----- | ---------- | ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 2026-01-29 | _(untagged)_ | Initial quality review (#131)    | Identified 4 high-priority failure patterns: over-clarification (#132), generic escalation (#133), lack of emotional intelligence (#134), context loss in multi-turn (#135)                                          |
| 2     | 2026-02-15 | `round-2`    | Fixes for #132, #133, #134, #135 | 62/62 scenarios passed. Key improvements: cross-domain queries route to retriever instead of clarify; escalation uses LLM-generated guidance; emotional scenarios routed appropriately; multi-turn context retained. |
