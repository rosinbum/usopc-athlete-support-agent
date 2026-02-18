"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  Upload,
} from "lucide-react";
import type { SourceConfig } from "@usopc/shared";
import { SlidePanel } from "../components/SlidePanel.js";
import { SortIcon } from "../components/SortIcon.js";
import { Pagination } from "../components/Pagination.js";
import { formatDate } from "../components/formatDate.js";
import { SourceDetailPanel } from "./components/SourceDetailPanel.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField =
  | "title"
  | "format"
  | "priority"
  | "authorityLevel"
  | "consecutiveFailures"
  | "lastIngestedAt"
  | "enabled";
type SortDir = "asc" | "desc";

interface Filters {
  search: string;
  enabled: string;
  priority: string;
  format: string;
  ngbId: string;
}

const ITEMS_PER_PAGE = 25;
const STALE_DAYS = 30;
const FAILURE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priorityWeight(p: string): number {
  return p === "high" ? 3 : p === "medium" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SourcesAdminClient() {
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    enabled: "",
    priority: "",
    format: "",
    ngbId: "",
  });
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [cardFilter, setCardFilter] = useState<
    "failing" | "neverIngested" | "stale" | null
  >(null);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchSources = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sources");
      if (!res.ok) throw new Error("Failed to fetch sources");
      const data = await res.json();
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  const refetchSources = useCallback(
    () => fetchSources({ silent: true }),
    [fetchSources],
  );

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // -------------------------------------------------------------------------
  // Health stats
  // -------------------------------------------------------------------------

  const healthStats = useMemo(() => {
    const total = sources.length;
    const enabled = sources.filter((s) => s.enabled).length;
    const disabled = total - enabled;
    const now = Date.now();

    const failing = sources.filter(
      (s) => s.enabled && s.consecutiveFailures >= FAILURE_THRESHOLD,
    ).length;

    const neverIngested = sources.filter(
      (s) => s.enabled && !s.lastIngestedAt,
    ).length;

    const stale = sources.filter((s) => {
      if (!s.enabled || !s.lastIngestedAt) return false;
      const age = now - new Date(s.lastIngestedAt).getTime();
      return age > STALE_DAYS * 24 * 60 * 60 * 1000;
    }).length;

    return { total, enabled, disabled, failing, neverIngested, stale };
  }, [sources]);

  // -------------------------------------------------------------------------
  // Filter + Sort + Paginate
  // -------------------------------------------------------------------------

  const ngbOptions = useMemo(() => {
    const ngbs = new Set(sources.map((s) => s.ngbId).filter(Boolean));
    return Array.from(ngbs).sort() as string[];
  }, [sources]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return sources.filter((s) => {
      if (
        filters.search &&
        !s.title.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      if (filters.enabled === "true" && !s.enabled) return false;
      if (filters.enabled === "false" && s.enabled) return false;
      if (filters.priority && s.priority !== filters.priority) return false;
      if (filters.format && s.format !== filters.format) return false;
      if (filters.ngbId && s.ngbId !== filters.ngbId) return false;
      if (cardFilter === "failing") {
        if (!s.enabled || s.consecutiveFailures < FAILURE_THRESHOLD)
          return false;
      }
      if (cardFilter === "neverIngested") {
        if (!s.enabled || s.lastIngestedAt) return false;
      }
      if (cardFilter === "stale") {
        if (!s.enabled || !s.lastIngestedAt) return false;
        const age = now - new Date(s.lastIngestedAt).getTime();
        if (age <= STALE_DAYS * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [sources, filters, cardFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "format":
          cmp = a.format.localeCompare(b.format);
          break;
        case "priority":
          cmp = priorityWeight(a.priority) - priorityWeight(b.priority);
          break;
        case "authorityLevel":
          cmp = a.authorityLevel.localeCompare(b.authorityLevel);
          break;
        case "consecutiveFailures":
          cmp = a.consecutiveFailures - b.consecutiveFailures;
          break;
        case "lastIngestedAt":
          cmp =
            new Date(a.lastIngestedAt ?? 0).getTime() -
            new Date(b.lastIngestedAt ?? 0).getTime();
          break;
        case "enabled":
          cmp = Number(a.enabled) - Number(b.enabled);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = sorted.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  const allOnPageSelected =
    paginated.length > 0 && paginated.every((s) => selected.has(s.id));

  function toggleSelectAll() {
    const next = new Set(selected);
    if (allOnPageSelected) {
      paginated.forEach((s) => next.delete(s.id));
    } else {
      paginated.forEach((s) => next.add(s.id));
    }
    setSelected(next);
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // -------------------------------------------------------------------------
  // Bulk actions
  // -------------------------------------------------------------------------

  async function bulkAction(
    action: "enable" | "disable" | "ingest" | "delete",
  ) {
    if (selected.size === 0) return;

    if (action === "delete") {
      const confirmed = window.confirm(
        `Delete ${selected.size} source${selected.size === 1 ? "" : "s"}?\n\nThis will permanently remove the source configs and all indexed chunks from the vector database.`,
      );
      if (!confirmed) return;
    }

    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/sources/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Bulk action failed");
      }
      setSelected(new Set());
      await refetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Sort handler
  // -------------------------------------------------------------------------

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  function SortBtn({ field }: { field: SortField }) {
    return (
      <SortIcon field={field} activeField={sortField} direction={sortDir} />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading sources...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => fetchSources()}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mb-4">
        <a
          href="/admin/sources/bulk-import"
          className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          Bulk Import
        </a>
        <a
          href="/admin/sources/new"
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Source
        </a>
      </div>

      {/* Health Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <button
          type="button"
          onClick={() => {
            setCardFilter(null);
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${cardFilter === null ? "ring-2 ring-blue-500" : "border-gray-200"}`}
        >
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Total Sources</span>
          </div>
          <p className="text-2xl font-bold">{healthStats.total}</p>
          <p className="text-xs text-gray-400">
            {healthStats.enabled} enabled / {healthStats.disabled} disabled
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) => (c === "failing" ? null : "failing"));
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "failing"
              ? "ring-2 ring-red-500 border-red-200 bg-red-50"
              : healthStats.failing > 0
                ? "border-red-200 bg-red-50"
                : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">Failing</span>
          </div>
          <p className="text-2xl font-bold">{healthStats.failing}</p>
          <p className="text-xs text-gray-400">
            {FAILURE_THRESHOLD}+ consecutive failures
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) =>
              c === "neverIngested" ? null : "neverIngested",
            );
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "neverIngested"
              ? "ring-2 ring-yellow-500 border-yellow-200 bg-yellow-50"
              : healthStats.neverIngested > 0
                ? "border-yellow-200 bg-yellow-50"
                : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-yellow-600 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Never Ingested</span>
          </div>
          <p className="text-2xl font-bold">{healthStats.neverIngested}</p>
          <p className="text-xs text-gray-400">Enabled but no data</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) => (c === "stale" ? null : "stale"));
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "stale"
              ? "ring-2 ring-orange-500 border-orange-200 bg-orange-50"
              : healthStats.stale > 0
                ? "border-orange-200 bg-orange-50"
                : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-orange-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Stale</span>
          </div>
          <p className="text-2xl font-bold">{healthStats.stale}</p>
          <p className="text-xs text-gray-400">&gt;{STALE_DAYS} days old</p>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title..."
            value={filters.search}
            onChange={(e) => {
              setFilters((f) => ({ ...f, search: e.target.value }));
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={filters.enabled}
          onChange={(e) => {
            setFilters((f) => ({ ...f, enabled: e.target.value }));
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => {
            setFilters((f) => ({ ...f, priority: e.target.value }));
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={filters.format}
          onChange={(e) => {
            setFilters((f) => ({ ...f, format: e.target.value }));
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Format</option>
          <option value="pdf">PDF</option>
          <option value="html">HTML</option>
          <option value="text">Text</option>
        </select>

        {ngbOptions.length > 0 && (
          <select
            value={filters.ngbId}
            onChange={(e) => {
              setFilters((f) => ({ ...f, ngbId: e.target.value }));
              setPage(1);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All NGB</option>
            {ngbOptions.map((ngb) => (
              <option key={ngb} value={ngb}>
                {ngb}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-700">
            {selected.size} selected
          </span>
          <button
            onClick={() => bulkAction("enable")}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Enable
          </button>
          <button
            onClick={() => bulkAction("disable")}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            Disable
          </button>
          <button
            onClick={() => bulkAction("ingest")}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Trigger Ingestion
          </button>
          <button
            onClick={() => bulkAction("delete")}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 ml-auto"
          >
            Delete
          </button>
          {bulkLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("enabled")}
              >
                <span className="flex items-center gap-1">
                  Status <SortBtn field="enabled" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("title")}
              >
                <span className="flex items-center gap-1">
                  Title <SortBtn field="title" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("format")}
              >
                <span className="flex items-center gap-1">
                  Format <SortBtn field="format" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("priority")}
              >
                <span className="flex items-center gap-1">
                  Priority <SortBtn field="priority" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("consecutiveFailures")}
              >
                <span className="flex items-center gap-1">
                  Failures <SortBtn field="consecutiveFailures" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("lastIngestedAt")}
              >
                <span className="flex items-center gap-1">
                  Last Ingested <SortBtn field="lastIngestedAt" />
                </span>
              </th>
              <th className="px-3 py-3 text-left">NGB</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((source) => (
              <tr
                key={source.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={(e) => {
                  // Don't open panel if clicking checkbox
                  if ((e.target as HTMLElement).tagName === "INPUT") return;
                  setOpenSourceId(source.id);
                }}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(source.id)}
                    onChange={() => toggleSelect(source.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      source.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {source.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-3 py-3 font-medium max-w-[300px] truncate">
                  {source.title}
                </td>
                <td className="px-3 py-3 uppercase text-gray-500">
                  {source.format}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${
                      source.priority === "high"
                        ? "bg-red-100 text-red-700"
                        : source.priority === "medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {source.priority}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {source.consecutiveFailures > 0 ? (
                    <span className="text-red-600 font-medium">
                      {source.consecutiveFailures}
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-500">
                  {formatDate(source.lastIngestedAt)}
                </td>
                <td className="px-3 py-3 text-gray-500">
                  {source.ngbId ?? "USOPC"}
                </td>
              </tr>
            ))}

            {paginated.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  No sources match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={sorted.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setPage}
      />

      {/* Detail Slide Panel */}
      <SlidePanel open={!!openSourceId} onClose={() => setOpenSourceId(null)}>
        {openSourceId && (
          <SourceDetailPanel
            id={openSourceId}
            onClose={() => setOpenSourceId(null)}
            onMutate={refetchSources}
            hasPrev={sorted.findIndex((s) => s.id === openSourceId) > 0}
            hasNext={
              sorted.findIndex((s) => s.id === openSourceId) < sorted.length - 1
            }
            onPrev={() => {
              const idx = sorted.findIndex((s) => s.id === openSourceId);
              if (idx > 0) setOpenSourceId(sorted[idx - 1].id);
            }}
            onNext={() => {
              const idx = sorted.findIndex((s) => s.id === openSourceId);
              if (idx < sorted.length - 1) setOpenSourceId(sorted[idx + 1].id);
            }}
          />
        )}
      </SlidePanel>
    </div>
  );
}
