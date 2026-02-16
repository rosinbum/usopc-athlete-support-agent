import { ChevronRight } from "lucide-react";
import { CitationCard } from "./CitationCard.js";
import type { Citation } from "../../types/citation.js";

interface CitationListProps {
  citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) return null;

  return (
    <details className="group mt-3">
      <summary className="flex items-center gap-1 cursor-pointer text-sm text-gray-500 hover:text-gray-700 select-none list-none">
        <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
        Sources ({citations.length})
      </summary>
      <div className="mt-1">
        {citations.map((citation, index) => (
          <CitationCard
            key={index}
            title={citation.title}
            url={citation.url}
            documentType={citation.documentType}
            section={citation.section}
            snippet={citation.snippet}
          />
        ))}
      </div>
    </details>
  );
}
