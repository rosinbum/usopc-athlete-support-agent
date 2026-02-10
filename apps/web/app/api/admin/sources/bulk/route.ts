import { NextResponse } from "next/server";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";

interface BulkRequest {
  action: "enable" | "disable" | "ingest";
  ids: string[];
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body: BulkRequest = await request.json();
    const { action, ids } = body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: action and ids are required" },
        { status: 400 },
      );
    }

    if (!["enable", "disable", "ingest"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const entity = createSourceConfigEntity();
    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        if (action === "enable") {
          await entity.enable(id);
        } else if (action === "disable") {
          await entity.disable(id);
        } else if (action === "ingest") {
          const source = await entity.getById(id);
          if (!source) {
            failed++;
            continue;
          }

          let queueUrl: string;
          try {
            queueUrl = (
              Resource as unknown as { IngestionQueue: { url: string } }
            ).IngestionQueue.url;
          } catch {
            return NextResponse.json(
              { error: "Ingestion queue not available (dev environment)" },
              { status: 501 },
            );
          }

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
        }
        succeeded++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    console.error("Admin bulk action error:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 },
    );
  }
}
