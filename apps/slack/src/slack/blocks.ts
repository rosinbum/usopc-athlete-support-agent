import type { Citation, EscalationInfo } from "@usopc/core";

interface KnownBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: unknown[];
  block_id?: string;
  [key: string]: unknown;
}

export function buildAnswerBlocks(
  answer: string,
  citations: Citation[],
  disclaimer: string,
  escalation?: EscalationInfo,
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Main answer
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: answer },
  });

  // Escalation alert
  if (escalation) {
    blocks.push({ type: "divider" });
    blocks.push(...buildEscalationBlocks(escalation));
  }

  // Citations
  if (citations.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Sources:*" },
    });
    for (const citation of citations.slice(0, 5)) {
      blocks.push(buildCitationBlock(citation));
    }
  }

  // Disclaimer
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `⚠️ ${disclaimer}` }],
  });

  // Feedback buttons
  blocks.push(buildFeedbackBlock());

  return blocks;
}

function buildEscalationBlocks(escalation: EscalationInfo): KnownBlock[] {
  const contactParts: string[] = [];
  if (escalation.contactPhone) {
    contactParts.push(`📞 ${escalation.contactPhone}`);
  }
  if (escalation.contactEmail) {
    contactParts.push(`✉️ ${escalation.contactEmail}`);
  }
  if (escalation.contactUrl) {
    contactParts.push(`🔗 <${escalation.contactUrl}|Website>`);
  }

  const urgencyEmoji = escalation.urgency === "immediate" ? "🚨" : "ℹ️";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${urgencyEmoji} *Referral: ${escalation.organization}*\n` +
          `${escalation.reason}\n\n` +
          contactParts.join("  |  "),
      },
    },
  ];
}

function buildCitationBlock(citation: Citation): KnownBlock {
  const titleText = citation.url
    ? `<${citation.url}|${citation.title}>`
    : citation.title;

  const parts = [titleText];
  if (citation.section) {
    parts.push(`_${citation.section}_`);
  }
  parts.push(`\`${citation.documentType}\``);

  return {
    type: "context",
    elements: [{ type: "mrkdwn", text: parts.join("  •  ") }],
  };
}

function buildFeedbackBlock(): KnownBlock {
  return {
    type: "actions",
    block_id: "feedback_actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "👍 Helpful", emoji: true },
        action_id: "feedback_helpful",
        value: "helpful",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "👎 Not Helpful", emoji: true },
        action_id: "feedback_not_helpful",
        value: "not_helpful",
      },
    ],
  };
}

export function buildErrorBlocks(message: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `❌ ${message}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "If this issue persists, please try again later or contact support.",
        },
      ],
    },
  ];
}

export function buildThinkingBlock(): KnownBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "⏳ Looking into that for you...",
    },
  };
}
