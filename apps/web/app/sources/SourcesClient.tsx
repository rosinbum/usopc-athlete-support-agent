"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Building2, Clock, Loader2 } from "lucide-react";
import {
  SourceCard,
  type SourceDocument,
} from "../../components/sources/SourceCard.js";
import {
  SourceFilters,
  type SourceFiltersState,
} from "../../components/sources/SourceFilters.js";

interface SourcesStats {
  totalDocuments: number;
  totalOrganizations: number;
  lastIngestedAt: string | null;
}

interface SourcesListResponse {
  documents: SourceDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function SourcesClient() {
  const [stats, setStats] = useState<SourcesStats | null>(null);
  const [data, setData] = useState<SourcesListResponse | null>(null);
  const [filters, setFilters] = useState<SourceFiltersState>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/sources?action=stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const statsData = await res.json();
      setStats(statsData);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.documentType)
        params.set("documentType", filters.documentType);
      if (filters.topicDomain) params.set("topicDomain", filters.topicDomain);
      if (filters.ngbId) params.set("ngbId", filters.ngbId);
      if (filters.authorityLevel)
        params.set("authorityLevel", filters.authorityLevel);
      if (page > 1) params.set("page", String(page));

      const res = await fetch(`/api/sources?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch sources");
      const sourcesData = await res.json();
      setData(sourcesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleFilterChange = (newFilters: Partial<SourceFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  };

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-sm">Total Documents</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats?.totalDocuments ?? "—"}
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Building2 className="w-4 h-4" />
            <span className="text-sm">Organizations</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats?.totalOrganizations ?? "—"}
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Last Ingested</span>
          </div>
          <p className="text-lg font-medium text-gray-900">
            {stats ? formatDate(stats.lastIngestedAt) : "—"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <SourceFilters filters={filters} onFilterChange={handleFilterChange} />

      {/* Error State */}
      {error && (
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchSources}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading documents...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data?.documents.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No documents found.</p>
          {Object.keys(filters).length > 0 && (
            <button
              onClick={() => setFilters({})}
              className="mt-2 text-blue-600 hover:text-blue-800"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Documents Grid */}
      {!loading && !error && data && data.documents.length > 0 && (
        <>
          <div className="mb-4 text-sm text-gray-500">
            Showing {data.documents.length} of {data.total} documents
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.documents.map((doc) => (
              <SourceCard key={doc.sourceUrl} source={doc} />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
