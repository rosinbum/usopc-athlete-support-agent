"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  parseSourceCSV,
  validateSourceRows,
  type ValidatedRow,
} from "../../../../lib/csv-sources.js";
import { UploadStep } from "./UploadStep.js";
import { PreviewStep } from "./PreviewStep.js";
import { ResultsStep } from "./ResultsStep.js";

type Step = "upload" | "preview" | "results";

interface BulkResult {
  id: string;
  title: string;
  status: "created" | "duplicate" | "failed";
  error?: string;
}

const STEP_LABELS: Record<Step, string> = {
  upload: "Upload CSV",
  preview: "Preview & Validate",
  results: "Results",
};

const STEPS: Step[] = ["upload", "preview", "results"];

export function BulkImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Step 1: File selected → parse + validate → move to preview
  // ---------------------------------------------------------------------------

  async function handleFileSelected(csvText: string) {
    setApiError(null);
    const { rows, parseErrors: errors } = parseSourceCSV(csvText);
    setParseErrors(errors);

    // Fetch existing source IDs for duplicate detection
    let existingIds = new Set<string>();
    try {
      const res = await fetch("/api/admin/sources");
      if (res.ok) {
        const data = await res.json();
        existingIds = new Set(
          (data.sources as { id: string }[]).map((s) => s.id),
        );
      }
    } catch {
      // If we can't fetch, proceed without duplicate detection
    }

    const validated = validateSourceRows(rows, existingIds);
    setValidatedRows(validated);
    setStep("preview");
  }

  // ---------------------------------------------------------------------------
  // Step 2: Confirm → send valid rows to bulk-create API → move to results
  // ---------------------------------------------------------------------------

  async function handleConfirm() {
    const validRows = validatedRows.filter((r) => r.status === "valid");
    if (validRows.length === 0) return;

    setSubmitting(true);
    setApiError(null);

    try {
      const res = await fetch("/api/admin/sources/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: validRows.map((r) => r.data),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setApiError(data.error || "Failed to create sources");
        return;
      }

      const data = await res.json();
      setResults(data.results);
      setStep("results");
    } catch {
      setApiError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Reset to start
  // ---------------------------------------------------------------------------

  function handleReset() {
    setStep("upload");
    setValidatedRows([]);
    setParseErrors([]);
    setResults([]);
    setApiError(null);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const currentStepIndex = STEPS.indexOf(step);

  return (
    <div>
      <a
        href="/admin/sources"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sources
      </a>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-300" />}
            <div
              className={`flex items-center gap-1.5 text-sm ${
                i <= currentStepIndex
                  ? "text-blue-700 font-medium"
                  : "text-gray-400"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  i < currentStepIndex
                    ? "bg-blue-600 text-white"
                    : i === currentStepIndex
                      ? "bg-blue-100 text-blue-700 border border-blue-300"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {i + 1}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {apiError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {apiError}
        </div>
      )}

      {/* Steps */}
      {step === "upload" && <UploadStep onFileSelected={handleFileSelected} />}
      {step === "preview" && (
        <PreviewStep
          rows={validatedRows}
          parseErrors={parseErrors}
          onConfirm={handleConfirm}
          onBack={handleReset}
          submitting={submitting}
        />
      )}
      {step === "results" && (
        <ResultsStep results={results} onImportAnother={handleReset} />
      )}
    </div>
  );
}
