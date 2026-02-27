import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getResource, logger } from "@usopc/shared";
import { z } from "zod";
import { isRateLimited } from "../../../lib/rate-limit.js";
import { auth } from "../../../auth.js";

const log = logger.child({ service: "chat-route" });

/** Extract concatenated text from UIMessage parts. */
function getTextFromParts(
  parts: Array<{ type: string; [key: string]: unknown }>,
): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

const ChatRequestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            parts: z.array(z.object({ type: z.string() }).passthrough()).min(1),
          })
          .passthrough(),
      )
      .min(1, "At least one message is required")
      .max(50, "Too many messages")
      .refine(
        (msgs) => msgs.every((m) => getTextFromParts(m.parts).length <= 10_000),
        { message: "Message too long" },
      ),
    userSport: z.string().optional(),
    conversationId: z.string().uuid().optional(),
  })
  .passthrough();

const discoveryFeedQueueUrl = getResource("DiscoveryFeedQueue").url;

export async function POST(req: Request) {
  // Defense-in-depth: verify auth at the route level (middleware also checks)
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      detectInjection,
      INJECTION_RESPONSE,
    } = await import("@usopc/core");

    // SEC-18: Check for prompt injection patterns in the latest user message
    const lastUserMessage = messages.findLast((m) => m.role === "user");
    if (
      lastUserMessage &&
      detectInjection(getTextFromParts(lastUserMessage.parts))
    ) {
      return Response.json({ error: INJECTION_RESPONSE }, { status: 400 });
    }

    const runner = await getAppRunner();
    log.info("Runner initialized", {
      tracingEnabled: process.env.LANGCHAIN_TRACING_V2,
    });

    // Load existing conversation summary (scoped by user to prevent cross-user access)
    const userEmail = session.user.email;
    let conversationSummary: string | undefined;
    if (conversationId) {
      const summaryKey = `${userEmail}:${conversationId}`;
      conversationSummary = (await loadSummary(summaryKey)) as
        | string
        | undefined;
    }

    // Convert UIMessage parts format to {role, content} for LangChain
    const plainMessages = messages.map((m) => ({
      role: m.role,
      content: getTextFromParts(m.parts),
    }));
    const langchainMessages = AgentRunner.convertMessages(plainMessages);
    const stateStream = runner.stream({
      messages: langchainMessages,
      userSport,
      conversationId,
      conversationSummary,
      userId: userEmail,
    });

    const events = agentStreamToEvents(stateStream);

    const textId = crypto.randomUUID();
    let textStarted = false;

    const stream = createUIMessageStream({
      async execute({ writer }) {
        let discoveredUrls: {
          url: string;
          title: string;
          content: string;
          score: number;
        }[] = [];

        for await (const event of events) {
          if (event.type === "text-delta" && event.textDelta) {
            if (!textStarted) {
              writer.write({ type: "text-start", id: textId });
              textStarted = true;
            }
            writer.write({
              type: "text-delta",
              delta: event.textDelta,
              id: textId,
            });
          } else if (event.type === "error" && event.error) {
            log.error("Agent stream error", { error: String(event.error) });
            writer.write({ type: "error", errorText: event.error.message });
          } else if (event.type === "citations" && event.citations) {
            writer.write({
              type: "data-citations",
              data: { type: "citations", citations: event.citations },
            } as never);
          } else if (event.type === "status" && event.status) {
            writer.write({
              type: "data-status",
              data: { type: "status", status: event.status },
            } as never);
          } else if (event.type === "disclaimer" && event.disclaimer) {
            if (!textStarted) {
              writer.write({ type: "text-start", id: textId });
              textStarted = true;
            }
            writer.write({
              type: "text-delta",
              delta: "\n\n---\n\n" + event.disclaimer,
              id: textId,
            });
          } else if (event.type === "discovered-urls" && event.discoveredUrls) {
            // Captured server-side only for fire-and-forget persistence.
            // Not forwarded to the client — no UX signal for discovery.
            discoveredUrls = event.discoveredUrls;
          }
        }

        if (textStarted) {
          writer.write({ type: "text-end", id: textId });
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

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    log.error("Chat request failed", { error: String(error) });
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
