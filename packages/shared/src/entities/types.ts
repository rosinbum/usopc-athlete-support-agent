import type { AuthorityLevel } from "../validation.js";

// ---------------------------------------------------------------------------
// SourceConfig
// ---------------------------------------------------------------------------

export interface SourceConfig {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel: AuthorityLevel;
  enabled: boolean;
  lastIngestedAt: string | null;
  lastContentHash: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  storageKey: string | null;
  storageVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSourceInput {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel: AuthorityLevel;
}

export interface MarkSuccessOptions {
  storageKey?: string | undefined;
  storageVersionId?: string | undefined;
}

// ---------------------------------------------------------------------------
// DiscoveredSource
// ---------------------------------------------------------------------------

export type DiscoveryMethod = "map" | "search" | "manual" | "agent";
export type DiscoveryStatus =
  | "pending_metadata"
  | "pending_content"
  | "approved"
  | "rejected";

export interface DiscoveredSource {
  id: string;
  url: string;
  title: string;
  discoveryMethod: DiscoveryMethod;
  discoveredAt: string;
  discoveredFrom: string | null;
  status: DiscoveryStatus;
  metadataConfidence: number | null;
  contentConfidence: number | null;
  combinedConfidence: number | null;
  documentType: string | null;
  topicDomains: string[];
  format: "pdf" | "html" | "text" | null;
  ngbId: string | null;
  priority: "high" | "medium" | "low" | null;
  description: string | null;
  authorityLevel: string | null;
  metadataReasoning: string | null;
  contentReasoning: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  sourceConfigId: string | null;
  lastError: string | null;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscoveredSourceInput {
  id: string;
  url: string;
  title: string;
  discoveryMethod: DiscoveryMethod;
  discoveredFrom?: string;
}

export const REPROCESSABLE_STATUSES: ReadonlySet<DiscoveryStatus> = new Set([
  "pending_metadata",
  "pending_content",
]);

// ---------------------------------------------------------------------------
// AgentModel
// ---------------------------------------------------------------------------

export interface AgentModelConfig {
  id: string;
  role: string;
  model: string;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  provider?: string | undefined;
  dimensions?: number | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

// ---------------------------------------------------------------------------
// IngestionLog
// ---------------------------------------------------------------------------

export interface IngestionLog {
  sourceId: string;
  sourceUrl: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  contentHash?: string | undefined;
  chunksCount?: number | undefined;
  errorMessage?: string | undefined;
  startedAt: string;
  completedAt?: string | undefined;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface PromptConfig {
  name: string;
  content: string;
  domain?: string | undefined;
  version: number;
  updatedAt?: string | undefined;
  createdAt?: string | undefined;
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

export interface Invite {
  email: string;
  invitedBy?: string | undefined;
  createdAt?: string | undefined;
}

export interface CreateInviteInput {
  email: string;
  invitedBy?: string | undefined;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface Feedback {
  id: string;
  conversationId: string;
  channel: "slack" | "web";
  score: number;
  comment?: string | undefined;
  messageId?: string | undefined;
  userId?: string | undefined;
  runId?: string | undefined;
  createdAt?: string | undefined;
}

export interface CreateFeedbackInput {
  conversationId: string;
  channel: "slack" | "web";
  score: number;
  comment?: string | undefined;
  messageId?: string | undefined;
  userId?: string | undefined;
  runId?: string | undefined;
}

// ---------------------------------------------------------------------------
// AccessRequest
// ---------------------------------------------------------------------------

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequest {
  email: string;
  name: string;
  sport?: string | undefined;
  role?: string | undefined;
  status: AccessRequestStatus;
  requestedAt: string;
  reviewedAt?: string | undefined;
  reviewedBy?: string | undefined;
}

export interface CreateAccessRequestInput {
  email: string;
  name: string;
  sport?: string | undefined;
  role?: string | undefined;
}

// ---------------------------------------------------------------------------
// DiscoveryRun
// ---------------------------------------------------------------------------

export interface DiscoveryRun {
  status: "running" | "completed" | "failed";
  triggeredBy: string;
  startedAt: string;
  completedAt?: string | undefined;
  discovered?: number | undefined;
  enqueued?: number | undefined;
  skipped?: number | undefined;
  errors?: number | undefined;
  errorMessage?: string | undefined;
}
