"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { SourceConfig } from "@usopc/shared";
import {
  SourceForm,
  type SourceFormValues,
} from "../../components/SourceForm.js";

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

export function EditSourceClient({ id }: { id: string }) {
  const apiUrl = `/api/admin/sources/${id}`;
  const detailUrl = `/admin/sources/${id}`;

  const [source, setSource] = useState<SourceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const initialValuesRef = useRef<SourceFormValues | null>(null);

  const fetchSource = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Source not found");
        throw new Error("Failed to fetch source");
      }
      const data = await res.json();
      setSource(data.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchSource();
  }, [fetchSource]);

  // Build form initial values eagerly during render (not in useEffect,
  // which would run after SourceForm mounts with empty defaults).
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

  async function handleSubmit(values: SourceFormValues) {
    if (!initialValuesRef.current) return;
    setApiError(null);

    const diff = computeDiff(initialValuesRef.current, values);

    if (Object.keys(diff).length === 0) {
      window.location.href = detailUrl;
      return;
    }

    const res = await fetch(apiUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(diff),
    });

    if (!res.ok) {
      const data = await res.json();
      setApiError(data.error || "Failed to update source");
      return;
    }

    window.location.href = detailUrl;
  }

  if (loading) {
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
        <a
          href="/admin/sources"
          className="mt-4 inline-block text-blue-600 hover:text-blue-800"
        >
          Back to Sources
        </a>
      </div>
    );
  }

  return (
    <div>
      <a
        href={detailUrl}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Source
      </a>
      <h1 className="text-2xl font-bold mb-6">Edit: {source.title}</h1>

      <SourceForm
        initialValues={initialValuesRef.current ?? undefined}
        idEditable={false}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        apiError={apiError}
        warning="Changing URL or format will delete existing indexed data and trigger re-ingestion."
      />
    </div>
  );
}
