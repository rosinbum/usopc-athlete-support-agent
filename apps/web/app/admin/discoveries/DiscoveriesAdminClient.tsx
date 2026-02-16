"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  Search,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
} from "lucide-react";
import type { DiscoveredSource, DiscoveryStatus } from "@usopc/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField =
  | "title"
  | "combinedConfidence"
  | "discoveredAt"
  | "status"
  | "discoveryMethod";
type SortDir = "asc" | "desc";

interface Filters {
  search: string;
  status: DiscoveryStatus | "";
  discoveryMethod: string;
  minConfidence: string;
  maxConfidence: string;
}

const ITEMS_PER_PAGE = 25;

const STATUS_OPTIONS: { value: DiscoveryStatus | ""; label: string }[] = [
  { value: "", label: "All Status" },
  { value: "pending_metadata", label: "Pending Metadata" },
  { value: "pending_content", label: "Pending Content" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function confidenceBg(c: number | null): string {
  if (c === null) return "bg-gray-100 text-gray-500";
  if (c >= 0.85) return "bg-green-100 text-green-700";
  if (c >= 0.5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function statusBadge(status: DiscoveryStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "pending_metadata":
      return {
        label: "Pending Metadata",
        className: "bg-blue-100 text-blue-700",
      };
    case "pending_content":
      return {
        label: "Pending Content",
        className: "bg-yellow-100 text-yellow-700",
      };
    case "approved":
      return { label: "Approved", className: "bg-green-100 text-green-700" };
    case "rejected":
      return { label: "Rejected", className: "bg-red-100 text-red-700" };
  }
}

function statusWeight(s: DiscoveryStatus): number {
  return s === "pending_content"
    ? 3
    : s === "pending_metadata"
      ? 2
      : s === "approved"
        ? 1
        : 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiscoveriesAdminClient() {
  const [discoveries, setDiscoveries] = useState<DiscoveredSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    discoveryMethod: "",
    minConfidence: "",
    maxConfidence: "",
  });
  const [sortField, setSortField] = useState<SortField>("combinedConfidence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchDiscoveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      const qs = params.toString();
      const url = `/api/admin/discoveries${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch discoveries");
      const data = await res.json();
      setDiscoveries(data.discoveries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [filters.status]);

  useEffect(() => {
    fetchDiscoveries();
  }, [fetchDiscoveries]);

  // -------------------------------------------------------------------------
  // Summary stats
  // -------------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = discoveries.length;
    const pendingReview = discoveries.filter(
      (d) => d.status === "pending_content" || d.status === "pending_metadata",
    ).length;
    const approved = discoveries.filter((d) => d.status === "approved").length;
    const rejected = discoveries.filter((d) => d.status === "rejected").length;
    return { total, pendingReview, approved, rejected };
  }, [discoveries]);

  // -------------------------------------------------------------------------
  // Filter + Sort + Paginate
  // -------------------------------------------------------------------------

  const filtered = useMemo(() => {
    return discoveries.filter((d) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !d.title.toLowerCase().includes(q) &&
          !d.url.toLowerCase().includes(q)
        )
          return false;
      }
      // Status filter is server-side, but if showing all, we still respect it
      if (
        filters.discoveryMethod &&
        d.discoveryMethod !== filters.discoveryMethod
      )
        return false;
      if (filters.minConfidence) {
        const min = parseFloat(filters.minConfidence);
        if (
          !isNaN(min) &&
          (d.combinedConfidence === null || d.combinedConfidence < min)
        )
          return false;
      }
      if (filters.maxConfidence) {
        const max = parseFloat(filters.maxConfidence);
        if (
          !isNaN(max) &&
          (d.combinedConfidence === null || d.combinedConfidence > max)
        )
          return false;
      }
      return true;
    });
  }, [discoveries, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "combinedConfidence":
          cmp = (a.combinedConfidence ?? -1) - (b.combinedConfidence ?? -1);
          break;
        case "discoveredAt":
          cmp =
            new Date(a.discoveredAt).getTime() -
            new Date(b.discoveredAt).getTime();
          break;
        case "status":
          cmp = statusWeight(a.status) - statusWeight(b.status);
          break;
        case "discoveryMethod":
          cmp = a.discoveryMethod.localeCompare(b.discoveryMethod);
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
    paginated.length > 0 && paginated.every((d) => selected.has(d.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      const next = new Set(selected);
      paginated.forEach((d) => next.delete(d.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      paginated.forEach((d) => next.add(d.id));
      setSelected(next);
    }
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

  async function bulkAction(action: "approve" | "reject") {
    if (selected.size === 0) return;

    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Rejection reason:");
      if (!input) return;
      reason = input;
    }

    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/discoveries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: Array.from(selected),
          reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Bulk action failed");
      }
      setSelected(new Set());
      await fetchDiscoveries();
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
      setSortDir(field === "title" ? "asc" : "desc");
    }
    setPage(1);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading discoveries...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchDiscoveries}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Total Discovered</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>

        <div
          className={`border rounded-lg p-4 ${stats.pendingReview > 0 ? "border-yellow-200 bg-yellow-50" : "border-gray-200"}`}
        >
          <div className="flex items-center gap-2 text-yellow-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Pending Review</span>
          </div>
          <p className="text-2xl font-bold">{stats.pendingReview}</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Approved</span>
          </div>
          <p className="text-2xl font-bold">{stats.approved}</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">Rejected</span>
          </div>
          <p className="text-2xl font-bold">{stats.rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title or URL..."
            value={filters.search}
            onChange={(e) => {
              setFilters((f) => ({ ...f, search: e.target.value }));
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={filters.status}
          onChange={(e) => {
            setFilters((f) => ({
              ...f,
              status: e.target.value as DiscoveryStatus | "",
            }));
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.discoveryMethod}
          onChange={(e) => {
            setFilters((f) => ({ ...f, discoveryMethod: e.target.value }));
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Methods</option>
          <option value="map">Sitemap</option>
          <option value="search">Search</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-700">
            {selected.size} selected
          </span>
          <button
            onClick={() => bulkAction("approve")}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => bulkAction("reject")}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            Reject
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
                onClick={() => handleSort("title")}
              >
                <span className="flex items-center gap-1">
                  Title <SortIcon field="title" />
                </span>
              </th>
              <th className="px-3 py-3 text-left">URL</th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("discoveryMethod")}
              >
                <span className="flex items-center gap-1">
                  Method <SortIcon field="discoveryMethod" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("combinedConfidence")}
              >
                <span className="flex items-center gap-1">
                  Confidence <SortIcon field="combinedConfidence" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("status")}
              >
                <span className="flex items-center gap-1">
                  Status <SortIcon field="status" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("discoveredAt")}
              >
                <span className="flex items-center gap-1">
                  Discovered <SortIcon field="discoveredAt" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((d) => {
              const badge = statusBadge(d.status);
              return (
                <tr
                  key={d.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName === "INPUT") return;
                    window.location.href = `/admin/discoveries/${d.id}`;
                  }}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-3 font-medium max-w-[250px] truncate">
                    {d.title}
                  </td>
                  <td className="px-3 py-3 text-gray-500 max-w-[200px] truncate">
                    {d.url}
                  </td>
                  <td className="px-3 py-3 capitalize text-gray-500">
                    {d.discoveryMethod}
                  </td>
                  <td className="px-3 py-3">
                    {d.combinedConfidence !== null ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceBg(d.combinedConfidence)}`}
                      >
                        {(d.combinedConfidence * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">N/A</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-500">
                    {formatDate(d.discoveredAt)}
                  </td>
                </tr>
              );
            })}

            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No discoveries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(page * ITEMS_PER_PAGE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
