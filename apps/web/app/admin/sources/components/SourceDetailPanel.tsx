"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  ExternalLink,
  Pencil,
  Trash2,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SourceForm, type SourceFormValues } from "./SourceForm.js";
import {
  useSource,
  useSourceAction,
  useSourceDelete,
  useSourceIngest,
  type SourceActionArg,
} from "../../hooks/use-sources.js";

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

const SCALAR_FIELDS = [
  "title",
  "description",
  "url",
  "format",
  "documentType",
  "authorityLevel",
  "priority",
] as const satisfies readonly (keyof SourceFormValues)[];

function computeDiff(
  initial: SourceFormValues,
  values: SourceFormValues,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  for (const key of SCALAR_FIELDS) {
    if (values[key] !== initial[key]) diff[key] = values[key];
  }

  if (
    JSON.stringify([...values.topicDomains].sort()) !==
    JSON.stringify([...initial.topicDomains].sort())
  ) {
    diff.topicDomains = values.topicDomains;
  }

  const newNgb = values.ngbId || null;
  const oldNgb = initial.ngbId || null;
  if (newNgb !== oldNgb) diff.ngbId = newNgb;

  return diff;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SourceDetailPanelProps {
  id: string;
  onClose: () => void;
  onMutate: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function SourceDetailPanel({
  id,
  onClose,
  onMutate,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: SourceDetailPanelProps) {
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const [apiError, setApiError] = useState<string | null>(null);
  const initialValuesRef = useRef<SourceFormValues | null>(null);

  // Reset mode when switching sources
  useEffect(() => {
    setMode("detail");
    initialValuesRef.current = null;
    setIngestResult(null);
    setApiError(null);
  }, [id]);

  // -------------------------------------------------------------------------
  // Data hooks
  // -------------------------------------------------------------------------

  const {
    source,
    chunkCount,
    isLoading,
    error: fetchError,
    mutate,
  } = useSource(id);

  const { trigger: triggerAction, isMutating: toggling } = useSourceAction(id);

  const { trigger: triggerDelete, isMutating: deleting } = useSourceDelete(id);

  const { trigger: triggerIngest, isMutating: ingesting } = useSourceIngest(id);

  const error = fetchError ? fetchError.message : null;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function toggleEnabled() {
    if (!source) return;
    try {
      await triggerAction({ enabled: !source.enabled });
      await mutate();
      onMutate();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function triggerIngestAction() {
    setIngestResult(null);
    try {
      await triggerIngest();
      setIngestResult("Ingestion triggered successfully");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to trigger ingestion";
      if (msg.includes("501")) {
        setIngestResult("Ingestion queue not available in dev environment");
      } else {
        setIngestResult(msg);
      }
    }
  }

  async function handleDelete() {
    if (!source) return;
    const confirmed = window.confirm(
      `Delete "${source.title}"?\n\nThis will permanently remove the source config and ${chunkCount} indexed chunk${chunkCount === 1 ? "" : "s"} from the vector database.`,
    );
    if (!confirmed) return;

    try {
      await triggerDelete();
      onMutate();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  if (source && !initialValuesRef.current) {
    initialValuesRef.current = {
      id: source.id,
      title: source.title,
      description: source.description,
      url: source.url,
      format: source.format,
      documentType: source.documentType as SourceFormValues["documentType"],
      topicDomains: source.topicDomains,
      authorityLevel:
        source.authorityLevel as SourceFormValues["authorityLevel"],
      priority: source.priority,
      ngbId: source.ngbId ?? "",
    };
  }

  async function handleEditSubmit(values: SourceFormValues) {
    if (!initialValuesRef.current) return;
    setApiError(null);

    const diff = computeDiff(initialValuesRef.current, values);

    if (Object.keys(diff).length === 0) {
      setMode("detail");
      return;
    }

    try {
      await triggerAction(diff as SourceActionArg);
      initialValuesRef.current = null;
      await mutate();
      onMutate();
      setMode("detail");
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to update source",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading source...</span>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error ?? "Source not found"}</p>
        <button
          onClick={onClose}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Close
        </button>
      </div>
    );
  }

  // -- Edit mode --
  if (mode === "edit") {
    return (
      <div>
        <button
          onClick={() => setMode("detail")}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Detail
        </button>
        <h2 className="text-xl font-bold mb-6">Edit: {source.title}</h2>

        <SourceForm
          initialValues={initialValuesRef.current ?? undefined}
          idEditable={false}
          submitLabel="Save Changes"
          onSubmit={handleEditSubmit}
          onCancel={() => setMode("detail")}
          apiError={apiError}
          warning="Changing URL or format will delete existing indexed data and trigger re-ingestion."
        />
      </div>
    );
  }

  // -- Detail mode --
  const fields: Record<string, Record<string, React.ReactNode>> = {
    Identity: {
      id: source.id,
      title: source.title,
      description: source.description,
      url: (
        <span className="flex items-center gap-2">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 break-all"
          >
            {source.url}
          </a>
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </span>
      ),
      format: source.format.toUpperCase(),
      documentType: source.documentType,
    },
    Organization: {
      ngbId: source.ngbId ?? "USOPC-wide",
      topicDomains: (
        <div className="flex flex-wrap gap-1">
          {source.topicDomains.map((d) => (
            <span
              key={d}
              className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
            >
              {d}
            </span>
          ))}
        </div>
      ),
    },
    Authority: {
      authorityLevel: source.authorityLevel.replace(/_/g, " "),
      priority: source.priority,
    },
    Status: {
      enabled: source.enabled ? "Yes" : "No",
      chunkCount: String(chunkCount),
      lastIngestedAt: formatDate(source.lastIngestedAt),
      consecutiveFailures: String(source.consecutiveFailures),
      lastError: source.lastError ?? "None",
    },
    Storage: {
      s3Key: source.s3Key ?? "\u2014",
      s3VersionId: source.s3VersionId ?? "\u2014",
    },
    Timestamps: {
      createdAt: formatDate(source.createdAt),
      updatedAt: formatDate(source.updatedAt),
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
              aria-label="Previous source"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next source"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{source.title}</h2>
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
              source.enabled
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {source.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => setMode("edit")}
          className="px-4 py-2 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Pencil className="w-4 h-4" />
          Edit Source
        </button>

        <button
          onClick={toggleEnabled}
          disabled={toggling}
          className={`px-4 py-2 text-sm rounded-lg font-medium ${
            source.enabled
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-green-600 text-white hover:bg-green-700"
          } disabled:opacity-50`}
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
          ) : null}
          {source.enabled ? "Disable Source" : "Enable Source"}
        </button>

        <button
          onClick={triggerIngestAction}
          disabled={ingesting}
          className="px-4 py-2 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          {ingesting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Trigger Ingestion
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-4 py-2 text-sm rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 ml-auto"
        >
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          Delete Source
        </button>
      </div>

      {ingestResult && (
        <div
          className={`mb-6 p-3 rounded-lg text-sm ${
            ingestResult.includes("success")
              ? "bg-green-50 text-green-700"
              : "bg-yellow-50 text-yellow-700"
          }`}
        >
          {ingestResult}
        </div>
      )}

      {/* Detail Fields */}
      <div className="grid grid-cols-1 gap-6">
        {Object.entries(fields).map(([section, sectionFields]) => (
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
