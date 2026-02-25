# API Reference

Complete endpoint reference for the USOPC Athlete Support Agent. For authentication architecture and security details, see [Security](./security.md).

## Authentication

Three access levels protect API routes:

| Level       | Description                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **Public**  | No authentication required                                                                      |
| **Session** | Requires a valid NextAuth session (any role)                                                    |
| **Admin**   | Requires a valid NextAuth session with `role: "admin"` (GitHub OAuth, email on admin allowlist) |

Admin routes are protected by both edge middleware and per-handler `requireAdmin()` guards. See [Security — Defense in Depth](./security.md#defense-in-depth).

## Error Responses

All error responses follow a consistent shape:

```json
{
  "error": "Human-readable error message"
}
```

Validation errors include field-level details:

```json
{
  "error": "Validation failed",
  "details": {
    "fieldName": ["error message 1", "error message 2"]
  }
}
```

Common HTTP status codes: `400` (validation), `401` (unauthenticated), `403` (forbidden), `404` (not found), `409` (conflict), `429` (rate limited), `500` (server error), `501` (not available in environment).

---

## Public Endpoints

### `GET /api/health`

Health check for monitoring.

**Auth:** None

```bash
curl https://athlete-agent.rosinbum.org/api/health
```

**Response** `200`:

```json
{
  "status": "ok",
  "timestamp": "2026-02-24T12:00:00.000Z"
}
```

---

### `GET /api/sources`

List knowledge base documents (public-facing, internal fields stripped).

**Auth:** None

**Query parameters:**

| Parameter        | Type    | Default | Description                                        |
| ---------------- | ------- | ------- | -------------------------------------------------- |
| `action`         | string  | —       | If `"stats"`, returns aggregate statistics instead |
| `search`         | string  | —       | Fuzzy title search (ILIKE)                         |
| `documentType`   | string  | —       | Filter by document type                            |
| `topicDomain`    | string  | —       | Filter by topic domain                             |
| `ngbId`          | string  | —       | Filter by NGB organization ID                      |
| `authorityLevel` | string  | —       | Filter by authority level                          |
| `page`           | integer | `1`     | Page number                                        |
| `limit`          | integer | `20`    | Results per page (max 100)                         |

```bash
# List documents
curl "https://athlete-agent.rosinbum.org/api/sources?page=1&limit=10"

# Search
curl "https://athlete-agent.rosinbum.org/api/sources?search=anti-doping"

# Get statistics
curl "https://athlete-agent.rosinbum.org/api/sources?action=stats"
```

**Response (list)** `200`:

```json
{
  "documents": [
    {
      "sourceUrl": "https://example.com/doc.pdf",
      "documentTitle": "USOPC Athlete Handbook",
      "documentType": "handbook",
      "topicDomain": "governance",
      "authorityLevel": "primary",
      "effectiveDate": "2025-01-01",
      "ingestedAt": "2026-02-01T00:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

**Response (stats)** `200`:

```json
{
  "totalDocuments": 42,
  "totalOrganizations": 8,
  "lastIngestedAt": "2026-02-20T02:00:00.000Z"
}
```

---

### `POST /api/chat`

Stream an AI-generated response. Uses Server-Sent Events (SSE).

**Auth:** None (rate-limited)

**Rate limits:**

- 20 requests per 5-minute window per IP
- 100 requests per 5-minute window globally (per Lambda instance)

**Request body:**

| Field                | Type   | Required | Description                          |
| -------------------- | ------ | -------- | ------------------------------------ |
| `messages`           | array  | Yes      | Conversation history (1–50 messages) |
| `messages[].role`    | string | Yes      | `"user"` or `"assistant"`            |
| `messages[].content` | string | Yes      | Message text (max 10,000 characters) |
| `userSport`          | string | No       | Athlete's sport for context          |
| `conversationId`     | string | No       | UUID to continue a conversation      |

```bash
curl -N -X POST https://athlete-agent.rosinbum.org/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "What are the USOPC athlete representation requirements?" }
    ]
  }'
```

**Response:** SSE stream (`text/event-stream`)

The stream emits events via the Vercel AI SDK `createDataStreamResponse()`:

| Event Type            | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `answer-reset`        | Clear previous answer (new response starting)          |
| `text`                | Text delta — streamed token by token                   |
| `data`                | Metadata (status updates, discovered URLs)             |
| `message_annotations` | Citations: `[{ type: "citations", citations: [...] }]` |
| `error`               | Error message                                          |

**Error responses:** `400` (validation), `429` (rate limited), `500` (server error).

---

## Admin — Sources

Manage knowledge base source configurations. All endpoints require admin authentication.

### `GET /api/admin/sources`

List all source configurations.

**Auth:** Admin

**Query parameters:**

| Parameter | Type    | Default | Description                  |
| --------- | ------- | ------- | ---------------------------- |
| `limit`   | integer | `1000`  | Max results (capped at 5000) |

```bash
curl https://athlete-agent.rosinbum.org/api/admin/sources \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "sources": [
    {
      "id": "usopc-bylaws",
      "title": "USOPC Bylaws",
      "documentType": "governing-document",
      "topicDomains": ["governance"],
      "url": "https://usopc.org/bylaws.pdf",
      "format": "pdf",
      "ngbId": null,
      "priority": "high",
      "description": "USOPC governing bylaws",
      "authorityLevel": "primary",
      "enabled": true,
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  ],
  "hasMore": false
}
```

---

### `POST /api/admin/sources`

Create a new source configuration.

**Auth:** Admin

**Request body:**

| Field            | Type     | Required | Description                                  |
| ---------------- | -------- | -------- | -------------------------------------------- |
| `id`             | string   | Yes      | Unique ID (lowercase alphanumeric + hyphens) |
| `title`          | string   | Yes      | Display title                                |
| `documentType`   | string   | Yes      | Document type enum                           |
| `topicDomains`   | string[] | Yes      | Topic domains (min 1)                        |
| `url`            | string   | Yes      | Source URL (must be valid)                   |
| `format`         | string   | Yes      | `"pdf"`, `"html"`, or `"text"`               |
| `ngbId`          | string   | No       | NGB organization ID                          |
| `priority`       | string   | Yes      | `"high"`, `"medium"`, or `"low"`             |
| `description`    | string   | Yes      | Human-readable description                   |
| `authorityLevel` | string   | Yes      | Authority level enum                         |

```bash
curl -X POST https://athlete-agent.rosinbum.org/api/admin/sources \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{
    "id": "usopc-bylaws",
    "title": "USOPC Bylaws",
    "documentType": "governing-document",
    "topicDomains": ["governance"],
    "url": "https://usopc.org/bylaws.pdf",
    "format": "pdf",
    "priority": "high",
    "description": "USOPC governing bylaws",
    "authorityLevel": "primary"
  }'
```

**Response** `201`:

```json
{
  "source": {
    /* full source object */
  }
}
```

**Errors:** `400` (validation), `409` (ID already exists).

---

### `GET /api/admin/sources/[id]`

Get a single source configuration with chunk count.

**Auth:** Admin

```bash
curl https://athlete-agent.rosinbum.org/api/admin/sources/usopc-bylaws \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "source": {
    /* source object */
  },
  "chunkCount": 42
}
```

**Errors:** `404` (not found).

---

### `PATCH /api/admin/sources/[id]`

Update a source configuration. All fields are optional.

**Auth:** Admin

**Request body:** Any subset of the fields from `POST /api/admin/sources` (except `id`), plus:

| Field     | Type    | Description           |
| --------- | ------- | --------------------- |
| `enabled` | boolean | Enable/disable source |

```bash
curl -X PATCH https://athlete-agent.rosinbum.org/api/admin/sources/usopc-bylaws \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "priority": "medium", "enabled": false }'
```

**Response** `200`:

```json
{
  "source": {
    /* updated source */
  },
  "actions": {
    /* metadata about changes */
  }
}
```

**Errors:** `400` (no valid fields provided).

---

### `DELETE /api/admin/sources/[id]`

Delete a source configuration and its document chunks.

**Auth:** Admin

```bash
curl -X DELETE https://athlete-agent.rosinbum.org/api/admin/sources/usopc-bylaws \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "success": true,
  "sourceId": "usopc-bylaws",
  "chunksDeleted": 42
}
```

**Errors:** `404` (not found).

---

### `POST /api/admin/sources/[id]/ingest`

Trigger the ingestion pipeline for a single source.

**Auth:** Admin

```bash
curl -X POST https://athlete-agent.rosinbum.org/api/admin/sources/usopc-bylaws/ingest \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "success": true,
  "sourceId": "usopc-bylaws"
}
```

**Errors:** `404` (source not found), `501` (ingestion queue unavailable in dev).

---

### `POST /api/admin/sources/bulk`

Bulk operations on multiple sources.

**Auth:** Admin

**Request body:**

| Field    | Type     | Required | Description                                        |
| -------- | -------- | -------- | -------------------------------------------------- |
| `action` | string   | Yes      | `"enable"`, `"disable"`, `"ingest"`, or `"delete"` |
| `ids`    | string[] | Yes      | Source IDs (1–100)                                 |

```bash
curl -X POST https://athlete-agent.rosinbum.org/api/admin/sources/bulk \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "action": "enable", "ids": ["source-1", "source-2"] }'
```

**Response** `200`:

```json
{
  "succeeded": 2,
  "failed": 0
}
```

**Errors:** `501` (ingestion queue unavailable for `"ingest"` action in dev).

---

### `POST /api/admin/sources/bulk-create`

Bulk create sources (e.g., from CSV import).

**Auth:** Admin

**Request body:**

| Field     | Type  | Required | Description                                     |
| --------- | ----- | -------- | ----------------------------------------------- |
| `sources` | array | Yes      | Array of source objects (same schema as create) |

```bash
curl -X POST https://athlete-agent.rosinbum.org/api/admin/sources/bulk-create \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "sources": [{ "id": "doc-1", "title": "Doc 1", ... }] }'
```

**Response** `201`:

```json
{
  "results": [
    { "id": "doc-1", "title": "Doc 1", "status": "created" },
    {
      "id": "doc-2",
      "title": "Doc 2",
      "status": "duplicate",
      "error": "ID already exists"
    }
  ]
}
```

Status values: `"created"`, `"duplicate"`, `"failed"`.

---

## Admin — Discoveries

Manage auto-discovered source candidates. All endpoints require admin authentication.

### `GET /api/admin/discoveries`

List discovered source candidates.

**Auth:** Admin

**Query parameters:**

| Parameter | Type    | Default | Description                                                                   |
| --------- | ------- | ------- | ----------------------------------------------------------------------------- |
| `status`  | string  | —       | Filter: `"pending_metadata"`, `"pending_content"`, `"approved"`, `"rejected"` |
| `limit`   | integer | `1000`  | Max results (capped at 5000)                                                  |

```bash
curl "https://athlete-agent.rosinbum.org/api/admin/discoveries?status=pending_metadata&limit=50" \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "discoveries": [
    {
      "id": "abc123",
      "url": "https://usopc.org/new-policy.pdf",
      "title": "New Athlete Policy",
      "description": "Updated athlete representation guidelines",
      "metadata": {},
      "status": "pending_metadata",
      "sourceConfigId": null,
      "createdAt": "2026-02-20T02:00:00.000Z",
      "updatedAt": "2026-02-20T02:00:00.000Z",
      "reviewedBy": null,
      "reviewedAt": null
    }
  ],
  "hasMore": false
}
```

---

### `GET /api/admin/discoveries/[id]`

Get a single discovery.

**Auth:** Admin

```bash
curl https://athlete-agent.rosinbum.org/api/admin/discoveries/abc123 \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "discovery": {
    /* discovery object */
  }
}
```

---

### `PATCH /api/admin/discoveries/[id]`

Update a discovery's status. Uses a discriminated union on the `action` field.

**Auth:** Admin

**Approve:**

```bash
curl -X PATCH https://athlete-agent.rosinbum.org/api/admin/discoveries/abc123 \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "action": "approve", "reason": "Relevant governance document" }'
```

**Reject:**

```bash
curl -X PATCH https://athlete-agent.rosinbum.org/api/admin/discoveries/abc123 \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "action": "reject", "reason": "Outdated document, superseded by newer version" }'
```

**Send to sources** (creates a source config from the discovery):

```bash
curl -X PATCH https://athlete-agent.rosinbum.org/api/admin/discoveries/abc123 \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "action": "send_to_sources" }'
```

| Action            | Required Fields     | Precondition         |
| ----------------- | ------------------- | -------------------- |
| `approve`         | `reason` (optional) | —                    |
| `reject`          | `reason` (required) | —                    |
| `send_to_sources` | —                   | Must be `"approved"` |

**Response** `200`:

```json
{
  "discovery": {
    /* updated discovery */
  },
  "result": {
    /* for send_to_sources: source creation result */
  }
}
```

---

### `POST /api/admin/discoveries/bulk`

Bulk operations on discoveries.

**Auth:** Admin

**Bulk approve:**

```json
{ "action": "approve", "ids": ["id1", "id2"] }
```

**Bulk reject:**

```json
{ "action": "reject", "ids": ["id1", "id2"], "reason": "Not relevant" }
```

**Bulk send to sources** (sends all approved if `ids` omitted):

```json
{ "action": "send_to_sources", "ids": ["id1"] }
```

**Response (approve/reject)** `200`:

```json
{ "succeeded": 2, "failed": 0 }
```

**Response (send_to_sources)** `200`:

```json
{
  "created": 1,
  "alreadyLinked": 0,
  "duplicateUrl": 1,
  "notApproved": 0,
  "failed": 0
}
```

---

## Admin — Invites

Manage the athlete invite list. Controls who can sign in via email magic link.

**Note:** These endpoints require a valid session but do not enforce admin role — any authenticated user can access them.

### `GET /api/admin/invites`

List all invited athletes.

**Auth:** Session

```bash
curl https://athlete-agent.rosinbum.org/api/admin/invites \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "invites": [
    {
      "email": "athlete@example.com",
      "invitedBy": "admin@example.com",
      "createdAt": "2026-02-01T00:00:00.000Z"
    }
  ]
}
```

---

### `POST /api/admin/invites`

Invite an athlete by email.

**Auth:** Session

**Request body:**

| Field       | Type   | Required | Description          |
| ----------- | ------ | -------- | -------------------- |
| `email`     | string | Yes      | Valid email address  |
| `invitedBy` | string | No       | Inviter's identifier |

```bash
curl -X POST https://athlete-agent.rosinbum.org/api/admin/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "email": "athlete@example.com" }'
```

**Response** `201`:

```json
{
  "invite": {
    "email": "athlete@example.com",
    "invitedBy": "admin@example.com",
    "createdAt": "2026-02-24T12:00:00.000Z"
  }
}
```

---

### `DELETE /api/admin/invites`

Revoke an athlete's invite.

**Auth:** Session

**Request body:**

| Field   | Type   | Required | Description     |
| ------- | ------ | -------- | --------------- |
| `email` | string | Yes      | Email to revoke |

```bash
curl -X DELETE https://athlete-agent.rosinbum.org/api/admin/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{ "email": "athlete@example.com" }'
```

**Response** `200`:

```json
{ "success": true }
```

---

## Document URLs

### `GET /api/documents/[key]/url`

Generate a presigned S3 URL for viewing an archived document.

**Auth:** Admin

**Path parameter:** `key` — URL-encoded S3 object key (must start with `sources/`, no `..` traversal).

```bash
curl "https://athlete-agent.rosinbum.org/api/documents/sources%2Fusopc-bylaws%2Fv1.pdf/url" \
  -H "Cookie: next-auth.session-token=<token>"
```

**Response** `200`:

```json
{
  "url": "https://s3.amazonaws.com/...?X-Amz-Signature=..."
}
```

The presigned URL expires after 5 minutes.

**Errors:** `400` (invalid key — must start with `sources/`, no `..`).

---

## Slack Bot

The Slack bot runs as a separate Lambda behind API Gateway. All `/slack/*` endpoints require [Slack request signature verification](https://api.slack.com/authentication/verifying-requests-from-slack) (HMAC-SHA256, 5-minute timestamp tolerance, 100 KB max payload).

### `POST /slack/events`

Slack Events API endpoint. Handles URL verification, direct messages, and @mentions.

**Auth:** Slack signature

**URL verification** (Slack handshake):

```json
// Request
{ "type": "url_verification", "challenge": "abc123" }

// Response
{ "challenge": "abc123" }
```

**Direct messages** (`channel_type: "im"`):

- User must be on the invite list (DynamoDB)
- Bot adds `eyes` reaction, processes asynchronously, posts response in thread
- Returns `{ "ok": true }` immediately

**@mentions** (`app_mention` event):

- Strips `<@BOTID>` prefix from text
- Same invite check and async processing as DMs

### `POST /slack/commands`

Slack slash command handler.

**Auth:** Slack signature

**Command:** `/ask-athlete-support <question>`

Returns an immediate ephemeral acknowledgement, then posts the full answer to the channel asynchronously.

### `POST /slack/interactions`

Slack interactive component handler (feedback buttons).

**Auth:** Slack signature

**Actions:** `feedback_helpful`, `feedback_not_helpful` — logs feedback and posts acknowledgement.

### `GET /health`

Health check (no signature verification required).

**Response** `200`:

```json
{ "status": "ok" }
```
