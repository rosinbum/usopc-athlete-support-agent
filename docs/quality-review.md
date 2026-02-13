# Quality Review Process

Human-in-the-loop quality diagnosis for the USOPC Athlete Support Agent. This is a **diagnosis** tool — it identifies and catalogs failure patterns so we can apply holistic fixes, not fix individual issues one at a time.

## Prerequisites

- LangSmith account with API key configured (via `LANGCHAIN_API_KEY`)
- SST dev environment running (`sst dev` or `sst shell` access)
- Database with ingested documents (for the agent's vector store)
- Environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`

## Running a Review Session

### 1. Seed scenarios to LangSmith

```bash
pnpm --filter @usopc/evals quality:seed
```

Creates the `usopc-quality-review` dataset in LangSmith with ~60 scenarios.

### 2. Run scenarios through the agent

```bash
# Run all scenarios
pnpm --filter @usopc/evals quality:run

# Run a specific category
pnpm --filter @usopc/evals quality:run -- --category boundary

# Tag a batch for tracking
pnpm --filter @usopc/evals quality:run -- --tag sprint-42
```

This invokes each scenario through the full agent pipeline and logs traces to the `usopc-quality-review` LangSmith project with metadata (scenario ID, category, difficulty, domains).

### 3. Set up the annotation queue

```bash
pnpm --filter @usopc/evals quality:setup
```

Creates (or updates) a LangSmith annotation queue named `quality-review` and adds all runs from the quality review project to it. The queue includes rubric instructions and the full failure mode taxonomy.

### 4. Annotate in LangSmith

Open the LangSmith UI → **Annotation Queues** → **quality-review**.

For each trace, you can see:

- The full graph execution (classifier → retriever → synthesizer → ...)
- Retrieved documents and their content
- The synthesizer's input context and generated answer
- Citations and disclaimers

Score each trace on five dimensions (1–5):

- **Quality** — Overall response quality
- **Helpfulness** — Would an athlete find this useful?
- **Accuracy** — Are all claims factually correct?
- **Completeness** — Does the answer cover all aspects?
- **Tone** — Is the tone appropriate for the context?

Tag failure modes using codes from the taxonomy (e.g., `SYN_HALLUCINATION, CIT_MISSING`).

Add free-text notes with specific observations.

### 5. Generate a report

```bash
# Markdown report to stdout
pnpm --filter @usopc/evals quality:report

# JSON format
pnpm --filter @usopc/evals quality:report -- --format json

# Filter by date
pnpm --filter @usopc/evals quality:report -- --since 2025-02-01
```

### 6. Triage

Review the report to identify:

- Which **failure modes** are most frequent and severe (priority matrix)
- Which **graph nodes** fail most often
- Which **topic domains** have the worst quality
- Which **scenario categories** are hardest

Use these patterns to plan targeted improvements.

## Scenario Categories

| Category           | Count | What it tests                                    |
| ------------------ | ----- | ------------------------------------------------ |
| `sport_specific`   | 10    | Questions mentioning NGBs beyond swimming        |
| `cross_domain`     | 8     | Questions spanning 2+ topic domains              |
| `multi_turn`       | 8     | 2–3 message conversation sequences               |
| `ambiguous`        | 6     | Vague queries that should trigger clarification  |
| `emotional_urgent` | 5     | Distressed athlete tone                          |
| `boundary`         | 6     | Near-scope and out-of-scope questions            |
| `paralympic`       | 5     | Paralympic-specific questions                    |
| `financial`        | 5     | Grants, stipends, sponsorship                    |
| `procedural_deep`  | 5     | Deep procedural detail (timelines, filing steps) |
| `current_events`   | 4     | Questions about recent/upcoming events           |

## Failure Mode Reference

### Classifier

| Code                       | Label                     | Severity |
| -------------------------- | ------------------------- | -------- |
| `CLS_WRONG_DOMAIN`         | Wrong topic domain        | medium   |
| `CLS_WRONG_INTENT`         | Wrong query intent        | medium   |
| `CLS_MISSED_ESCALATION`    | Missed escalation signal  | critical |
| `CLS_FALSE_ESCALATION`     | False escalation          | high     |
| `CLS_MISSED_CLARIFICATION` | Missed clarification need | medium   |
| `CLS_FALSE_CLARIFICATION`  | Unnecessary clarification | low      |
| `CLS_MISSED_NGB`           | Missed NGB detection      | medium   |

### Retriever

| Code                 | Label                      | Severity |
| -------------------- | -------------------------- | -------- |
| `RET_IRRELEVANT`     | Retrieved off-topic docs   | high     |
| `RET_MISSING_SOURCE` | KB lacks content           | medium   |
| `RET_LOW_CONFIDENCE` | Low retrieval confidence   | medium   |
| `RET_WRONG_NGB_DOCS` | Wrong NGB documents        | high     |
| `RET_STALE_CONTENT`  | Outdated content retrieved | medium   |

### Synthesizer

| Code                 | Label                   | Severity |
| -------------------- | ----------------------- | -------- |
| `SYN_HALLUCINATION`  | Claims not in context   | critical |
| `SYN_INCOMPLETE`     | Misses key facts        | high     |
| `SYN_WRONG_TONE`     | Tone inappropriate      | medium   |
| `SYN_TOO_VERBOSE`    | Much longer than needed | low      |
| `SYN_TOO_BRIEF`      | Too brief               | medium   |
| `SYN_WRONG_AUDIENCE` | Wrong audience level    | medium   |
| `SYN_CONTRADICTORY`  | Self-contradictory      | high     |
| `SYN_OUTDATED_INFO`  | Outdated information    | high     |

### Citation

| Code               | Label                        | Severity |
| ------------------ | ---------------------------- | -------- |
| `CIT_MISSING`      | No citations provided        | high     |
| `CIT_WRONG_SOURCE` | Citations don't match claims | high     |
| `CIT_BROKEN_URL`   | Broken citation URL          | medium   |
| `CIT_INSUFFICIENT` | Too few citations            | medium   |

### Disclaimer

| Code                 | Label                       | Severity |
| -------------------- | --------------------------- | -------- |
| `DIS_MISSING`        | Missing required disclaimer | high     |
| `DIS_WRONG_DOMAIN`   | Wrong disclaimer domain     | medium   |
| `DIS_MISSING_SAFETY` | Missing safety contact info | critical |

### Escalation

| Code                  | Label                        | Severity |
| --------------------- | ---------------------------- | -------- |
| `ESC_WRONG_TARGET`    | Escalated to wrong authority | critical |
| `ESC_WRONG_URGENCY`   | Wrong urgency level          | high     |
| `ESC_MISSING_CONTACT` | Missing escalation contact   | high     |

### Cross-cutting

| Code                   | Label                                 | Severity |
| ---------------------- | ------------------------------------- | -------- |
| `XCT_GENERIC_RESPONSE` | Generic when specific guidance exists | high     |
| `XCT_SCOPE_LEAK`       | Answered out-of-scope question        | medium   |
| `XCT_CONTEXT_LOST`     | Lost conversation context             | high     |
| `XCT_WRONG_SPORT`      | Applied wrong sport's rules           | high     |
| `XCT_LATENCY`          | Unacceptable latency                  | low      |

## Scoring Rubric

### Overall Quality (1–5)

1. **Unusable** — Response is wrong, harmful, or completely misses the question.
2. **Poor** — Response addresses the topic but has significant errors or omissions.
3. **Acceptable** — Response is roughly correct but missing important details or nuance.
4. **Good** — Response is accurate, helpful, and well-structured with minor issues.
5. **Excellent** — Response is accurate, comprehensive, well-cited, and athlete-appropriate.

### Helpfulness (1–5)

1. **Not helpful** — Athlete would get no value from this response.
2. **Slightly helpful** — Points in the right direction but athlete would need significant additional research.
3. **Moderately helpful** — Gives useful information but athlete may need to follow up on specifics.
4. **Very helpful** — Athlete can act on this with minimal additional effort.
5. **Exceptionally helpful** — Athlete has everything needed to take action, including contacts and next steps.

### Factual Accuracy (1–5)

1. **Incorrect** — Contains fabricated or fundamentally wrong information.
2. **Mostly incorrect** — More wrong than right; key facts are inaccurate.
3. **Mixed** — Core facts are right but some claims are unsupported or wrong.
4. **Mostly accurate** — Facts are correct with only minor inaccuracies or imprecisions.
5. **Fully accurate** — All claims are supported by source documents or known policy.

### Completeness (1–5)

1. **Incomplete** — Misses the core of what was asked.
2. **Partial** — Addresses part of the question but skips major aspects.
3. **Adequate** — Covers the main point but misses supporting details.
4. **Thorough** — Covers the question well with only minor gaps.
5. **Comprehensive** — Fully addresses all aspects of the question with appropriate depth.

### Tone (1–5)

1. **Inappropriate** — Dismissive, condescending, or insensitive to the athlete's situation.
2. **Off-putting** — Too robotic, overly formal, or fails to acknowledge emotional context.
3. **Neutral** — Professional but lacks warmth or empathy where appropriate.
4. **Good** — Professional, empathetic, and appropriate for the context.
5. **Excellent** — Perfectly calibrated tone — supportive, clear, and athlete-centered.
