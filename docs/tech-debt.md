# Technical Debt

Assessed 2026-02-09. Items marked ~~strikethrough~~ have been resolved.

---

## Resolved

- ~~**Standardize `pg` to `^8.14.1`** across all packages~~ (PR #77)
- ~~**Move `@types/pg` to devDependencies** in `packages/shared`~~ (PR #77)
- ~~**Extract `getLastUserMessage()` helper** — was duplicated in 4 agent nodes~~ (PR #77)
- ~~**Add typed `SportOrganization` interface** to NGB router — was using `any` throughout~~ (PR #77)

---

## Incomplete Integrations (HIGH)

The AI agent is not wired into the app surfaces yet. Handlers return placeholder responses.

| Location | Issue | Tracked |
|---|---|---|
| `apps/slack/src/handlers/slashCommand.ts:62` | TODO: Invoke LangGraph agent | #7 |
| `apps/slack/src/handlers/mention.ts:41` | TODO: Invoke LangGraph agent | #7 |
| `apps/slack/src/handlers/message.ts:35` | Returns placeholder block response | #7 |
| `apps/api/src/routers/chat.ts:14` | TODO: Wire to agent graph | #5 |
| `apps/slack/src/index.ts:118` | TODO: Store feedback via tRPC API | — |

## Test Coverage Gaps (HIGH)

| Package | Test Files | Source Files | Coverage | Priority |
|---|---|---|---|---|
| `apps/slack` | 0 | 10 | 0% | Critical |
| `apps/api` | 2 | 11 | 18% | High |
| `apps/web` | 6 | 43 | 14% | High |
| `packages/core` | 31 | 61 | 51% | Moderate (strong for logic, weak for config/data) |
| `packages/ingestion` | 12 | 32 | 38% | Moderate |
| `packages/shared` | 5 | 8 | 63% | Low |

Key untested files:
- `packages/shared/src/pool.ts` — critical database singleton
- `apps/slack/src/handlers/*` — all event handlers
- `apps/api/src/routers/chat.ts` — core chat endpoint
- `apps/web/app/api/chat/route.ts` — web chat endpoint

## Dependency Issues (MEDIUM)

- **Vitest version drift**: `apps/web` on `^2.1.9` while everything else is `^2.1.8`
- **Missing explicit dep**: `apps/web` uses `zod` transitively but doesn't declare it in `package.json`
- **`@types/pg` version inconsistency**: `core` and `ingestion` on `^8.11.10`, `shared` on `^8.11.11`

## Type Safety (MEDIUM)

- **`Promise<any>` in chat route**: `apps/web/app/api/chat/route.ts` disables eslint rather than typing properly
- **LangChain message casts**: `isUserMessage()` helper still uses `as unknown as Record<string, unknown>` internally — this is a LangChain type limitation, not easily fixable

## Error Handling & Observability (MEDIUM)

- **Silent error swallowing**: `apps/api/src/routers/ngbs.ts` catches file-read errors with bare `catch { continue }` — no logging
- **Console instead of logger**: `apps/web/app/api/chat/route.ts` has 7 `console.log` calls instead of structured logger
- **No retry for Slack posts**: Slack message delivery failures are fire-and-forget

## Architecture TODOs (MEDIUM)

| Description | Location | Tracked |
|---|---|---|
| Conversation summarization for long chats | `packages/core/src/agent/nodes/classifier.ts:173` | #35 |
| Dedicated query reformulation node | `packages/core/src/agent/nodes/retriever.ts:53` | #37 |
| Database persistence for conversations | — | #36 |
| Error handling for API routes and streaming | — | #31 |

## Code Duplication (LOW)

- **Error message extraction**: Multiple files repeat `error instanceof Error ? error.message : String(error)` — could extract a shared helper
- **NGB filtering in `ngbs.ts`**: Filtering logic could be simplified but is minor

## Critical Open Issues

These should be prioritized before additional feature work:

- **#53**: Narrow retrieval returns 0 results (affects core agent behavior)
- **#52**: Ingestion metadata mapping broken (data quality)
- **#5, #7**: Agent integration incomplete (partial functionality in API/Slack)
- **#31**: Error handling missing from critical paths
