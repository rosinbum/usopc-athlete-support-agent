"use client";

import { useState, useEffect } from "react";
import type { IngestionLog } from "@usopc/shared";
import {
  Loader2,
  RefreshCw,
  Inbox,
  AlertTriangle,
  Clock,
  Activity,
} from "lucide-react";
import { formatDateTime } from "../../../lib/format-date.js";
import {
  useMonitoring,
  type LatestDiscoveryRun,
} from "../hooks/use-monitoring.js";

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

function statusStyle(status: IngestionLog["status"]): string {
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

function StatusBadge({ status }: { status: IngestionLog["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(status)}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Discovery status indicators
// ---------------------------------------------------------------------------

function DiscoveryRunCard({ run }: { run: LatestDiscoveryRun | null }) {
  if (!run) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500 mb-4">
        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-gray-300" />
        No discovery runs recorded
      </div>
    );
  }

  if (run.status === "running") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 mb-4">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        Discovery run in progress — triggered by {run.triggeredBy}
      </div>
    );
  }

  if (run.status === "completed") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 mb-4">
        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        Last run completed {formatDateTime(run.completedAt ?? null)} —{" "}
        {run.discovered} discovered, {run.enqueued} enqueued, {run.skipped}{" "}
        skipped
        {(run.errors ?? 0) > 0 && (
          <span className="text-red-600 ml-1">, {run.errors} errors</span>
        )}
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 mb-4">
        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        Last run failed {formatDateTime(run.completedAt ?? null)} — by{" "}
        {run.triggeredBy}
        {run.errorMessage && (
          <span className="truncate max-w-[300px]" title={run.errorMessage}>
            : {run.errorMessage}
          </span>
        )}
      </div>
    );
  }

  // timed_out
  return (
    <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 mb-4">
      <span className="inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
      Last run timed out (started {formatDateTime(run.startedAt)}) — by{" "}
      {run.triggeredBy}
    </div>
  );
}

function QueueActivityIndicator({
  queues,
  discoveryPipeline,
}: {
  queues: {
    discoveryFeed: { visible: number; inFlight: number } | null;
  } | null;
  discoveryPipeline: {
    pending_metadata: number;
    pending_content: number;
  } | null;
}) {
  const queueActive =
    queues?.discoveryFeed &&
    (queues.discoveryFeed.visible > 0 || queues.discoveryFeed.inFlight > 0);
  const evaluating =
    discoveryPipeline &&
    (discoveryPipeline.pending_metadata > 0 ||
      discoveryPipeline.pending_content > 0);

  if (queueActive) {
    const { visible, inFlight } = queues!.discoveryFeed!;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 mb-4">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
        </span>
        Worker processing — {visible} queued, {inFlight} in flight
      </div>
    );
  }

  if (evaluating) {
    const count =
      discoveryPipeline!.pending_metadata + discoveryPipeline!.pending_content;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 mb-4">
        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
        Evaluation in progress — {count} sources being evaluated
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MonitoringAdminClient() {
  const {
    queues,
    recentJobs,
    discoveryPipeline,
    latestDiscoveryRun,
    timestamp,
    isLoading,
    error,
    mutate,
  } = useMonitoring();
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
        <span className="ml-2 text-gray-500">Loading monitoring data...</span>
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
        <DiscoveryRunCard run={latestDiscoveryRun} />
        <QueueActivityIndicator
          queues={queues}
          discoveryPipeline={discoveryPipeline}
        />
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

      {/* Section 3: Recent ingestion activity */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-500" />
          Recent Ingestion Activity
        </h2>

        {recentJobs.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">
            No recent ingestion activity.
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
                    <td
                      className={`px-4 py-2 ${job.errorMessage ? "text-red-600" : "text-gray-400"}`}
                    >
                      {job.errorMessage ? (
                        <span
                          className="block max-w-[300px] truncate cursor-help"
                          title={job.errorMessage}
                        >
                          {job.errorMessage}
                        </span>
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
