import {
  type RouteConfig,
  route,
  index,
  layout,
  prefix,
} from "@react-router/dev/routes";

export default [
  // Public pages
  index("routes/home.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("chat", "routes/chat.tsx"),
  route("sources", "routes/sources.tsx"),

  // Admin layout + pages
  layout("routes/admin.tsx", [
    ...prefix("admin", [
      index("routes/admin._index.tsx"),
      route("sources", "routes/admin.sources._index.tsx"),
      route("sources/new", "routes/admin.sources.new.tsx"),
      route("sources/bulk-import", "routes/admin.sources.bulk-import.tsx"),
      route("discoveries", "routes/admin.discoveries.tsx"),
      route("monitoring", "routes/admin.monitoring.tsx"),
      route("invites", "routes/admin.invites.tsx"),
    ]),
  ]),

  // API resource routes (no UI component, just loader/action)
  route("api/health", "routes/api.health.ts"),
  route("api/chat", "routes/api.chat.ts"),
  route("api/chat/feedback", "routes/api.chat.feedback.ts"),
  route("api/sources", "routes/api.sources.ts"),
  route("api/access-request", "routes/api.access-request.ts"),
  route("api/documents/:key/url", "routes/api.documents.$key.url.ts"),

  // Admin API resource routes
  route("api/admin/sources", "routes/api.admin.sources.ts"),
  route("api/admin/sources/bulk", "routes/api.admin.sources.bulk.ts"),
  route(
    "api/admin/sources/bulk-create",
    "routes/api.admin.sources.bulk-create.ts",
  ),
  route("api/admin/sources/:id", "routes/api.admin.sources.$id.ts"),
  route(
    "api/admin/sources/:id/ingest",
    "routes/api.admin.sources.$id.ingest.ts",
  ),
  route("api/admin/discoveries", "routes/api.admin.discoveries.ts"),
  route("api/admin/discoveries/bulk", "routes/api.admin.discoveries.bulk.ts"),
  route("api/admin/discoveries/:id", "routes/api.admin.discoveries.$id.ts"),
  route("api/admin/discovery/run", "routes/api.admin.discovery.run.ts"),
  route("api/admin/invites", "routes/api.admin.invites.ts"),
  route("api/admin/monitoring", "routes/api.admin.monitoring.ts"),

  // Auth.js catch-all
  route("api/auth/*", "routes/api.auth.ts"),
] satisfies RouteConfig;
