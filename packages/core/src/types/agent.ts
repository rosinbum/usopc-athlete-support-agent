import { BaseMessage } from "@langchain/core/messages";
import type { AuthorityLevel } from "@usopc/shared";

export type TopicDomain =
  | "team_selection"
  | "dispute_resolution"
  | "safesport"
  | "anti_doping"
  | "eligibility"
  | "governance"
  | "athlete_rights";

export type QueryIntent =
  | "factual"
  | "procedural"
  | "deadline"
  | "escalation"
  | "general";

export type EmotionalState = "neutral" | "distressed" | "panicked" | "fearful";

export interface Citation {
  title: string;
  url?: string;
  documentType: string;
  section?: string;
  effectiveDate?: string;
  snippet: string;
  authorityLevel?: AuthorityLevel;
  s3Key?: string;
}

export interface EscalationInfo {
  target: string;
  organization: string;
  contactEmail?: string;
  contactPhone?: string;
  contactUrl?: string;
  reason: string;
  urgency: "immediate" | "standard";
}

export interface RetrievedDocument {
  content: string;
  metadata: DocumentMetadata;
  score: number;
}

export interface DocumentMetadata {
  ngbId?: string;
  topicDomain?: TopicDomain;
  documentType?: string;
  sourceUrl?: string;
  documentTitle?: string;
  sectionTitle?: string;
  effectiveDate?: string;
  ingestedAt?: string;
  authorityLevel?: AuthorityLevel;
  s3Key?: string;
}

export type QualityIssueType =
  | "generic_response"
  | "hallucination_signal"
  | "incomplete"
  | "missing_specificity";

export interface QualityIssue {
  type: QualityIssueType;
  description: string;
  severity: "critical" | "major" | "minor";
}

export interface QualityCheckResult {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
  critique: string;
}

export interface SubQuery {
  query: string;
  domain: TopicDomain;
  intent: QueryIntent;
  ngbIds: string[];
}

export interface AgentState {
  messages: BaseMessage[];
  topicDomain?: TopicDomain;
  detectedNgbIds: string[];
  queryIntent?: QueryIntent;
  retrievedDocuments: RetrievedDocument[];
  webSearchResults: string[];
  retrievalConfidence: number;
  citations: Citation[];
  answer?: string;
  escalation?: EscalationInfo;
  disclaimerRequired: boolean;
  hasTimeConstraint: boolean;
  conversationId?: string;
  userSport?: string;
  emotionalState: EmotionalState;
  escalationReason?: string;
  retrievalStatus: "success" | "error";
}
