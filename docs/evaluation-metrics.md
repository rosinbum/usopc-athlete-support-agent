# Evaluation Metrics

What we measure and why — scoring rubric, failure taxonomy, and evaluation criteria. For the operational workflow (running rounds, configuring evaluators), see [evaluation-playbook.md](./evaluation-playbook.md).

## Scoring Dimensions (0–1 scale)

All dimensions use a continuous 0–1 scale with 5 anchor levels. Online evaluators (LLM-as-judge) and human reviewers both score on this same scale.

### Overall Quality (`quality`)

| Score | Label      | Description                                                               |
| ----- | ---------- | ------------------------------------------------------------------------- |
| 0.0   | Unusable   | Response is wrong, harmful, or completely misses the question.            |
| 0.25  | Poor       | Response addresses the topic but has significant errors or omissions.     |
| 0.5   | Acceptable | Response is roughly correct but missing important details or nuance.      |
| 0.75  | Good       | Response is accurate, helpful, and well-structured with minor issues.     |
| 1.0   | Excellent  | Response is accurate, comprehensive, well-cited, and athlete-appropriate. |

### Helpfulness (`helpfulness`)

| Score | Label                 | Description                                                                           |
| ----- | --------------------- | ------------------------------------------------------------------------------------- |
| 0.0   | Not helpful           | Athlete would get no value from this response.                                        |
| 0.25  | Slightly helpful      | Points in the right direction but athlete would need significant additional research. |
| 0.5   | Moderately helpful    | Gives useful information but athlete may need to follow up on specifics.              |
| 0.75  | Very helpful          | Athlete can act on this with minimal additional effort.                               |
| 1.0   | Exceptionally helpful | Athlete has everything needed to take action, including contacts and next steps.      |

### Factual Accuracy (`accuracy`)

| Score | Label            | Description                                                     |
| ----- | ---------------- | --------------------------------------------------------------- |
| 0.0   | Incorrect        | Contains fabricated or fundamentally wrong information.         |
| 0.25  | Mostly incorrect | More wrong than right; key facts are inaccurate.                |
| 0.5   | Mixed            | Core facts are right but some claims are unsupported or wrong.  |
| 0.75  | Mostly accurate  | Facts are correct with only minor inaccuracies or imprecisions. |
| 1.0   | Fully accurate   | All claims are supported by source documents or known policy.   |

### Completeness (`completeness`)

| Score | Label         | Description                                                         |
| ----- | ------------- | ------------------------------------------------------------------- |
| 0.0   | Incomplete    | Misses the core of what was asked.                                  |
| 0.25  | Partial       | Addresses part of the question but skips major aspects.             |
| 0.5   | Adequate      | Covers the main point but misses supporting details.                |
| 0.75  | Thorough      | Covers the question well with only minor gaps.                      |
| 1.0   | Comprehensive | Fully addresses all aspects of the question with appropriate depth. |

### Tone (`tone`)

| Score | Label         | Description                                                            |
| ----- | ------------- | ---------------------------------------------------------------------- |
| 0.0   | Inappropriate | Dismissive, condescending, or insensitive to the athlete's situation.  |
| 0.25  | Off-putting   | Too robotic, overly formal, or fails to acknowledge emotional context. |
| 0.5   | Neutral       | Professional but lacks warmth or empathy where appropriate.            |
| 0.75  | Good          | Professional, empathetic, and appropriate for the context.             |
| 1.0   | Excellent     | Perfectly calibrated tone — supportive, clear, and athlete-centered.   |

## Online Evaluator Feedback Keys

All evaluators target the `usopc-quality-review` project in LangSmith.

| Feedback Key                | Type           | Evaluator Type | Description                                            |
| --------------------------- | -------------- | -------------- | ------------------------------------------------------ |
| `online_disclaimer_present` | Binary 0/1     | Code           | Checks answer has `---` separator + contact info regex |
| `online_trajectory_match`   | Binary 0/1     | Code           | Exact match of trajectory vs expected_path             |
| `online_trajectory_subset`  | Binary 0/1     | Code           | Expected path nodes are a subset of actual trajectory  |
| `online_fact_coverage`      | Continuous 0–1 | Code           | Proportion of required_facts found in answer           |
| `online_quality`            | Continuous 0–1 | LLM-as-judge   | Overall response quality                               |
| `online_helpfulness`        | Continuous 0–1 | LLM-as-judge   | Actionability for athletes                             |
| `online_accuracy`           | Continuous 0–1 | LLM-as-judge   | Factual correctness                                    |
| `online_completeness`       | Continuous 0–1 | LLM-as-judge   | Coverage of the question                               |
| `online_tone`               | Continuous 0–1 | LLM-as-judge   | Empathy and athlete-appropriateness                    |

## Failure Mode Taxonomy

Each failure code is tied to a graph node and has a severity level. The full taxonomy lives in `packages/evals/src/quality-review/taxonomy.ts`.

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

### Clarify

| Code               | Label                     | Severity |
| ------------------ | ------------------------- | -------- |
| `CLR_UNNECESSARY`  | Unnecessary clarification | low      |
| `CLR_WRONG_ASPECT` | Clarified wrong dimension | medium   |
| `CLR_LOOPING`      | Clarification loop        | medium   |

### Retriever

| Code                 | Label                      | Severity |
| -------------------- | -------------------------- | -------- |
| `RET_IRRELEVANT`     | Retrieved off-topic docs   | high     |
| `RET_MISSING_SOURCE` | KB lacks content           | medium   |
| `RET_LOW_CONFIDENCE` | Low retrieval confidence   | medium   |
| `RET_WRONG_NGB_DOCS` | Wrong NGB documents        | high     |
| `RET_STALE_CONTENT`  | Outdated content retrieved | medium   |

### Researcher

| Code               | Label                  | Severity |
| ------------------ | ---------------------- | -------- |
| `RSR_IRRELEVANT`   | Off-topic web results  | high     |
| `RSR_OUTDATED_WEB` | Stale web results      | medium   |
| `RSR_UNNECESSARY`  | Unnecessary web search | low      |

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

### Escalate

| Code                  | Label                        | Severity |
| --------------------- | ---------------------------- | -------- |
| `ESC_WRONG_TARGET`    | Escalated to wrong authority | critical |
| `ESC_WRONG_URGENCY`   | Wrong urgency level          | high     |
| `ESC_MISSING_CONTACT` | Missing escalation contact   | high     |

### CitationBuilder

| Code               | Label                        | Severity |
| ------------------ | ---------------------------- | -------- |
| `CIT_MISSING`      | No citations provided        | high     |
| `CIT_WRONG_SOURCE` | Citations don't match claims | high     |
| `CIT_BROKEN_URL`   | Broken citation URL          | medium   |
| `CIT_INSUFFICIENT` | Too few citations            | medium   |

### DisclaimerGuard

| Code                 | Label                       | Severity |
| -------------------- | --------------------------- | -------- |
| `DIS_MISSING`        | Missing required disclaimer | high     |
| `DIS_WRONG_DOMAIN`   | Wrong disclaimer domain     | medium   |
| `DIS_MISSING_SAFETY` | Missing safety contact info | critical |

### QueryPlanner (flag-gated)

| Code                      | Label                     | Severity |
| ------------------------- | ------------------------- | -------- |
| `QPL_WRONG_DECOMPOSITION` | Wrong query decomposition | high     |
| `QPL_REDUNDANT_SPLITS`    | Redundant sub-queries     | low      |

### RetrievalExpander (flag-gated)

| Code                     | Label                    | Severity |
| ------------------------ | ------------------------ | -------- |
| `RXP_POOR_REFORMULATION` | Poor query reformulation | medium   |
| `RXP_UNNECESSARY`        | Unnecessary expansion    | low      |

### EmotionalSupport (flag-gated)

| Code                    | Label                          | Severity |
| ----------------------- | ------------------------------ | -------- |
| `EMO_TONE_MISS`         | Failed to acknowledge distress | high     |
| `EMO_OVER_CLINICAL`     | Too clinical response          | medium   |
| `EMO_MISSING_RESOURCES` | Missing crisis contacts        | high     |

### QualityChecker (flag-gated)

| Code                    | Label                       | Severity |
| ----------------------- | --------------------------- | -------- |
| `QCK_FALSE_PASS`        | Approved low-quality answer | high     |
| `QCK_FALSE_FAIL`        | Rejected adequate answer    | medium   |
| `QCK_RETRY_DEGRADATION` | Retry degraded answer       | medium   |

### Cross-cutting

| Code                   | Label                                 | Severity |
| ---------------------- | ------------------------------------- | -------- |
| `XCT_GENERIC_RESPONSE` | Generic when specific guidance exists | high     |
| `XCT_SCOPE_LEAK`       | Answered out-of-scope question        | medium   |
| `XCT_CONTEXT_LOST`     | Lost conversation context             | high     |
| `XCT_WRONG_SPORT`      | Applied wrong sport's rules           | high     |
| `XCT_LATENCY`          | Unacceptable latency                  | low      |

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

## Severity Definitions

| Severity | Description                                                              |
| -------- | ------------------------------------------------------------------------ |
| critical | Safety risk, harmful misinformation, or missed emergency escalation      |
| high     | Significantly wrong or unhelpful — athlete could be materially misled    |
| medium   | Noticeable quality gap but not dangerous — athlete gets a partial answer |
| low      | Minor issue — slightly suboptimal but still useful                       |
