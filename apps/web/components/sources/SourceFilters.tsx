"use client";

import { Search } from "lucide-react";

const TOPIC_DOMAINS = [
  { value: "team_selection", label: "Team Selection" },
  { value: "dispute_resolution", label: "Dispute Resolution" },
  { value: "safesport", label: "SafeSport" },
  { value: "anti_doping", label: "Anti-Doping" },
  { value: "eligibility", label: "Eligibility" },
  { value: "governance", label: "Governance" },
  { value: "athlete_rights", label: "Athlete Rights" },
];

const DOCUMENT_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "bylaw", label: "Bylaw" },
  { value: "procedure", label: "Procedure" },
  { value: "rule", label: "Rule" },
  { value: "guideline", label: "Guideline" },
  { value: "faq", label: "FAQ" },
];

export interface SourceFiltersState {
  search?: string | undefined;
  documentType?: string | undefined;
  topicDomain?: string | undefined;
  ngbId?: string | undefined;
  authorityLevel?: string | undefined;
}

interface SourceFiltersProps {
  filters: SourceFiltersState;
  onFilterChange: (filters: Partial<SourceFiltersState>) => void;
  organizations?: Array<{ id: string; name: string }>;
}

export function SourceFilters({
  filters,
  onFilterChange,
  organizations = [],
}: SourceFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <div className="flex-1 min-w-[200px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={filters.search ?? ""}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label htmlFor="documentType" className="sr-only">
          Document Type
        </label>
        <select
          id="documentType"
          value={filters.documentType ?? ""}
          onChange={(e) =>
            onFilterChange({ documentType: e.target.value || undefined })
          }
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Document Types</option>
          {DOCUMENT_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="topicDomain" className="sr-only">
          Topic
        </label>
        <select
          id="topicDomain"
          value={filters.topicDomain ?? ""}
          onChange={(e) =>
            onFilterChange({ topicDomain: e.target.value || undefined })
          }
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Topics</option>
          {TOPIC_DOMAINS.map((td) => (
            <option key={td.value} value={td.value}>
              {td.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="organization" className="sr-only">
          Organization
        </label>
        <select
          id="organization"
          value={filters.ngbId ?? ""}
          onChange={(e) =>
            onFilterChange({ ngbId: e.target.value || undefined })
          }
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Organizations</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
