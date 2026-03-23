import useSWR from "swr";
import type { IngestionLog } from "@usopc/shared";
import { fetcher } from "./fetcher.js";

interface QueueStats {
  visible: number;
  inFlight: number;
}

interface JobsDashboardResponse {
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
  timestamp: string;
}

export function useJobs() {
  const { data, error, isLoading, mutate } = useSWR<JobsDashboardResponse>(
    "/api/admin/jobs",
    fetcher,
    { refreshInterval: 10_000 },
  );

  return {
    queues: data?.queues ?? null,
    recentJobs: data?.recentJobs ?? [],
    discoveryPipeline: data?.discoveryPipeline ?? null,
    timestamp: data?.timestamp ?? null,
    isLoading,
    error,
    mutate,
  };
}
