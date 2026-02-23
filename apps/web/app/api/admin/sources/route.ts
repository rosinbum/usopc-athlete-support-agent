import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  TOPIC_DOMAINS,
  AUTHORITY_LEVELS,
  DOCUMENT_TYPES,
  logger,
} from "@usopc/shared";

const log = logger.child({ service: "admin-sources" });
import { requireAdmin } from "../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../lib/source-config.js";
import { apiError } from "../../../../lib/apiResponse.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createSourceSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1, "Title is required"),
  documentType: z.enum(DOCUMENT_TYPES),
  topicDomains: z
    .array(z.enum(TOPIC_DOMAINS))
    .min(1, "At least one topic domain is required"),
  url: z.string().url("Must be a valid URL"),
  format: z.enum(["pdf", "html", "text"]),
  ngbId: z.string().nullable(),
  priority: z.enum(["high", "medium", "low"]),
  description: z.string().min(1, "Description is required"),
  authorityLevel: z.enum(AUTHORITY_LEVELS),
});

// ---------------------------------------------------------------------------
// GET — list all sources
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.max(1, Math.min(5000, Number(limitParam) || 1000))
      : 1000;

    const entity = createSourceConfigEntity();
    const sources = await entity.getAll();
    const hasMore = sources.length > limit;
    return NextResponse.json({
      sources: hasMore ? sources.slice(0, limit) : sources,
      hasMore,
    });
  } catch (error) {
    log.error("Admin sources list error", { error: String(error) });
    return apiError("Failed to fetch sources", 500);
  }
}

// ---------------------------------------------------------------------------
// POST — create a new source
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await request.json();
    const result = createSourceSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const entity = createSourceConfigEntity();
    const source = await entity.create(result.data);

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    // DynamoDB ConditionalCheckFailedException means ID already exists
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return apiError("A source with this ID already exists", 409);
    }

    log.error("Admin source create error", { error: String(error) });
    return apiError("Failed to create source", 500);
  }
}
