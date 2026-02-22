"use client";

import { useRef } from "react";
import { Upload, Download, FileText } from "lucide-react";
import { CSV_TEMPLATE } from "../../../../lib/csv-sources.js";
import {
  TOPIC_DOMAINS,
  DOCUMENT_TYPES,
  AUTHORITY_LEVELS,
} from "../../../../lib/source-constants.js";
import { snakeToLabel } from "../../../../lib/format-label.js";

interface UploadStepProps {
  onFileSelected: (csvText: string) => void;
}

export function UploadStep({ onFileSelected }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onFileSelected(reader.result);
      }
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sources-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 mb-1">
          Click to upload a CSV file
        </p>
        <p className="text-xs text-gray-500">or drag and drop</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Template download */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
        >
          <Download className="w-4 h-4" />
          Download Template CSV
        </button>
      </div>

      {/* Format instructions */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">CSV Format</h3>
        </div>

        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-700 mb-1">Required columns:</p>
            <p>
              <code className="bg-gray-100 px-1 rounded text-xs">title</code>,{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                documentType
              </code>
              ,{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                topicDomains
              </code>
              , <code className="bg-gray-100 px-1 rounded text-xs">url</code>,{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">
                description
              </code>
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-700 mb-1">
              Optional columns (with defaults):
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>
                <code className="bg-gray-100 px-1 rounded">id</code> —
                auto-generated from title
              </li>
              <li>
                <code className="bg-gray-100 px-1 rounded">format</code> —
                default: pdf
              </li>
              <li>
                <code className="bg-gray-100 px-1 rounded">priority</code> —
                default: medium
              </li>
              <li>
                <code className="bg-gray-100 px-1 rounded">authorityLevel</code>{" "}
                — default: educational_guidance
              </li>
              <li>
                <code className="bg-gray-100 px-1 rounded">ngbId</code> —
                optional
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-gray-700 mb-1">
              topicDomains format:
            </p>
            <p className="text-xs">
              Use pipe-separated values, e.g.{" "}
              <code className="bg-gray-100 px-1 rounded">
                team_selection|safesport
              </code>
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-700 mb-1">Valid values:</p>
            <ul className="space-y-1 text-xs">
              <li>
                <span className="font-medium">documentType:</span>{" "}
                {DOCUMENT_TYPES.map(snakeToLabel).join(", ")}
              </li>
              <li>
                <span className="font-medium">topicDomains:</span>{" "}
                {TOPIC_DOMAINS.map(snakeToLabel).join(", ")}
              </li>
              <li>
                <span className="font-medium">authorityLevel:</span>{" "}
                {AUTHORITY_LEVELS.map(snakeToLabel).join(", ")}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
