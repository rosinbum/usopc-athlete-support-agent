import { z } from "zod";

/**
 * Pagination query parameters with sensible defaults.
 *
 * - `page` defaults to 1 (minimum 1)
 * - `limit` defaults to 20 (minimum 1, maximum 100)
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Standard UUID v4 string validation.
 */
export const uuidSchema = z.string().uuid();

export type Uuid = z.infer<typeof uuidSchema>;

/**
 * Sport / NGB organization identifier.
 * Trimmed and lowercased for consistent storage and lookup.
 */
export const sportOrgIdSchema = z.string().trim().toLowerCase().min(1);

export type SportOrgId = z.infer<typeof sportOrgIdSchema>;

/**
 * The core topic domains the USOPC agent supports.
 */
export const TOPIC_DOMAINS = [
  "team_selection",
  "dispute_resolution",
  "safesport",
  "anti_doping",
  "eligibility",
  "governance",
  "athlete_rights",
  "athlete_safety",
  "financial_assistance",
] as const;

export const topicDomainSchema = z.enum(TOPIC_DOMAINS);

export type TopicDomain = z.infer<typeof topicDomainSchema>;

/**
 * Supported interaction channels.
 */
export const CHANNELS = ["web", "api", "slack"] as const;

export const channelSchema = z.enum(CHANNELS);

export type Channel = z.infer<typeof channelSchema>;

/**
 * Authority levels for documents, ordered from highest to lowest authority.
 * Used to weight documents during RAG retrieval.
 */
export const AUTHORITY_LEVELS = [
  "law", // Federal/state legislation
  "international_rule", // IOC, IPC, IF rules
  "usopc_governance", // USOPC bylaws, board resolutions
  "usopc_policy_procedure", // USOPC policies and procedures
  "independent_office", // SafeSport, Athlete Ombuds
  "anti_doping_national", // USADA rules
  "ngb_policy_procedure", // NGB-specific policies
  "games_event_specific", // Olympic/Paralympic specific rules
  "educational_guidance", // FAQs, guides, explainers
] as const;

export const authorityLevelSchema = z.enum(AUTHORITY_LEVELS);

export type AuthorityLevel = z.infer<typeof authorityLevelSchema>;

/**
 * Known document types for source configurations.
 */
export const DOCUMENT_TYPES = [
  "bylaws",
  "code",
  "legislation",
  "policy",
  "procedure",
  "protocol",
  "rulebook",
  "selection_procedures",
] as const;

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export type DocumentType = z.infer<typeof documentTypeSchema>;
