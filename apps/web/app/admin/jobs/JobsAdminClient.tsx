"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  RefreshCw,
  Inbox,
  AlertTriangle,
  Clock,
  Activity,
} from "lucide-react";
import { formatDateTime } from "../../../lib/format-date.js";
import { useJobs } from "../hooks/use-jobs.js";

// ---------------------------------------------------------------------------
// Queue card
// ---------------------------------------------------------------------------

function QueueCard({
  label,
  stats,
  isDlq,
}: {
  label: string;
  stats: { visible: number; inFlight: number } | null;
  isDlq?: boolean;
}) {
  if (stats === null) {
    return (
      <div className="rounded-lg border bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="mt-2 text-lg text-gray-400">N/A</p>
        <p className="text-xs text-gray-400">Queue not available</p>
      </div>
    );
  }

  const hasMessages = stats.visible > 0 || stats.inFlight > 0;
  const borderColor =
    isDlq && stats.visible > 0
      ? "border-red-300 bg-red-50"
      : hasMessages
        ? "border-yellow-300 bg-yellow-50"
        : "border-green-300 bg-green-50";

  return (
    <div className={`rounded-lg border ${borderColor} p-4`}>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="mt-2 text-2xl font-bold">{stats.visible}</p>
      <p className="text-xs text-gray-500">
        queued{" "}
        {!isDlq && <span className="ml-2">{stats.inFlight} in flight</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline status card
// ---------------------------------------------------------------------------

function PipelineCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{count}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

type IngestionStatus = "pending" | "in_progress" | "completed" | "failed";

function statusStyle(status: IngestionStatus): string {
  switch (status) {
    case "pending":
      return "bg-gray-100 text-gray-700";
    case "in_progress":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "failed":
      return "bg-red-100 text-red-700";
  }
}

function StatusBadge({ status }: { status: IngestionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(status)}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JobsAdminClient() {
  const {
    queues,
    recentJobs,
    discoveryPipeline,
    timestamp,
    isLoading,
    error,
    mutate,
  } = useJobs();
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Tick "last refreshed" counter
  useEffect(() => {
    if (!timestamp) return;
    const update = () =>
      setSecondsAgo(
        Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
      );
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading jobs data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-2 text-red-700">{error.message}</p>
        <button
          onClick={() => mutate()}
          className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {timestamp
            ? `Last refreshed ${secondsAgo}s ago (auto-refreshes every 10s)`
            : ""}
        </p>
        <button
          onClick={() => mutate()}
          className="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Section 1: Queue status */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Inbox className="h-5 w-5 text-gray-500" />
          Queue Status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QueueCard
            label="Discovery Feed"
            stats={queues?.discoveryFeed ?? null}
          />
          <QueueCard
            label="Discovery DLQ"
            stats={queues?.discoveryFeedDlq ?? null}
            isDlq
          />
          <QueueCard label="Ingestion" stats={queues?.ingestion ?? null} />
          <QueueCard
            label="Ingestion DLQ"
            stats={queues?.ingestionDlq ?? null}
            isDlq
          />
        </div>
      </section>

      {/* Section 2: Discovery pipeline */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-500" />
          Discovery Pipeline
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <PipelineCard
            label="Pending Metadata"
            count={discoveryPipeline?.pending_metadata ?? 0}
            color="text-yellow-600"
          />
          <PipelineCard
            label="Pending Content"
            count={discoveryPipeline?.pending_content ?? 0}
            color="text-blue-600"
          />
          <PipelineCard
            label="Approved"
            count={discoveryPipeline?.approved ?? 0}
            color="text-green-600"
          />
          <PipelineCard
            label="Rejected"
            count={discoveryPipeline?.rejected ?? 0}
            color="text-gray-500"
          />
        </div>
      </section>

      {/* Section 3: Recent jobs */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-500" />
          Recent Ingestion Jobs
        </h2>

        {recentJobs.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">
            No recent ingestion jobs found.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Source URL
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Started
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Completed
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">
                    Chunks
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentJobs.map((job) => (
                  <tr
                    key={`${job.sourceId}-${job.startedAt}`}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 max-w-[260px] truncate text-gray-700">
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        title={job.sourceUrl}
                      >
                        {job.sourceUrl}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {formatDateTime(job.startedAt)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {formatDateTime(job.completedAt ?? null, "—")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {job.chunksCount ?? "—"}
                    </td>
                    <td className="px-4 py-2 max-w-[200px] truncate text-red-600">
                      {job.errorMessage ? (
                        <span title={job.errorMessage}>{job.errorMessage}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
