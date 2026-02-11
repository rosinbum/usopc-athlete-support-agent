"use client";

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface BulkResult {
  id: string;
  title: string;
  status: "created" | "duplicate" | "failed";
  error?: string;
}

interface ResultsStepProps {
  results: BulkResult[];
  onImportAnother: () => void;
}

function StatusBadge({ status }: { status: BulkResult["status"] }) {
  switch (status) {
    case "created":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle2 className="w-3 h-3" /> Created
        </span>
      );
    case "duplicate":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <AlertTriangle className="w-3 h-3" /> Skipped
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
  }
}

export function ResultsStep({ results, onImportAnother }: ResultsStepProps) {
  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "duplicate").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div
        className={`p-4 rounded-lg border ${
          failed > 0
            ? "bg-yellow-50 border-yellow-200"
            : "bg-green-50 border-green-200"
        }`}
      >
        <p className="text-sm font-medium">
          {created} created, {skipped} skipped, {failed} failed
        </p>
      </div>

      {/* Results table */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
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
                Error
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.id} className="border-b border-gray-100">
                <td className="px-3 py-2">
                  <StatusBadge status={result.status} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{result.id}</td>
                <td className="px-3 py-2 max-w-[250px] truncate">
                  {result.title}
                </td>
                <td className="px-3 py-2 text-xs text-red-600">
                  {result.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <a
          href="/admin/sources"
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          View All Sources
        </a>
        <button
          type="button"
          onClick={onImportAnother}
          className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2 text-sm font-medium"
        >
          Import Another
        </button>
      </div>
    </div>
  );
}
