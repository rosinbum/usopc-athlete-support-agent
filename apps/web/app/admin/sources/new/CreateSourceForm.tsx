"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  TOPIC_DOMAINS,
  AUTHORITY_LEVELS,
  DOCUMENT_TYPES,
} from "../../../../lib/source-constants.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateSourceForm() {
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"pdf" | "html" | "text">("pdf");
  const [documentType, setDocumentType] = useState<
    (typeof DOCUMENT_TYPES)[number]
  >(DOCUMENT_TYPES[3]);
  const [topicDomains, setTopicDomains] = useState<Set<string>>(new Set());
  const [authorityLevel, setAuthorityLevel] = useState<
    (typeof AUTHORITY_LEVELS)[number]
  >(AUTHORITY_LEVELS[8]);
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [ngbId, setNgbId] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Auto-slug
  // -------------------------------------------------------------------------

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!idTouched) {
      setId(toSlug(value));
    }
  }

  // -------------------------------------------------------------------------
  // Topic domain toggle
  // -------------------------------------------------------------------------

  function toggleDomain(domain: string) {
    setTopicDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!id.trim()) errs.id = "ID is required";
    else if (!/^[a-z0-9-]+$/.test(id))
      errs.id = "ID must be lowercase alphanumeric with hyphens";
    if (!title.trim()) errs.title = "Title is required";
    if (!description.trim()) errs.description = "Description is required";
    if (!url.trim()) errs.url = "URL is required";
    else {
      try {
        new URL(url);
      } catch {
        errs.url = "Must be a valid URL";
      }
    }
    if (topicDomains.size === 0)
      errs.topicDomains = "At least one topic domain is required";
    return errs;
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const body = {
        id,
        title: title.trim(),
        description: description.trim(),
        url: url.trim(),
        format,
        documentType,
        topicDomains: Array.from(topicDomains),
        authorityLevel,
        priority,
        ngbId: ngbId.trim() || null,
      };

      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        const data = await res.json();
        window.location.href = `/admin/sources/${data.source.id}`;
        return;
      }

      const data = await res.json();
      if (res.status === 409) {
        setApiError("A source with this ID already exists");
      } else if (res.status === 400 && data.details) {
        const fieldErrors: FormErrors = {};
        for (const [key, msgs] of Object.entries(data.details)) {
          fieldErrors[key] = (msgs as string[])[0];
        }
        setErrors(fieldErrors);
      } else {
        setApiError(data.error || "Failed to create source");
      }
    } catch {
      setApiError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit}>
      <a
        href="/admin/sources"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sources
      </a>

      {apiError && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {apiError}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg p-6 space-y-5">
        {/* Title */}
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Title *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            placeholder="e.g. USOPC Bylaws"
          />
          {errors.title && (
            <p className="text-red-600 text-sm mt-1">{errors.title}</p>
          )}
        </div>

        {/* ID */}
        <div>
          <label
            htmlFor="source-id"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            ID *
          </label>
          <input
            id="source-id"
            type="text"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setIdTouched(true);
            }}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full font-mono"
            placeholder="e.g. usopc-bylaws"
          />
          <p className="text-xs text-gray-400 mt-1">
            Auto-generated from title. Lowercase alphanumeric and hyphens only.
          </p>
          {errors.id && (
            <p className="text-red-600 text-sm mt-1">{errors.id}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description *
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            placeholder="Brief description of this document source"
          />
          {errors.description && (
            <p className="text-red-600 text-sm mt-1">{errors.description}</p>
          )}
        </div>

        {/* URL */}
        <div>
          <label
            htmlFor="url"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            URL *
          </label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            placeholder="https://example.com/document.pdf"
          />
          {errors.url && (
            <p className="text-red-600 text-sm mt-1">{errors.url}</p>
          )}
        </div>

        {/* Format + Document Type row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="format"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Format
            </label>
            <select
              id="format"
              value={format}
              onChange={(e) =>
                setFormat(e.target.value as "pdf" | "html" | "text")
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            >
              <option value="pdf">PDF</option>
              <option value="html">HTML</option>
              <option value="text">Text</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="documentType"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Document Type
            </label>
            <select
              id="documentType"
              value={documentType}
              onChange={(e) =>
                setDocumentType(
                  e.target.value as (typeof DOCUMENT_TYPES)[number],
                )
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {formatLabel(dt)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Topic Domains */}
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">
            Topic Domains *
          </legend>
          <div className="flex flex-wrap gap-2">
            {TOPIC_DOMAINS.map((domain) => (
              <label
                key={domain}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer select-none ${
                  topicDomains.has(domain)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={topicDomains.has(domain)}
                  onChange={() => toggleDomain(domain)}
                  className="sr-only"
                />
                {formatLabel(domain)}
              </label>
            ))}
          </div>
          {errors.topicDomains && (
            <p className="text-red-600 text-sm mt-1">{errors.topicDomains}</p>
          )}
        </fieldset>

        {/* Authority Level + Priority row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="authorityLevel"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Authority Level
            </label>
            <select
              id="authorityLevel"
              value={authorityLevel}
              onChange={(e) =>
                setAuthorityLevel(
                  e.target.value as (typeof AUTHORITY_LEVELS)[number],
                )
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            >
              {AUTHORITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {formatLabel(level)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as "high" | "medium" | "low")
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* NGB ID */}
        <div>
          <label
            htmlFor="ngbId"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            NGB ID
          </label>
          <input
            id="ngbId"
            type="text"
            value={ngbId}
            onChange={(e) => setNgbId(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
            placeholder="Leave blank for USOPC-wide"
          />
          <p className="text-xs text-gray-400 mt-1">
            Optional. Leave blank for USOPC-wide sources.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-6">
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Create Source
        </button>
        <a
          href="/admin/sources"
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
