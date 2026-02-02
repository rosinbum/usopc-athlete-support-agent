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
 * The seven core topic domains the USOPC agent supports.
 */
export const TOPIC_DOMAINS = [
  "team_selection",
  "dispute_resolution",
  "safesport",
  "anti_doping",
  "eligibility",
  "governance",
  "athlete_rights",
] as const;

export const topicDomainSchema = z.enum(TOPIC_DOMAINS);

export type TopicDomain = z.infer<typeof topicDomainSchema>;

/**
 * Supported interaction channels.
 */
export const CHANNELS = ["web", "api", "slack"] as const;

export const channelSchema = z.enum(CHANNELS);

export type Channel = z.infer<typeof channelSchema>;
