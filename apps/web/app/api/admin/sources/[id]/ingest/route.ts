import { NextResponse } from "next/server";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getResource, logger } from "@usopc/shared";
import { requireAdmin } from "../../../../../../lib/admin-api.js";

const log = logger.child({ service: "admin-sources-ingest" });
import { createSourceConfigEntity } from "../../../../../../lib/source-config.js";

export async function POST(
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

    // Get the queue URL from SST Resource (only available in production)
    let queueUrl: string;
    try {
      queueUrl = getResource("IngestionQueue").url;
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

    return NextResponse.json({ success: true, sourceId: id });
  } catch (error) {
    log.error("Admin source ingest error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to trigger ingestion" },
      { status: 500 },
    );
  }
}
