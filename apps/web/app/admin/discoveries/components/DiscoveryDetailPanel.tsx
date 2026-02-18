"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { DiscoveredSource, DiscoveryStatus } from "@usopc/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
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

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function confidenceDisplay(value: number | null): string {
  if (value === null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function confidenceBadge(value: number | null): string {
  if (value === null) return "bg-gray-100 text-gray-500";
  if (value >= 0.85) return "bg-green-100 text-green-700";
  if (value >= 0.5) return "bg-yellow-100 text-yellow-700";
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

const PENDING_STATUSES = new Set<DiscoveryStatus>([
  "pending_metadata",
  "pending_content",
]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DiscoveryDetailPanelProps {
  id: string;
  onClose: () => void;
  onMutate: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function DiscoveryDetailPanel({
  id,
  onClose,
  onMutate,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: DiscoveryDetailPanelProps) {
  const [discovery, setDiscovery] = useState<DiscoveredSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const fetchDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Discovery not found");
        throw new Error("Failed to fetch discovery");
      }
      const data = await res.json();
      setDiscovery(data.discovery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDiscovery();
  }, [fetchDiscovery]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleApprove() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      onMutate();
      if (hasNext) {
        onNext?.();
      } else {
        const data = await res.json();
        setDiscovery(data.discovery);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason.trim() }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      setShowRejectInput(false);
      setRejectReason("");
      onMutate();
      if (hasNext) {
        onNext?.();
      } else {
        const data = await res.json();
        setDiscovery(data.discovery);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendToSources() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_to_sources" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send to sources");
      }
      const data = await res.json();
      setDiscovery(data.discovery);
      onMutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send to sources failed");
    } finally {
      setActionLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading discovery...</span>
      </div>
    );
  }

  if (error || !discovery) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error ?? "Discovery not found"}</p>
        <button
          onClick={onClose}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Close
        </button>
      </div>
    );
  }

  const badge = statusBadge(discovery.status);
  const isPending = PENDING_STATUSES.has(discovery.status);
  const canSendToSources =
    discovery.status === "approved" && !discovery.sourceConfigId;
  const showApprove = isPending || discovery.status === "rejected";
  const showReject =
    isPending || (discovery.status === "approved" && !discovery.sourceConfigId);

  const sections: Record<string, Record<string, React.ReactNode>> = {
    Identity: {
      id: discovery.id,
      title: discovery.title,
      url: (
        <span className="flex items-center gap-2">
          <a
            href={discovery.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 break-all"
          >
            {discovery.url}
          </a>
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </span>
      ),
    },
    "Discovery Info": {
      discoveryMethod: discovery.discoveryMethod,
      discoveredAt: formatDate(discovery.discoveredAt),
      discoveredFrom: discovery.discoveredFrom ?? "N/A",
    },
    "Metadata Evaluation": {
      metadataConfidence: (
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceBadge(discovery.metadataConfidence)}`}
        >
          {confidenceDisplay(discovery.metadataConfidence)}
        </span>
      ),
      metadataReasoning: discovery.metadataReasoning ?? "N/A",
    },
    "Content Evaluation": {
      contentConfidence: (
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceBadge(discovery.contentConfidence)}`}
        >
          {confidenceDisplay(discovery.contentConfidence)}
        </span>
      ),
      combinedConfidence: (
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${confidenceBadge(discovery.combinedConfidence)}`}
        >
          {confidenceDisplay(discovery.combinedConfidence)}
        </span>
      ),
      contentReasoning: discovery.contentReasoning ?? "N/A",
    },
    "Extracted Metadata": {
      documentType: discovery.documentType ?? "N/A",
      topicDomains:
        discovery.topicDomains.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {discovery.topicDomains.map((d) => (
              <span
                key={d}
                className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
              >
                {d}
              </span>
            ))}
          </div>
        ) : (
          "N/A"
        ),
      priority: discovery.priority ?? "N/A",
      authorityLevel: discovery.authorityLevel
        ? discovery.authorityLevel.replace(/_/g, " ")
        : "N/A",
      format: discovery.format?.toUpperCase() ?? "N/A",
      ngbId: discovery.ngbId ?? "N/A",
    },
    Description: {
      description: discovery.description
        ? discovery.description.length > 500
          ? `${discovery.description.slice(0, 500)}...`
          : discovery.description
        : "N/A",
    },
    "Review Status": {
      status: (
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      ),
      reviewedAt: formatDate(discovery.reviewedAt),
      reviewedBy: discovery.reviewedBy ?? "N/A",
      rejectionReason: discovery.rejectionReason ?? "N/A",
    },
    "Linked Source": {
      sourceConfigId: discovery.sourceConfigId ?? "Not linked",
    },
    Timestamps: {
      createdAt: formatDate(discovery.createdAt),
      updatedAt: formatDate(discovery.updatedAt),
    },
  };

  return (
    <div>
      {/* Navigation + Title */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous discovery"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next discovery"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{discovery.title}</h2>
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      {(isPending || canSendToSources || showApprove || showReject) && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {showApprove && (
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="px-4 py-2 text-sm rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Approve
            </button>
          )}

          {showReject && (
            <>
              {showRejectInput ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    placeholder="Rejection reason..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    onClick={handleReject}
                    disabled={actionLoading || !rejectReason.trim()}
                    className="px-4 py-2 text-sm rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => {
                      setShowRejectInput(false);
                      setRejectReason("");
                    }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowRejectInput(true)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              )}
            </>
          )}

          {canSendToSources && (
            <button
              onClick={handleSendToSources}
              disabled={actionLoading}
              className="px-4 py-2 text-sm rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Send to Sources
            </button>
          )}
        </div>
      )}

      {/* Detail Fields */}
      <div className="grid grid-cols-1 gap-6">
        {Object.entries(sections).map(([section, sectionFields]) => (
          <div key={section} className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {section}
            </h3>
            <dl className="space-y-2">
              {Object.entries(sectionFields).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-gray-400">{formatLabel(key)}</dt>
                  <dd className="text-sm text-gray-900 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
