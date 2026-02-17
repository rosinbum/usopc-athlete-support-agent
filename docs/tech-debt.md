# Technical Debt

Assessed 2026-02-17. Items marked ~~strikethrough~~ have been resolved.

---

## Resolved

- ~~**Standardize `pg` to `^8.14.1`** across all packages~~ (PR #77)
- ~~**Move `@types/pg` to devDependencies** in `packages/shared`~~ (PR #77)
- ~~**Extract `getLastUserMessage()` helper** — was duplicated in 4 agent nodes~~ (PR #77)
- ~~**Add typed `SportOrganization` interface** to NGB router — was using `any` throughout~~ (PR #77)
- ~~**Orphaned `shouldEscalate` edge function** — never used in graph.ts~~ (PR #149)
- ~~**Unused `loadHtml` import** in pipeline.ts~~ (PR #149)
- ~~**`.gitignore` had specific file path** instead of directory pattern~~ (PR #149)
- ~~**`@usopc/evals` undocumented** in architecture.md and commands.md~~ (PR #149)
- ~~**Phantom `pnpm lint` and `pnpm db:migrate` commands** referenced in docs~~ (PR #149)
- ~~**Ingestion metadata mapping broken** (#52, #53)~~
- ~~**Conversation summarization for long chats** (#35)~~
- ~~**Database persistence for conversations** (#36)~~
- ~~**Dedicated query reformulation node** (#37)~~
- ~~**Web chat route used `console.log`** — now uses structured logger~~
- ~~**`apps/web` missing explicit `zod` dep** — now declared~~

---

## Incomplete Integrations (HIGH)

The AI agent is wired into the web UI but not into the API or Slack surfaces.

| Location                                     | Issue                              | Tracked |
| -------------------------------------------- | ---------------------------------- | ------- |
| `apps/slack/src/handlers/slashCommand.ts:62` | TODO: Invoke LangGraph agent       | #7      |
| `apps/slack/src/handlers/mention.ts:41`      | TODO: Invoke LangGraph agent       | #7      |
| `apps/slack/src/handlers/message.ts:35`      | Returns placeholder block response | #7      |
| `apps/api/src/routers/chat.ts:14`            | TODO: Wire to agent graph          | #5      |
| `apps/slack/src/index.ts:118`                | TODO: Store feedback via tRPC API  | —       |

## Test Coverage Gaps (HIGH)

| Package      | Test Files | Source Files | Priority |
| ------------ | ---------- | ------------ | -------- |
| `apps/slack` | 0          | 10           | Critical |
| `apps/api`   | 3          | 11           | High     |

Key untested files:

- `apps/slack/src/handlers/*` — all event handlers
- `apps/api/src/routers/chat.ts` — core chat endpoint

## Dependency Issues (LOW)

- **Vitest version drift**: `apps/web` on `^2.1.9` while everything else is `^2.1.8`
- **`@types/pg` version inconsistency**: `shared`/`api` on `^8.11.11`, `core`/`ingestion` on `^8.11.10`

## Architecture TODOs (MEDIUM)

| Description                                 | Location                                        | Tracked |
| ------------------------------------------- | ----------------------------------------------- | ------- |
| Error handling for API routes and streaming | —                                               | #31     |
| Stale TODO referencing closed #37           | `packages/core/src/agent/nodes/retriever.ts:54` | #37 ✅  |

## Critical Open Issues

- **#5**: Wire LangGraph agent into tRPC API endpoints
- **#7**: Wire LangGraph agent into Slack bot handlers
- **#31**: Error handling missing from critical API paths
