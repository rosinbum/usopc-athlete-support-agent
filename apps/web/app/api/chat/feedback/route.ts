import { NextResponse } from "next/server";
import { createFeedbackEntity, logger } from "@usopc/shared";
import { z } from "zod";
import { auth } from "../../../../auth.js";

const log = logger.child({ service: "feedback-route" });

const feedbackSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().min(1),
  score: z.union([z.literal(0), z.literal(1)]),
  comment: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  // Defense-in-depth: verify auth at the route level (middleware also checks)
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { conversationId, messageId, score, comment } = parsed.data;

  try {
    const feedbackEntity = createFeedbackEntity();
    const feedback = await feedbackEntity.create({
      conversationId,
      channel: "web",
      score,
      messageId,
      comment,
      userId: session.user.email,
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    log.error("Failed to create feedback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to create feedback" },
      { status: 500 },
    );
  }
}
