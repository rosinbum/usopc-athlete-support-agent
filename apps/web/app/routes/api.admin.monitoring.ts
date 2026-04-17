import type { Route } from "./+types/api.admin.monitoring.js";
import {
  logger,
  createIngestionLogEntity,
  createDiscoveredSourceEntity,
  createDiscoveryRunEntity,
  createQueueService,
  getResource,
  type DiscoveryStatus,
} from "@usopc/shared";
import { getAdminSession } from "../../server/session.js";
import { apiError } from "../../lib/apiResponse.js";

const log = logger.child({ service: "admin-monitoring" });

const queueService = createQueueService();

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
    return await queueService.getStats(url);
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
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(request: Request) {
  const session = await getAdminSession(request);
  if (!session?.user?.email) return apiError("Unauthorized", 401);
  if (session.user.role !== "admin") return apiError("Forbidden", 403);
  return null;
}

// ---------------------------------------------------------------------------
// GET — monitoring dashboard data
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const denied = await requireAdmin(request);
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

    return Response.json({
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
