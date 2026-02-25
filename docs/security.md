# Security Documentation

This document describes the security architecture, authentication model, secret management, and known findings for the USOPC Athlete Support Agent.

## Authentication Architecture

The application uses [Auth.js v5](https://authjs.dev/) (NextAuth) with JWT-based sessions (24-hour expiry). Two identity providers serve different user roles:

### GitHub OAuth (Admin)

Admins sign in via GitHub OAuth. The sign-in callback validates the user's email against the `ADMIN_EMAILS` allowlist (a comma-separated SST secret, Zod-validated at runtime). Only emails on the allowlist receive the `"admin"` role stamped into the JWT.

**Configuration:** `apps/web/auth.ts`

### Resend Magic Link (Athlete)

Athletes sign in via email magic link (Resend provider). The sign-in callback checks the email against a DynamoDB invite table (`inviteEntity.isInvited(email)`). Invited users receive the `"athlete"` role.

### Fallthrough

Any sign-in attempt that doesn't match a GitHub admin email or an invited athlete email is rejected (`signIn` returns `false`).

### Admin Access Control Model

**Determining admin status:**

Admin users are determined by the `AdminEmails` SST secret — a comma-separated list of email addresses. When a user signs in via GitHub OAuth, the callback checks their email against this allowlist. Matching emails receive `role: "admin"` in the JWT.

**Configuring admins:**

```bash
# Set admin emails (comma-separated, no spaces)
sst secret set AdminEmails "admin1@example.com,admin2@example.com" --stage production

# Verify current value
sst secret list --stage production
```

Changes require redeployment (`sst deploy`) to take effect in Lambda environments.

**Admin capabilities:**

- **Source management:** Create, read, update, delete, enable/disable knowledge base source configurations
- **Ingestion control:** Trigger ingestion pipeline for individual sources or in bulk
- **Discovery review:** Approve, reject, or promote auto-discovered source candidates into the knowledge base
- **Document access:** Generate presigned S3 URLs for viewing archived documents
- **Bulk operations:** Bulk enable/disable/delete sources, bulk approve/reject discoveries (max 100 per request)

**Granting access:** Add the user's email to `AdminEmails` and redeploy.

**Revoking access:** Remove the user's email from `AdminEmails` and redeploy. Existing sessions (up to 24 hours) remain valid until they expire.

**Known limitation:** The admin guard checks session role only, not the current email allowlist. A revoked admin retains access until their JWT expires. See [#217](https://github.com/rosinbum/usopc-athlete-support-agent/issues/217) for the planned fix.

**Invite management** (non-admin routes): The invite endpoints (`/api/admin/invites`) require a valid session but do not enforce admin role. Any authenticated user can manage invites. See the [API Reference](./api-reference.md#admin--invites) for details.

### Session Model

| Field             | Source                                                                      |
| ----------------- | --------------------------------------------------------------------------- |
| `role`            | `"admin"` (GitHub) or `"athlete"` (Resend) — set at sign-in, carried in JWT |
| `email`           | From OAuth/magic-link, lowercased                                           |
| `name`, `picture` | From OAuth provider                                                         |

Role is determined at initial sign-in and is not re-evaluated on subsequent requests within the 24-hour session window.

## API Authentication Requirements

### Endpoint Inventory

| Route                       | Method | Auth Level | Guard                                                              |
| --------------------------- | ------ | ---------- | ------------------------------------------------------------------ |
| `/api/health`               | GET    | Public     | None                                                               |
| `/api/chat`                 | POST   | Public     | Rate-limited (20/5min per IP, 100/5min global per Lambda instance) |
| `/api/sources`              | GET    | Public     | None                                                               |
| `/api/auth/[...nextauth]`   | ALL    | Public     | NextAuth internals                                                 |
| `/api/documents/[key]/url`  | GET    | Admin      | `requireAdmin()` + S3 path validation                              |
| `/api/admin/sources/**`     | ALL    | Admin      | Middleware + `requireAdmin()`                                      |
| `/api/admin/discoveries/**` | ALL    | Admin      | Middleware + `requireAdmin()`                                      |
| `/api/admin/invites`        | ALL    | Session    | `auth()` session check (role not verified)                         |

### Defense in Depth

Admin routes are protected by two layers:

1. **Edge middleware** (`apps/web/middleware.ts`) — intercepts requests matching `/admin/*` and `/api/admin/*`. Redirects unauthenticated users to login and non-admin users to an access-denied page.
2. **Per-handler guard** (`apps/web/lib/admin-api.ts`) — `requireAdmin()` is called at the start of each admin route handler, returning 401/403 as appropriate.

### Rate Limiting

**File:** `apps/web/lib/rate-limit.ts`

The chat endpoint uses a fixed-window in-memory rate limiter:

- **Per-IP:** 20 requests per 5-minute window
- **Global:** 100 requests per 5-minute window (per Lambda instance)
- Cleanup runs every 60 seconds
- IP extracted from `x-forwarded-for` header

**Limitation:** State is not shared across Lambda instances. Effective limits scale with Lambda concurrency. A distributed rate limiter (e.g., DynamoDB or ElastiCache-backed) would be needed for stricter enforcement.

### Chat Endpoint (Public)

The chat endpoint is intentionally unauthenticated to maximize accessibility for athletes. Any visitor can invoke the full LLM pipeline (Claude, OpenAI embeddings, Tavily search). The rate limiter is the primary abuse control.

## Secret Management

### SST Secrets

All secrets are managed via `sst.Secret` in `sst.config.ts`. SST injects them as environment variables at Lambda boot time.

**Naming convention:** PascalCase for SST (`AnthropicApiKey`), `SCREAMING_SNAKE_CASE` for env vars (`ANTHROPIC_API_KEY`).

| SST Secret             | Env Var                  | Purpose                           | Linked To           |
| ---------------------- | ------------------------ | --------------------------------- | ------------------- |
| `AnthropicApiKey`      | `ANTHROPIC_API_KEY`      | Claude LLM API                    | Web, Slack          |
| `OpenaiApiKey`         | `OPENAI_API_KEY`         | OpenAI embeddings                 | Web, Slack          |
| `GoogleApiKey`         | `GOOGLE_API_KEY`         | Google LLM/search                 | Web, Slack          |
| `TavilyApiKey`         | `TAVILY_API_KEY`         | Tavily web search                 | Web, Slack          |
| `LangchainApiKey`      | `LANGCHAIN_API_KEY`      | LangSmith tracing                 | Web, Slack          |
| `SlackBotToken`        | `SLACK_BOT_TOKEN`        | Slack API calls                   | Slack only          |
| `SlackSigningSecret`   | `SLACK_SIGNING_SECRET`   | Slack request verification        | Slack only          |
| `AuthSecret`           | `AUTH_SECRET`            | NextAuth JWT signing              | Web only            |
| `GitHubClientId`       | `GITHUB_CLIENT_ID`       | GitHub OAuth app ID               | Web only            |
| `GitHubClientSecret`   | `GITHUB_CLIENT_SECRET`   | GitHub OAuth app secret           | Web only            |
| `AdminEmails`          | `ADMIN_EMAILS`           | Admin allowlist (comma-separated) | Web only            |
| `ResendApiKey`         | `RESEND_API_KEY`         | Email magic-link provider         | Web only            |
| `ConversationMaxTurns` | `CONVERSATION_MAX_TURNS` | Agent turn limit (default: 5)     | Web only            |
| `DatabaseUrl`          | `DATABASE_URL`           | Neon PostgreSQL connection string | Web, Slack, workers |

### Non-SST Environment Variables

These are passed from deploy-time `process.env`, not SST secrets:

- `TAVILY_MONTHLY_BUDGET` — Monthly cost cap for Tavily
- `ANTHROPIC_MONTHLY_BUDGET` — Monthly cost cap for Anthropic
- `SLACK_WEBHOOK_URL` — Slack webhook for pipeline notifications
- `NOTIFICATION_EMAIL` — Email for CloudWatch alarm notifications
- `SES_FROM_EMAIL` — SES sender address for discovery reports

### Rotation

Secrets are injected at Lambda cold-start and persist across warm invocations. Rotating a secret requires redeployment (`sst deploy`) to take effect. There is no automated rotation schedule.

### Local Development

`DatabaseUrl` defaults to `postgresql://postgres:postgres@localhost:5432/usopc_athlete_support` when the SST stage is not `production` or `staging`. All other secrets must be explicitly set via `sst secret set`.

## LLM-Specific Security

### Prompt Injection Mitigations

**Input validation** (`apps/web/app/api/chat/route.ts`):

- Message content capped at 10,000 characters
- Message array capped at 50 entries
- Role restricted to `"user" | "assistant"` — no `"system"` role injection via the API

**Structured routing:** The classifier (`packages/core/src/prompts/classifier.ts`) uses structured output with `shouldEscalate` and `escalationReason` fields. This routing decision is made before any LLM-synthesized response, limiting the blast radius of prompt injection.

**Anti-hallucination instructions** (`packages/core/src/prompts/synthesizer.ts`):

> "Do not introduce facts, rules, procedures, or provisions that are not present in the provided context. Never fabricate."

### Web Search — Trusted Domain Filtering

**Files:** `packages/core/src/tools/webSearch.ts`, `packages/core/src/config/settings.ts`

Two layers of domain restriction:

1. **Tavily API call** uses `includeDomains` — Tavily only searches within the trusted domain list
2. **Post-filter** (`filterToTrustedDomains()`) removes any result whose hostname doesn't match a trusted domain or its subdomains

The allowlist contains ~55 official domains: `usopc.org`, `teamusa.org`, `usada.org`, `safesport.org`, `tas-cas.org`, plus ~50 international federation domains. NGB-specific domains are added dynamically from a registry.

### Domain-Specific Disclaimers

Every response is appended with a topic-appropriate disclaimer (`packages/core/src/prompts/disclaimer.ts`):

- **General:** "educational purposes only, does not constitute legal advice"
- **SafeSport:** "If you are in immediate danger, call 911" + SafeSport contact info
- **Anti-doping:** "seek legal counsel immediately" for violation notifications
- **Dispute resolution:** Athlete Ombuds contact (ombudsman@usathlete.org, 719-866-5000)

### PII Handling

- User emails are lowercased at auth time and stored in the JWT — not persisted to a database
- Chat requests are not logged with user content (only `"POST /api/chat called"` appears in logs)
- Slack feedback logs contain `user.id` (Slack user ID) and channel ID — no PII
- The `userSport` field is optional and user-supplied; it flows into agent state but is not persisted

## SQL Injection Prevention

All database queries use parameterized placeholders (`$1`, `$2`, etc.) via the `pg` driver. ILIKE queries use `escapeIlike()` with explicit `ESCAPE '\\'` to prevent wildcard injection.

**Files:** `packages/shared/src/pool.ts`, all query files in `packages/core/src/` and `packages/ingestion/src/`

## S3 Path Traversal Prevention

The presigned URL endpoint (`apps/web/app/api/documents/[key]/url/route.ts`) validates the S3 key:

- Must start with `sources/`
- Must not contain `..`

This prevents directory traversal attacks via crafted S3 keys.

## Known Security Findings

The following findings are from a comprehensive security audit (`.full-review/02-security-performance.md`). Status reflects the current codebase.

### Resolved

| ID     | Severity | Title                                                   | Resolution                                                        |
| ------ | -------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| SEC-C1 | Critical | Middleware not auto-discovered by Next.js               | Fixed — file renamed to `middleware.ts` with correct edge matcher |
| SEC-C2 | Critical | Missing Zod validation on bulk source endpoints         | Fixed — `bulkSchema` with `.max(100)` added                       |
| SEC-H2 | High     | Presigned URL used `auth()` instead of `requireAdmin()` | Fixed — now uses `requireAdmin()`                                 |
| SEC-H3 | High     | `unsafe-eval` in production CSP                         | Fixed — `next.config.ts` conditionalizes on `isDev`               |
| SEC-H4 | High     | Sources endpoint exposed `s3Key`, `ngbId`, `chunkCount` | Fixed — response mapping strips internal fields                   |
| SEC-M2 | Medium   | No upper bound on bulk arrays                           | Fixed — `.max(100)` added                                         |

### Open / Partially Mitigated

| ID     | Severity | Title                                                 | Status                                                                                                        |
| ------ | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SEC-H1 | High     | No rate limiting on chat endpoint                     | Partially mitigated — in-process rate limiter added; per-instance only                                        |
| SEC-M1 | Medium   | `trustHost: true` bypasses host validation in Auth.js | Open — `auth.ts:20`                                                                                           |
| SEC-M3 | Medium   | Error messages leak internals                         | Partially mitigated — catch blocks return generic messages; stream errors still forward `event.error.message` |
| SEC-L1 | Low      | Permissive `connect-src 'self' https:` in CSP         | Open                                                                                                          |
| SEC-L5 | Low      | Silent error swallowing in bulk operations            | Open                                                                                                          |
| SEC-L6 | Low      | HSTS missing `preload` directive                      | Open                                                                                                          |

### Accepted Risks

| ID     | Severity | Title                                                              | Rationale                                         |
| ------ | -------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| SEC-L2 | Low      | Chat endpoint unauthenticated — knowledge base extraction possible | By design — prioritizes athlete accessibility     |
| SEC-L3 | Low      | No explicit CSRF protection                                        | Mitigated by CORS preflight for JSON content type |
| SEC-L4 | Low      | Secrets persist in `process.env` across warm Lambda invocations    | Standard Lambda behavior                          |

## Compliance Posture

### OWASP Top 10 Coverage

| #   | Category                  | Status                                                                               |
| --- | ------------------------- | ------------------------------------------------------------------------------------ |
| A01 | Broken Access Control     | Mitigated — middleware + per-handler guards; invites endpoint is an exception        |
| A02 | Cryptographic Failures    | Mitigated — JWT signing via Auth.js; secrets managed by SST; HTTPS enforced          |
| A03 | Injection                 | Mitigated — parameterized SQL queries; Zod input validation; S3 path checks          |
| A04 | Insecure Design           | Mitigated — defense in depth for admin routes; structured LLM routing                |
| A05 | Security Misconfiguration | Partially — `trustHost: true`, permissive CSP `connect-src` remain open              |
| A06 | Vulnerable Components     | Unknown — dependency audit needed                                                    |
| A07 | Auth Failures             | Mitigated — allowlist-gated OAuth + invite-gated magic link                          |
| A08 | Data Integrity Failures   | Mitigated — Slack request signing verification; no deserialization of untrusted data |
| A09 | Logging & Monitoring      | Mitigated — CloudWatch alarms, structured logging, LangSmith tracing                 |
| A10 | SSRF                      | Mitigated — trusted domain allowlist for web search; no user-controlled URL fetching |

### Data Handling

- No athlete PII is stored in the database — the system answers questions from public governance documents
- Chat conversations are not persisted by default (conversation memory uses DynamoDB with TTL)
- The knowledge base contains only publicly available USOPC governance documents
