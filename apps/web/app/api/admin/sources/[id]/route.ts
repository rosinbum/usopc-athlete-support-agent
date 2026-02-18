import { NextResponse } from "next/server";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";
import {
  getPool,
  deleteChunksBySourceId,
  updateChunkMetadataBySourceId,
  countChunksBySourceId,
  getResource,
  logger,
  type SourceConfig,
} from "@usopc/shared";

const log = logger.child({ service: "admin-sources" });
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchSourceSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    url: z.string().url("Must be a valid URL").optional(),
    format: z.enum(["pdf", "html", "text"]).optional(),
    documentType: z.string().min(1).optional(),
    topicDomains: z.array(z.string().min(1)).min(1).optional(),
    ngbId: z.string().nullable().optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    authorityLevel: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No valid fields to update",
  });

// Fields that require re-ingestion (content changes)
const CONTENT_AFFECTING_FIELDS = new Set(["url", "format"]);

// Fields that require chunk metadata updates (no re-ingestion)
const METADATA_FIELDS = new Set([
  "title",
  "documentType",
  "topicDomains",
  "ngbId",
  "authorityLevel",
]);

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const entity = createSourceConfigEntity();
    const source = await entity.getById(id);

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const pool = getPool();
    const chunkCount = await countChunksBySourceId(pool, id);

    return NextResponse.json({ source, chunkCount });
  } catch (error) {
    log.error("Admin source detail error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to fetch source" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const result = patchSourceSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    // Cast is safe — Zod has validated the values above
    const data = result.data as Partial<Omit<SourceConfig, "id" | "createdAt">>;
    const changedKeys = Object.keys(data);

    const hasContentChange = changedKeys.some((k) =>
      CONTENT_AFFECTING_FIELDS.has(k),
    );
    const hasMetadataChange = changedKeys.some((k) => METADATA_FIELDS.has(k));

    const actions: Record<string, unknown> = {};
    const pool = getPool();

    if (hasContentChange) {
      // Content-affecting: delete old chunks, update config, trigger re-ingestion
      const chunksDeleted = await deleteChunksBySourceId(pool, id);
      actions.chunksDeleted = chunksDeleted;

      // Update the source config in DynamoDB
      const entity = createSourceConfigEntity();
      const source = await entity.update(id, data);

      // Trigger re-ingestion via SQS
      try {
        const queueUrl = getResource("IngestionQueue").url;

        const message = {
          source: {
            id: source.id,
            title: source.title,
            documentType: source.documentType,
            topicDomains: source.topicDomains,
            url: source.url,
            format: source.format,
            ngbId: source.ngbId,
            priority: source.priority,
            description: source.description,
            authorityLevel: source.authorityLevel,
          },
          contentHash: "manual",
          triggeredAt: new Date().toISOString(),
        };

        const sqs = new SQSClient({});
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message),
            MessageGroupId: source.id,
          }),
        );
        actions.reIngestionTriggered = true;
      } catch {
        // SQS not available in dev — still proceed with the update
        actions.reIngestionTriggered = false;
      }

      return NextResponse.json({ source, actions });
    }

    if (hasMetadataChange) {
      // Metadata-only: update chunks in PG, then update DynamoDB
      const metadataUpdates: Record<string, unknown> = {};
      if (data.title !== undefined) metadataUpdates.title = data.title;
      if (data.documentType !== undefined)
        metadataUpdates.documentType = data.documentType;
      if (data.topicDomains !== undefined)
        metadataUpdates.topicDomains = data.topicDomains;
      if (data.ngbId !== undefined) metadataUpdates.ngbId = data.ngbId;
      if (data.authorityLevel !== undefined)
        metadataUpdates.authorityLevel = data.authorityLevel;

      const chunksUpdated = await updateChunkMetadataBySourceId(
        pool,
        id,
        metadataUpdates,
      );
      actions.chunksUpdated = chunksUpdated;
    }

    // Update DynamoDB (covers metadata-only and no-vector-impact fields)
    const entity = createSourceConfigEntity();
    const source = await entity.update(id, data);

    return NextResponse.json({ source, actions });
  } catch (error) {
    log.error("Admin source update error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to update source" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const entity = createSourceConfigEntity();
    const source = await entity.getById(id);

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Delete chunks from PG first (safer ordering)
    const pool = getPool();
    const chunksDeleted = await deleteChunksBySourceId(pool, id);

    // Delete config from DynamoDB
    await entity.delete(id);

    return NextResponse.json({
      success: true,
      sourceId: id,
      chunksDeleted,
    });
  } catch (error) {
    log.error("Admin source delete error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to delete source" },
      { status: 500 },
    );
  }
}
