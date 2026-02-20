import { ExternalLink } from "lucide-react";

interface CitationCardProps {
  title: string;
  url?: string | undefined;
  documentType: string;
  section?: string | undefined;
  snippet: string;
}

export function CitationCard({
  title,
  url,
  documentType,
  section,
  snippet,
}: CitationCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 mt-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{title}</p>
          {section && <p className="text-gray-500 text-xs mt-0.5">{section}</p>}
          <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {documentType}
          </span>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
      <p className="text-gray-600 mt-2 line-clamp-2">{snippet}</p>
    </div>
  );
}
