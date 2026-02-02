import { router } from "./trpc.js";
import { chatRouter } from "./routers/chat.js";
import { conversationsRouter } from "./routers/conversations.js";
import { ngbsRouter } from "./routers/ngbs.js";
import { feedbackRouter } from "./routers/feedback.js";
import { healthRouter } from "./routers/health.js";

export const appRouter = router({
  chat: chatRouter,
  conversations: conversationsRouter,
  ngbs: ngbsRouter,
  feedback: feedbackRouter,
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
