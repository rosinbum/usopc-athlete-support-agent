import { ExternalLink, Calendar, FileText, Building2 } from "lucide-react";

export interface SourceDocument {
  sourceUrl: string;
  documentTitle: string;
  documentType: string | null;
  ngbId: string | null;
  topicDomain: string | null;
  authorityLevel: string | null;
  effectiveDate: string | null;
  ingestedAt: string;
  chunkCount: number;
}

interface SourceCardProps {
  source: SourceDocument;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SourceCard({ source }: SourceCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">
            {source.documentTitle}
          </h3>

          <div className="mt-2 flex flex-wrap gap-2">
            {source.documentType && (
              <span className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {source.documentType}
              </span>
            )}
            {source.topicDomain && (
              <span className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                {source.topicDomain}
              </span>
            )}
            {source.authorityLevel && (
              <span className="inline-block text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                {source.authorityLevel}
              </span>
            )}
          </div>
        </div>

        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 shrink-0 p-1"
          title="View source document"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="mt-3 text-xs text-gray-500 space-y-1">
        {source.ngbId && (
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            <span>{source.ngbId}</span>
          </div>
        )}

        {source.effectiveDate && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>Effective: {formatDate(source.effectiveDate)}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          <span>{source.chunkCount} chunks</span>
        </div>

        <div className="text-gray-400">
          Ingested: {formatDate(source.ingestedAt)}
        </div>
      </div>
    </div>
  );
}
