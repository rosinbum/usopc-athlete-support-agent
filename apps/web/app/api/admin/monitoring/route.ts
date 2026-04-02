import { NextResponse } from "next/server";
import { SQSClient, GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import {
  logger,
  createIngestionLogEntity,
  createDiscoveredSourceEntity,
  createDiscoveryRunEntity,
  getResource,
  type DiscoveryStatus,
} from "@usopc/shared";
import { requireAdmin } from "../../../../lib/admin-api.js";
import { apiError } from "../../../../lib/apiResponse.js";

const log = logger.child({ service: "admin-monitoring" });

const sqs = new SQSClient({});

interface QueueStats {
  visible: number;
  inFlight: number;
}

async function getQueueStats(
  resourceKey:
    | "DiscoveryFeedQueue"
    | "DiscoveryFeedDLQ"
    | "IngestionQueue"
    | "IngestionDLQ",
): Promise<QueueStats | null> {
  try {
    const url = getResource(resourceKey).url;
    const result = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: url,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
        ],
      }),
    );
    const attrs = result.Attributes ?? {};
    return {
      visible: Number(attrs.ApproximateNumberOfMessages ?? 0),
      inFlight: Number(attrs.ApproximateNumberOfMessagesNotVisible ?? 0),
    };
  } catch {
    return null;
  }
}

async function getDiscoveryCounts(
  entity: ReturnType<typeof createDiscoveredSourceEntity>,
) {
  const statuses: DiscoveryStatus[] = [
    "pending_metadata",
    "pending_content",
    "approved",
    "rejected",
  ];
  const results = await Promise.all(
    statuses.map((s) =>
      entity
        .getByStatus(s)
        .then((items) => items.length)
        .catch(() => 0),
    ),
  );
  return {
    pending_metadata: results[0],
    pending_content: results[1],
    approved: results[2],
    rejected: results[3],
  };
}

// ---------------------------------------------------------------------------
// GET — monitoring dashboard data
// ---------------------------------------------------------------------------

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const discoveryEntity = createDiscoveredSourceEntity();

    const [
      discoveryFeed,
      discoveryFeedDlq,
      ingestion,
      ingestionDlq,
      recentJobs,
      discoveryPipeline,
      rawDiscoveryRun,
    ] = await Promise.all([
      getQueueStats("DiscoveryFeedQueue"),
      getQueueStats("DiscoveryFeedDLQ"),
      getQueueStats("IngestionQueue"),
      getQueueStats("IngestionDLQ"),
      createIngestionLogEntity()
        .getRecent(50)
        .catch(() => []),
      getDiscoveryCounts(discoveryEntity),
      createDiscoveryRunEntity()
        .getLatest()
        .catch(() => null),
    ]);

    // Detect stale "running" status (Lambda timed out before updating)
    const STALE_THRESHOLD_MS = 45_000; // 30s Lambda timeout + 15s buffer
    const latestDiscoveryRun =
      rawDiscoveryRun?.status === "running" &&
      Date.now() - new Date(rawDiscoveryRun.startedAt).getTime() >
        STALE_THRESHOLD_MS
        ? { ...rawDiscoveryRun, status: "timed_out" as const }
        : rawDiscoveryRun;

    return NextResponse.json({
      queues: {
        discoveryFeed,
        discoveryFeedDlq,
        ingestion,
        ingestionDlq,
      },
      recentJobs,
      discoveryPipeline,
      latestDiscoveryRun,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error("Admin monitoring dashboard error", { error: String(error) });
    return apiError("Failed to fetch monitoring data", 500);
  }
}
