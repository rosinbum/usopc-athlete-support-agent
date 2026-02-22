"use client";

import { useState, useEffect } from "react";
import type { SourceConfig } from "@usopc/shared";
import { formatDate } from "../../lib/format-date.js";

export function AdminDashboardStats() {
  const [sources, setSources] = useState<SourceConfig[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/sources")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sources) setSources(data.sources);
      })
      .catch(() => {});
  }, []);

  const totalSources = sources?.length ?? null;
  const uniqueNgbs = sources
    ? new Set(sources.map((s) => s.ngbId).filter(Boolean)).size
    : null;
  const lastIngested = sources
    ? sources.reduce<string | null>((latest, s) => {
        if (!s.lastIngestedAt) return latest;
        if (!latest) return s.lastIngestedAt;
        return s.lastIngestedAt > latest ? s.lastIngestedAt : latest;
      }, null)
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="border rounded-lg p-6">
        <p className="text-sm text-gray-500">Total Source Configs</p>
        <p className="text-3xl font-bold mt-1">
          {totalSources !== null ? totalSources : "\u2014"}
        </p>
      </div>
      <div className="border rounded-lg p-6">
        <p className="text-sm text-gray-500">Organizations</p>
        <p className="text-3xl font-bold mt-1">
          {uniqueNgbs !== null ? uniqueNgbs : "\u2014"}
        </p>
      </div>
      <div className="border rounded-lg p-6">
        <p className="text-sm text-gray-500">Last Ingestion</p>
        <p className="text-lg font-medium mt-1">
          {sources ? formatDate(lastIngested) : "\u2014"}
        </p>
      </div>
    </div>
  );
}
