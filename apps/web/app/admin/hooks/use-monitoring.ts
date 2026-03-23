import useSWR from "swr";
import type { IngestionLog } from "@usopc/shared";
import { fetcher } from "./fetcher.js";

interface QueueStats {
  visible: number;
  inFlight: number;
}

export interface LatestDiscoveryRun {
  status: "running" | "completed" | "failed" | "timed_out";
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  discovered?: number;
  enqueued?: number;
  skipped?: number;
  errors?: number;
  errorMessage?: string;
}

interface MonitoringDashboardResponse {
  queues: {
    discoveryFeed: QueueStats | null;
    discoveryFeedDlq: QueueStats | null;
    ingestion: QueueStats | null;
    ingestionDlq: QueueStats | null;
  };
  recentJobs: IngestionLog[];
  discoveryPipeline: {
    pending_metadata: number;
    pending_content: number;
    approved: number;
    rejected: number;
  };
  latestDiscoveryRun: LatestDiscoveryRun | null;
  timestamp: string;
}

export function useMonitoring() {
  const { data, error, isLoading, mutate } =
    useSWR<MonitoringDashboardResponse>("/api/admin/monitoring", fetcher, {
      refreshInterval: 10_000,
    });

  return {
    queues: data?.queues ?? null,
    recentJobs: data?.recentJobs ?? [],
    discoveryPipeline: data?.discoveryPipeline ?? null,
    latestDiscoveryRun: data?.latestDiscoveryRun ?? null,
    timestamp: data?.timestamp ?? null,
    isLoading,
    error,
    mutate,
  };
}
