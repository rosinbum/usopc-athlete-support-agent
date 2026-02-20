"use client";

import { useState, useMemo } from "react";
import {
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Upload,
} from "lucide-react";
import type { DiscoveryStatus } from "@usopc/shared";
import { SlidePanel } from "../components/SlidePanel.js";
import { SortIcon } from "../components/SortIcon.js";
import { Pagination } from "../components/Pagination.js";
import { formatDate } from "../components/formatDate.js";
import { DiscoveryDetailPanel } from "./components/DiscoveryDetailPanel.js";
import {
  useDiscoveries,
  useBulkDiscoveryAction,
} from "../hooks/use-discoveries.js";

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
  sourceLink: "" | "linked" | "unlinked";
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
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    discoveryMethod: "",
    minConfidence: "",
    maxConfidence: "",
    sourceLink: "",
  });
  const [sortField, setSortField] = useState<SortField>("combinedConfidence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openDiscoveryId, setOpenDiscoveryId] = useState<string | null>(null);
  const [cardFilter, setCardFilter] = useState<
    "pendingReview" | "approved" | "rejected" | "sentToSources" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data hooks
  // -------------------------------------------------------------------------

  const {
    discoveries,
    isLoading,
    error: fetchError,
    mutate,
  } = useDiscoveries(filters.status);

  const { trigger: triggerBulk, isMutating: bulkLoading } =
    useBulkDiscoveryAction();

  const error = actionError || (fetchError ? fetchError.message : null);

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
    const sentToSources = discoveries.filter((d) => d.sourceConfigId).length;
    const approvedUnlinked = discoveries.filter(
      (d) => d.status === "approved" && !d.sourceConfigId,
    ).length;
    return {
      total,
      pendingReview,
      approved,
      rejected,
      sentToSources,
      approvedUnlinked,
    };
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
      if (
        filters.discoveryMethod &&
        d.discoveryMethod !== filters.discoveryMethod
      )
        return false;
      if (filters.sourceLink === "linked" && !d.sourceConfigId) return false;
      if (filters.sourceLink === "unlinked" && d.sourceConfigId) return false;
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
      if (cardFilter === "pendingReview") {
        if (d.status !== "pending_metadata" && d.status !== "pending_content")
          return false;
      }
      if (cardFilter === "approved") {
        if (d.status !== "approved") return false;
      }
      if (cardFilter === "rejected") {
        if (d.status !== "rejected") return false;
      }
      if (cardFilter === "sentToSources") {
        if (!d.sourceConfigId) return false;
      }
      return true;
    });
  }, [discoveries, filters, cardFilter]);

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
    const next = new Set(selected);
    if (allOnPageSelected) {
      paginated.forEach((d) => next.delete(d.id));
    } else {
      paginated.forEach((d) => next.add(d.id));
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

  async function bulkAction(action: "approve" | "reject") {
    if (selected.size === 0) return;

    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Rejection reason:");
      if (!input) return;
      reason = input;
    }

    setActionError(null);
    try {
      await triggerBulk({
        action,
        ids: Array.from(selected),
        reason,
      });
      setSelected(new Set());
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk action failed");
    }
  }

  async function bulkSendToSources(ids?: string[]) {
    setActionError(null);
    try {
      const data = await triggerBulk({
        action: "send_to_sources",
        ...(ids ? { ids } : {}),
      });
      const parts: string[] = [];
      if (data && data.created && data.created > 0)
        parts.push(`${data.created} created`);
      if (data && data.alreadyLinked && data.alreadyLinked > 0)
        parts.push(`${data.alreadyLinked} already linked`);
      if (data && data.duplicateUrl && data.duplicateUrl > 0)
        parts.push(`${data.duplicateUrl} linked to existing source (same URL)`);
      if (data && data.notApproved && data.notApproved > 0)
        parts.push(`${data.notApproved} not approved`);
      if (data && data.failed && data.failed > 0)
        parts.push(`${data.failed} failed`);
      window.alert(
        parts.length > 0
          ? `Send to Sources: ${parts.join(", ")}`
          : "No discoveries to process",
      );
      setSelected(new Set());
      await mutate();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Send to sources failed",
      );
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

  function SortBtn({ field }: { field: SortField }) {
    return (
      <SortIcon field={field} activeField={sortField} direction={sortDir} />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading discoveries...</span>
      </div>
    );
  }

  if (error && discoveries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => mutate()}
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <button
          type="button"
          onClick={() => {
            setCardFilter(null);
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${cardFilter === null ? "ring-2 ring-blue-500" : "border-gray-200"}`}
        >
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Total Discovered</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) =>
              c === "pendingReview" ? null : "pendingReview",
            );
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "pendingReview"
              ? "ring-2 ring-yellow-500 border-yellow-200 bg-yellow-50"
              : stats.pendingReview > 0
                ? "border-yellow-200 bg-yellow-50"
                : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-yellow-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Pending Review</span>
          </div>
          <p className="text-2xl font-bold">{stats.pendingReview}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) => (c === "approved" ? null : "approved"));
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "approved"
              ? "ring-2 ring-green-500 border-green-200 bg-green-50"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Approved</span>
          </div>
          <p className="text-2xl font-bold">{stats.approved}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) => (c === "rejected" ? null : "rejected"));
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "rejected"
              ? "ring-2 ring-red-500 border-red-200 bg-red-50"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">Rejected</span>
          </div>
          <p className="text-2xl font-bold">{stats.rejected}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setCardFilter((c) =>
              c === "sentToSources" ? null : "sentToSources",
            );
            setPage(1);
          }}
          className={`border rounded-lg p-4 text-left ${
            cardFilter === "sentToSources"
              ? "ring-2 ring-indigo-500 border-indigo-200 bg-indigo-50"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Upload className="w-4 h-4" />
            <span className="text-sm">Sent to Sources</span>
          </div>
          <p className="text-2xl font-bold">{stats.sentToSources}</p>
        </button>
      </div>

      {/* Send All Approved to Sources */}
      {stats.approvedUnlinked > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => bulkSendToSources()}
            disabled={bulkLoading}
            className="px-4 py-2 text-sm rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {bulkLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Send All Approved to Sources ({stats.approvedUnlinked})
          </button>
        </div>
      )}

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

        <select
          value={filters.sourceLink}
          onChange={(e) => {
            setFilters((f) => ({
              ...f,
              sourceLink: e.target.value as "" | "linked" | "unlinked",
            }));
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Sources</option>
          <option value="linked">Sent to Sources</option>
          <option value="unlinked">Not Sent</option>
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
          <button
            onClick={() => bulkSendToSources(Array.from(selected))}
            disabled={bulkLoading}
            className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            Send to Sources
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
                  Title <SortBtn field="title" />
                </span>
              </th>
              <th className="px-3 py-3 text-left">URL</th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("discoveryMethod")}
              >
                <span className="flex items-center gap-1">
                  Method <SortBtn field="discoveryMethod" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("combinedConfidence")}
              >
                <span className="flex items-center gap-1">
                  Confidence <SortBtn field="combinedConfidence" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("status")}
              >
                <span className="flex items-center gap-1">
                  Status <SortBtn field="status" />
                </span>
              </th>
              <th
                className="px-3 py-3 text-left cursor-pointer select-none"
                onClick={() => handleSort("discoveredAt")}
              >
                <span className="flex items-center gap-1">
                  Discovered <SortBtn field="discoveredAt" />
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
                    setOpenDiscoveryId(d.id);
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
                    {d.sourceConfigId && (
                      <span className="inline-block ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                        Sent
                      </span>
                    )}
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
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={sorted.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setPage}
      />

      {/* Detail Slide Panel */}
      <SlidePanel
        open={!!openDiscoveryId}
        onClose={() => setOpenDiscoveryId(null)}
      >
        {openDiscoveryId && (
          <DiscoveryDetailPanel
            id={openDiscoveryId}
            onClose={() => setOpenDiscoveryId(null)}
            onMutate={() => mutate()}
            hasPrev={sorted.findIndex((d) => d.id === openDiscoveryId) > 0}
            hasNext={
              sorted.findIndex((d) => d.id === openDiscoveryId) <
              sorted.length - 1
            }
            onPrev={() => {
              const idx = sorted.findIndex((d) => d.id === openDiscoveryId);
              if (idx > 0) setOpenDiscoveryId(sorted[idx - 1]!.id);
            }}
            onNext={() => {
              const idx = sorted.findIndex((d) => d.id === openDiscoveryId);
              if (idx < sorted.length - 1)
                setOpenDiscoveryId(sorted[idx + 1]!.id);
            }}
          />
        )}
      </SlidePanel>
    </div>
  );
}
