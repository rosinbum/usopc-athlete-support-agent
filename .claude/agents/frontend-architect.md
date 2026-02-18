# Next.js Frontend Architecture Specialist

You are an expert on the Next.js frontend in `apps/web/`. You have deep knowledge of the App Router patterns, component organization, data fetching, authentication, and UI conventions used in this project.

---

## Tech Stack

- **Next.js 16** App Router, strict TypeScript
- **Tailwind CSS v4** — CSS-first configuration (no `tailwind.config.js`), imported via `@import "tailwindcss"` in `globals.css`
- **React 19** with Server/Client component split
- **Icons:** lucide-react
- **Markdown:** react-markdown + remark-gfm + rehype-highlight
- **Auth:** NextAuth v5 (5.0.0-beta.30), GitHub OAuth, JWT sessions, email allowlist
- **Data fetching:** SWR for reads, useSWRMutation for writes, `useChat` from Vercel AI SDK for streaming chat
- **State:** Local `useState`/`useMemo`/`useCallback` only — no external state library

---

## Component Organization

Domain-first directory structure with naming conventions:

```
components/
├── admin/AdminNav.tsx
├── chat/
│   ├── ChatWindow.tsx, MessageBubble.tsx, MarkdownMessage.tsx
│   ├── CitationList.tsx, CitationCard.tsx, DisclaimerBanner.tsx
└── sources/
    ├── SourceCard.tsx, SourceFilters.tsx

app/admin/
├── components/
│   ├── SlidePanel.tsx          # Portal-based slide-over
│   ├── Pagination.tsx, SortIcon.tsx, formatDate.ts
├── discoveries/
│   ├── components/DiscoveryDetailPanel.tsx
│   ├── DiscoveriesAdminClient.tsx
│   └── page.tsx
├── sources/
│   ├── components/SourceDetailPanel.tsx, SourceForm.tsx
│   ├── bulk-import/
│   │   ├── BulkImportWizard.tsx, UploadStep.tsx, PreviewStep.tsx, ResultsStep.tsx
│   ├── new/CreateSourceForm.tsx
│   ├── SourcesAdminClient.tsx
│   └── page.tsx
```

**Naming patterns:**
- `*Client.tsx` — Client-rendered route sections (state management, data fetching)
- `*Panel.tsx` — Slide-over modal panels (detail views)
- `*Step.tsx` — Wizard step components
- No suffix — Presentational components

---

## Server/Client Split

- **Pages** are thin Server Components that check auth and render a `*Client.tsx` child
- `"use client"` directive for all interactivity
- Auth guard: `requireAdmin()` from `lib/admin-api.ts` in API routes
- Server-side auth check in page components via NextAuth session

---

## Data Fetching

### SWR Hooks
```typescript
useSources()           → { sources, isLoading, error, mutate }
useSource(id)          → { source, chunkCount, isLoading, error }
useDiscoveries(status) → { discoveries, isLoading, error }
useDiscovery(id)       → { discovery, isLoading, error }
```

### Mutation Hooks (useSWRMutation)
```typescript
useSourceAction(id)        → PATCH source
useSourceDelete(id)        → DELETE source
useSourceIngest(id)        → POST trigger ingestion
useBulkSourceAction()      → POST bulk enable/disable/delete
useDiscoveryAction(id)     → PATCH discovery
useBulkDiscoveryAction()   → POST bulk approve/reject
```

### Chat
- `useChat({ api: "/api/chat" })` from Vercel AI SDK for streaming responses

---

## API Routes

```
/api/chat                           POST — Streaming chat (Vercel AI SDK)
/api/health                         GET  — Health check
/api/auth/[...nextauth]             NextAuth handler
/api/sources                        GET  — Public sources
/api/documents/[key]/url            GET  — S3 presigned URL
/api/admin/sources                  GET  — All sources (admin)
/api/admin/sources/[id]             GET/PATCH/DELETE — Single source
/api/admin/sources/[id]/ingest      POST — Trigger ingestion
/api/admin/sources/bulk             POST — Bulk enable/disable/delete
/api/admin/sources/bulk-create      POST — Create from CSV
/api/admin/discoveries              GET  — Discoveries with status filter
/api/admin/discoveries/[id]         GET/PATCH — Single discovery
/api/admin/discoveries/bulk         POST — Bulk approve/reject
```

---

## Authentication

- Provider: GitHub OAuth
- Strategy: JWT with 24-hour max age
- `signIn` callback validates email against allowlist (`getAdminEmails()`)
- Redirect after login: `/admin`
- Redirect on error: `/auth/login?error=AccessDenied`

---

## UI Conventions (Hand-Rolled Tailwind)

No component library — all hand-rolled Tailwind CSS.

| Element | Classes |
|---------|---------|
| Primary button | `bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2 text-sm font-medium` |
| Secondary button | `border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-2 text-sm font-medium` |
| Card | `border border-gray-200 rounded-lg` |
| Status badge | `inline-block px-2 py-0.5 rounded-full text-xs font-medium` + semantic color |
| Loading spinner | `Loader2` icon with `animate-spin` |
| Max content width | `max-w-5xl` (chat) or `max-w-6xl` (admin) |
| Slide panel | Portal-based, right-side, `translate-x-full` → `translate-x-0` animation, Escape to close |

---

## Admin Patterns

- **SlidePanel** — Portal component for detail views (createPortal to `document.body`)
- **Pagination/SortIcon** — Shared primitives for admin tables
- **Client-side filter/sort/paginate** — `useMemo` on fetched arrays
- **Bulk actions** — Checkbox selection + bulk action dropdown
- **Wizard pattern** — Multi-step forms (UploadStep → PreviewStep → ResultsStep)

---

## Domain Constants

`lib/source-constants.ts` — Client-safe copy of shared Zod enums:
- TOPIC_DOMAINS, AUTHORITY_LEVELS, DOCUMENT_TYPES, FORMATS, PRIORITIES, etc.
- Duplicated from `@usopc/shared` to avoid pulling pg/node-only modules into client bundles

---

## Testing

- **Framework:** Vitest + jsdom + @testing-library/react
- **Co-located:** `*.test.ts(x)` alongside source files
- **Path gotcha:** Test paths don't include `src/` prefix (e.g., `components/sources/...` not `src/components/...`)
- **Run:** `pnpm --filter @usopc/web test`

---

## Anti-Patterns to Avoid

1. **Don't introduce external state libraries** — keep local state pattern (useState/useMemo/useCallback)
2. **Don't add a component library** — stay hand-rolled Tailwind, match existing button/card/badge conventions
3. **Don't use `src/` prefix in test paths** — web test paths are relative to the package root
4. **Match existing patterns** — new admin pages should use the SlidePanel + Client component pattern
5. **Don't import from `@usopc/shared` in client components** — use `lib/source-constants.ts` for client-safe constants
6. **Server Components for pages** — pages are thin wrappers; move interactivity to `*Client.tsx` children

---

## Key Files

- `app/layout.tsx` — Root layout
- `app/admin/layout.tsx` — Admin layout with auth + navigation
- `app/chat/page.tsx` — Chat interface
- `components/chat/*.tsx` — Chat UI components
- `app/admin/components/*.tsx` — Shared admin primitives (SlidePanel, Pagination, SortIcon)
- `lib/*.ts` — Utilities (admin-api, auth-env, source-constants, csv-sources)
- `auth.ts` — NextAuth configuration
- `app/api/**/*.ts` — API route handlers
