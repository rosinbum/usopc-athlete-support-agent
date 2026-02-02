import { WebClient } from "@slack/web-api";
import { getRequiredEnv } from "@usopc/shared";

let client: WebClient | undefined;

export function getSlackClient(): WebClient {
  if (!client) {
    client = new WebClient(getRequiredEnv("SLACK_BOT_TOKEN"));
  }
  return client;
}

export async function postMessage(
  channel: string,
  text: string,
  blocks?: unknown[],
  threadTs?: string,
): Promise<void> {
  const slack = getSlackClient();
  await slack.chat.postMessage({
    channel,
    text,
    blocks: blocks as never[],
    thread_ts: threadTs,
  });
}

export async function addReaction(
  channel: string,
  timestamp: string,
  name: string,
): Promise<void> {
  const slack = getSlackClient();
  try {
    await slack.reactions.add({ channel, timestamp, name });
  } catch {
    // Reaction may already exist; safe to ignore
  }
}
