"use client";

import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import type { ValidatedRow } from "../../../../lib/csv-sources.js";

interface PreviewStepProps {
  rows: ValidatedRow[];
  parseErrors: string[];
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}

function StatusBadge({ status }: { status: ValidatedRow["status"] }) {
  switch (status) {
    case "valid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle2 className="w-3 h-3" /> Valid
        </span>
      );
    case "invalid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" /> Invalid
        </span>
      );
    case "duplicate":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <AlertTriangle className="w-3 h-3" /> Duplicate
        </span>
      );
  }
}

export function PreviewStep({
  rows,
  parseErrors,
  onConfirm,
  onBack,
  submitting,
}: PreviewStepProps) {
  const validCount = rows.filter((r) => r.status === "valid").length;
  const invalidCount = rows.filter((r) => r.status === "invalid").length;
  const duplicateCount = rows.filter((r) => r.status === "duplicate").length;

  return (
    <div className="space-y-4">
      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium mb-1">CSV parse errors:</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary counts */}
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium text-gray-700">
          {rows.length} row{rows.length !== 1 ? "s" : ""} found:
        </span>
        <span className="text-green-700">{validCount} valid</span>
        <span className="text-red-700">{invalidCount} invalid</span>
        <span className="text-yellow-700">{duplicateCount} duplicate</span>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Row
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                ID
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Title
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Type
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Issues
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowIndex}
                className={`border-b border-gray-100 ${
                  row.status === "invalid"
                    ? "bg-red-50/50"
                    : row.status === "duplicate"
                      ? "bg-yellow-50/50"
                      : ""
                }`}
              >
                <td className="px-3 py-2 text-gray-500">{row.rowIndex + 1}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.data.id || "—"}
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate">
                  {row.data.title || "—"}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {row.data.documentType || "—"}
                </td>
                <td className="px-3 py-2 text-xs text-red-600">
                  {row.errors.length > 0 ? row.errors.join("; ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={validCount === 0 || submitting}
          className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting
            ? "Creating..."
            : `Create ${validCount} Source${validCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
