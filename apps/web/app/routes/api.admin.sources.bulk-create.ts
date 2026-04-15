import type { Route } from "./+types/api.admin.sources.bulk-create.js";
import { z } from "zod";
import {
  TOPIC_DOMAINS,
  AUTHORITY_LEVELS,
  DOCUMENT_TYPES,
  FORMATS,
  PRIORITY_LEVELS,
  logger,
} from "@usopc/shared";

const log = logger.child({ service: "admin-sources-bulk-create" });
import { getSession } from "../../server/session.js";
import { createSourceConfigEntity } from "../../lib/source-config.js";
import { apiError } from "../../lib/apiResponse.js";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(request: Request) {
  const session = await getSession(request);
  if (!session?.user?.email) return apiError("Unauthorized", 401);
  if (session.user.role !== "admin") return apiError("Forbidden", 403);
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const sourceItemSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  documentType: z.enum(DOCUMENT_TYPES),
  topicDomains: z.array(z.enum(TOPIC_DOMAINS)).min(1),
  url: z.string().url(),
  format: z.enum(FORMATS),
  ngbId: z.string().nullable(),
  priority: z.enum(PRIORITY_LEVELS),
  description: z.string().min(1),
  authorityLevel: z.enum(AUTHORITY_LEVELS),
});

const bulkCreateSchema = z.object({
  sources: z.array(sourceItemSchema).min(1, "At least one source is required"),
});

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

interface BulkResult {
  id: string;
  title: string;
  status: "created" | "duplicate" | "failed";
  error?: string;
}

// ---------------------------------------------------------------------------
// POST /api/admin/sources/bulk-create
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = bulkCreateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const entity = createSourceConfigEntity();
    const results: BulkResult[] = [];

    for (const source of parsed.data.sources) {
      try {
        await entity.create(source);
        results.push({ id: source.id, title: source.title, status: "created" });
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === "ConditionalCheckFailedException"
        ) {
          results.push({
            id: source.id,
            title: source.title,
            status: "duplicate",
            error: "Source already exists",
          });
        } else {
          log.error("Failed to create source", {
            sourceId: source.id,
            error: err instanceof Error ? err.message : String(err),
          });
          results.push({
            id: source.id,
            title: source.title,
            status: "failed",
            error: "Internal error",
          });
        }
      }
    }

    return Response.json({ results }, { status: 201 });
  } catch (error) {
    log.error("Bulk create error", { error: String(error) });
    return apiError("Failed to process bulk create request", 500);
  }
}
