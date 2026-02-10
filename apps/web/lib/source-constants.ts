/**
 * Constants for source form UI (client-safe).
 *
 * These mirror the canonical values in @usopc/shared/validation but are
 * duplicated here so client components can import them without pulling in
 * the full barrel export (which includes pg / node-only modules).
 *
 * The API route validates against the shared Zod schemas, so any drift
 * between these arrays and the shared ones will surface as a 400 at submit time.
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

export const AUTHORITY_LEVELS = [
  "law",
  "international_rule",
  "usopc_governance",
  "usopc_policy_procedure",
  "independent_office",
  "anti_doping_national",
  "ngb_policy_procedure",
  "games_event_specific",
  "educational_guidance",
] as const;

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
