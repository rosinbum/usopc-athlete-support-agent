/**
 * Canonical NGB IDs — matches the `id` field in data/sport-organizations.json.
 *
 * Inlined (not imported from JSON) to avoid path-resolution issues across
 * Lambda, Next.js, and test contexts.
 */
export const NGB_IDS = [
  // us- prefix
  "us-equestrian",
  "us-fencing",
  "us-field-hockey",
  "us-figure-skating",
  "us-rowing",
  "us-rugby",
  "us-sailing",
  "us-shooting",
  "us-ski-snowboard",
  "us-soccer",
  "us-speedskating",
  "us-squash",
  // usa- prefix
  "usa-archery",
  "usa-badminton",
  "usa-basketball",
  "usa-biathlon",
  "usa-bobsled-skeleton",
  "usa-boxing",
  "usa-canoe-kayak",
  "usa-climbing",
  "usa-cricket",
  "usa-curling",
  "usa-cycling",
  "usa-diving",
  "usa-flag-football",
  "usa-golf",
  "usa-gymnastics",
  "usa-hockey",
  "usa-judo",
  "usa-karate",
  "usa-lacrosse",
  "usa-luge",
  "usa-modern-pentathlon",
  "usa-softball",
  "usa-surfing",
  "usa-swimming",
  "usa-table-tennis",
  "usa-taekwondo",
  "usa-team-handball",
  "usa-tennis",
  "usa-track-field",
  "usa-triathlon",
  "usa-volleyball",
  "usa-water-polo",
  "usa-weightlifting",
  "usa-wrestling",
  // usopc- prefix
  "usopc-breaking",
  "usopc-skateboarding",
] as const;

export type NgbId = (typeof NGB_IDS)[number];
export const NGB_ID_SET: ReadonlySet<string> = new Set(NGB_IDS);
