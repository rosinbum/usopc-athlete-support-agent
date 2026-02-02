import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "@usopc/shared";

/**
 * Deadline types that the calculator supports. Each corresponds to a specific
 * filing or compliance window in USOPC/sport governance.
 */
const DEADLINE_TYPES = [
  "section_9_arbitration",
  "cas_appeal",
  "safesport_report",
  "usada_whereabouts",
  "team_selection_protest",
] as const;

type DeadlineType = (typeof DEADLINE_TYPES)[number];

interface DeadlineDefinition {
  name: string;
  durationDays: number;
  description: string;
  sourceReference: string;
  notes: string[];
}

/**
 * Authoritative deadline rules. These durations come from the relevant USOPC
 * bylaws, Ted Stevens Act, CAS Code, SafeSport Code, and USADA protocols.
 */
const DEADLINE_RULES: Record<DeadlineType, DeadlineDefinition> = {
  section_9_arbitration: {
    name: "Section 9 Arbitration Filing Deadline",
    durationDays: 180,
    description:
      "Deadline to file for arbitration under Section 9 of the Ted Stevens Olympic and Amateur Sports Act. An athlete or member who alleges a violation of their rights by an NGB or the USOPC may file for binding arbitration.",
    sourceReference:
      "Ted Stevens Olympic and Amateur Sports Act, 36 U.S.C. \u00A7220529",
    notes: [
      "The 180-day period runs from the date of the alleged violation or the date the complainant knew or should have known of the violation.",
      "Filing is done through the American Arbitration Association (AAA) or another designated arbitration body.",
      "An athlete should contact the Athlete Ombuds before filing for guidance on the process.",
    ],
  },
  cas_appeal: {
    name: "Court of Arbitration for Sport (CAS) Appeal Deadline",
    durationDays: 21,
    description:
      "Deadline to file an appeal with the Court of Arbitration for Sport (CAS) following a final decision by an NGB, the USOPC, or another sport body.",
    sourceReference: "CAS Code of Sports-related Arbitration, Article R49",
    notes: [
      "The 21-day period runs from the date of receipt of the decision being appealed.",
      "Some sport-specific rules may provide a different appeal window; always check the relevant IF or NGB rules.",
      "CAS appeals are filed with the CAS Court Office in Lausanne, Switzerland, or through the CAS ad hoc divisions.",
      "Athletes may request expedited procedures for time-sensitive matters (e.g. selection for imminent competition).",
    ],
  },
  safesport_report: {
    name: "SafeSport Incident Report Window",
    durationDays: 0,
    description:
      "There is no fixed deadline for reporting SafeSport violations to the U.S. Center for SafeSport. Reports should be made as soon as possible, but the Center accepts reports at any time regardless of when the alleged conduct occurred.",
    sourceReference:
      "SafeSport Code for the U.S. Olympic and Paralympic Movement",
    notes: [
      "There is no statute of limitations on reporting to the U.S. Center for SafeSport.",
      "Mandatory reporters (coaches, officials, staff) must report immediately upon learning of a potential violation.",
      "Reports can be filed online at safesport.org or by phone at (833) 587-7233.",
      "Anonymous reports are accepted.",
      "Even historical allegations should be reported, as they may protect current athletes.",
    ],
  },
  usada_whereabouts: {
    name: "USADA Whereabouts Filing Deadline",
    durationDays: 15,
    description:
      "Athletes in the USADA Registered Testing Pool (RTP) must file quarterly whereabouts information by the 15th of the month preceding the start of the quarter.",
    sourceReference:
      "USADA Protocol for Olympic and Paralympic Movement Testing, WADA International Standard for Testing and Investigations (ISTI)",
    notes: [
      "Q1 (Jan-Mar): due by December 15",
      "Q2 (Apr-Jun): due by March 15",
      "Q3 (Jul-Sep): due by June 15",
      "Q4 (Oct-Dec): due by September 15",
      "A filing failure (missed deadline) counts as one whereabouts failure.",
      "Three whereabouts failures (filing failures or missed tests) within a 12-month period constitute an anti-doping rule violation.",
      "Athletes should update their whereabouts in ADAMS as soon as plans change.",
    ],
  },
  team_selection_protest: {
    name: "Team Selection Protest/Grievance Deadline",
    durationDays: 3,
    description:
      "Deadline to file a protest or grievance regarding team selection decisions. Most NGB selection procedures require protests to be filed within a short window after the announcement of the selection decision.",
    sourceReference:
      "USOPC Team Selection Procedures Requirements; individual NGB selection procedures",
    notes: [
      "The typical window is 3 days (72 hours) from the announcement of the selection decision, but this varies by NGB and event.",
      "Always check the specific NGB's published Selection Procedures for the exact deadline.",
      "Protests are typically filed first with the NGB; if unresolved, athletes may escalate to Section 9 arbitration.",
      "The Athlete Ombuds can help navigate the protest process on a confidential basis.",
    ],
  },
};

const calculateDeadlineSchema = z.object({
  deadlineType: z
    .enum(DEADLINE_TYPES)
    .describe(
      "Type of deadline to calculate. One of: section_9_arbitration, cas_appeal, safesport_report, usada_whereabouts, team_selection_protest.",
    ),
  startDate: z
    .string()
    .optional()
    .describe(
      "The reference start date in ISO 8601 format (YYYY-MM-DD). Defaults to today if not provided.",
    ),
});

/**
 * Add calendar days to a date and return a new Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Format a Date as a human-readable string.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Creates the calculate_deadline tool. This tool requires no external
 * dependencies -- all deadline rules are embedded in the source.
 */
export function createCalculateDeadlineTool() {
  return tool(
    async ({ deadlineType, startDate }): Promise<string> => {
      const log = logger.child({ tool: "calculate_deadline" });
      log.debug("Calculating deadline", { deadlineType, startDate });

      try {
        const rule = DEADLINE_RULES[deadlineType];

        const start = startDate ? new Date(startDate) : new Date();

        // Validate the parsed date
        if (isNaN(start.getTime())) {
          return `Invalid start date: "${startDate}". Please provide a date in ISO format (YYYY-MM-DD).`;
        }

        const lines: string[] = [`Deadline Type: ${rule.name}`];
        lines.push(`Source: ${rule.sourceReference}`);
        lines.push("");
        lines.push(rule.description);
        lines.push("");

        if (rule.durationDays === 0) {
          // Special case: no fixed deadline (e.g. SafeSport)
          lines.push(
            "Deadline: No fixed deadline -- report as soon as possible.",
          );
        } else {
          const deadline = addDays(start, rule.durationDays);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const deadlineMidnight = new Date(deadline);
          deadlineMidnight.setHours(0, 0, 0, 0);

          const remainingMs = deadlineMidnight.getTime() - today.getTime();
          const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

          lines.push(`Start Date: ${formatDate(start)}`);
          lines.push(`Duration: ${rule.durationDays} calendar days`);
          lines.push(`Deadline Date: ${formatDate(deadline)}`);

          if (remainingDays < 0) {
            lines.push(
              `Status: EXPIRED -- the deadline passed ${Math.abs(remainingDays)} day(s) ago.`,
            );
          } else if (remainingDays === 0) {
            lines.push("Status: DEADLINE IS TODAY");
          } else {
            lines.push(`Remaining: ${remainingDays} day(s) from today`);
          }

          if (remainingDays >= 0 && remainingDays <= 7) {
            lines.push("");
            lines.push(
              "WARNING: This deadline is approaching soon. Take action promptly.",
            );
          }
        }

        if (rule.notes.length > 0) {
          lines.push("");
          lines.push("Important Notes:");
          for (const note of rule.notes) {
            lines.push(`  - ${note}`);
          }
        }

        return lines.join("\n");
      } catch (error) {
        log.error("Deadline calculation failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return `Deadline calculation failed: ${error instanceof Error ? error.message : String(error)}.`;
      }
    },
    {
      name: "calculate_deadline",
      description:
        "Calculate important deadlines for athlete disputes, appeals, and compliance filings. Returns the deadline date and remaining days.",
      schema: calculateDeadlineSchema,
    },
  );
}
