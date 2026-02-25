import {
  createDataStreamResponse,
  formatDataStreamPart,
  type JSONValue,
} from "ai";
import { getResource, logger } from "@usopc/shared";
import { z } from "zod";
import { isRateLimited } from "../../../lib/rate-limit.js";

const log = logger.child({ service: "chat-route" });

const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10_000, "Message too long"),
      }),
    )
    .min(1, "At least one message is required")
    .max(50, "Too many messages"),
  userSport: z.string().optional(),
  conversationId: z.string().uuid().optional(),
});

const discoveryFeedQueueUrl = getResource("DiscoveryFeedQueue").url;

export async function POST(req: Request) {
  // Rate limit by client IP (per Lambda instance — add AWS WAF for cross-instance limiting)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    log.info("POST /api/chat called");
    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    const { messages, userSport, conversationId } = parsed.data;

    // Dynamic import to ensure env vars are set first
    const {
      getAppRunner,
      AgentRunner,
      agentStreamToEvents,
      loadSummary,
      publishDiscoveredUrls,
    } = await import("@usopc/core");

    const runner = await getAppRunner();
    log.info("Runner initialized", {
      tracingEnabled: process.env.LANGCHAIN_TRACING_V2,
    });

    // Load existing conversation summary
    let conversationSummary: string | undefined;
    if (conversationId) {
      conversationSummary = await loadSummary(conversationId);
    }

    const langchainMessages = AgentRunner.convertMessages(messages);
    const stateStream = runner.stream({
      messages: langchainMessages,
      userSport,
      conversationId,
      conversationSummary,
    });

    const events = agentStreamToEvents(stateStream);

    return createDataStreamResponse({
      async execute(writer) {
        let discoveredUrls: {
          url: string;
          title: string;
          content: string;
          score: number;
        }[] = [];

        for await (const event of events) {
          if (event.type === "answer-reset") {
            writer.write(
              formatDataStreamPart("data", [{ type: "answer-reset" }]),
            );
          } else if (event.type === "text-delta" && event.textDelta) {
            writer.write(formatDataStreamPart("text", event.textDelta));
          } else if (event.type === "error" && event.error) {
            log.error("Agent stream error", { error: String(event.error) });
            writer.write(formatDataStreamPart("error", event.error.message));
          } else if (event.type === "citations" && event.citations) {
            writer.write(
              formatDataStreamPart("message_annotations", [
                { type: "citations", citations: event.citations },
              ] as unknown as JSONValue[]),
            );
          } else if (event.type === "status" && event.status) {
            writer.write(
              formatDataStreamPart("data", [
                { type: "status", status: event.status },
              ]),
            );
          } else if (event.type === "disclaimer" && event.disclaimer) {
            writer.write(
              formatDataStreamPart("text", "\n\n---\n\n" + event.disclaimer),
            );
          } else if (event.type === "discovered-urls" && event.discoveredUrls) {
            // Captured server-side only for fire-and-forget persistence.
            // Not forwarded to the client — no UX signal for discovery.
            discoveredUrls = event.discoveredUrls;
          }
        }

        // Summary save is now automatic inside runner.stream()

        // Fire-and-forget: publish discovered URLs to SQS for async evaluation
        if (discoveredUrls.length > 0) {
          publishDiscoveredUrls(discoveredUrls, discoveryFeedQueueUrl).catch(
            (err: unknown) =>
              log.error("Failed to publish discovered URLs", {
                error: String(err),
              }),
          );
        }
      },
      onError: (error) => {
        log.error("Chat stream error", { error: String(error) });
        return error instanceof Error ? error.message : "An error occurred";
      },
    });
  } catch (error) {
    log.error("Chat request failed", { error: String(error) });
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
