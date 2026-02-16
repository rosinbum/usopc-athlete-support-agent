export interface Citation {
  title: string;
  url?: string;
  documentType: string;
  section?: string;
  effectiveDate?: string;
  snippet: string;
  authorityLevel?: string;
}

export interface CitationAnnotation {
  type: "citations";
  citations: Citation[];
}

export function isCitationAnnotation(
  annotation: unknown,
): annotation is CitationAnnotation {
  return (
    typeof annotation === "object" &&
    annotation !== null &&
    "type" in annotation &&
    (annotation as Record<string, unknown>).type === "citations" &&
    "citations" in annotation &&
    Array.isArray((annotation as Record<string, unknown>).citations)
  );
}
