import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";

export const chatRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(4000),
        conversationId: z.string().uuid().optional(),
        userSport: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // TODO: Wire to agent graph in production
      return {
        conversationId: input.conversationId ?? crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content:
            "I'm the USOPC Athlete Support Assistant. I can help you with questions about team selection, dispute resolution, SafeSport, anti-doping, eligibility, governance, and athlete rights. What would you like to know?",
          citations: [] as Array<{ title: string; url?: string; documentType: string }>,
          disclaimer:
            "This information is for educational purposes only and does not constitute legal advice.",
        },
      };
    }),

  stream: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(4000),
        conversationId: z.string().uuid().optional(),
        userSport: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return {
        conversationId: input.conversationId ?? crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: "Streaming response placeholder",
          citations: [] as Array<{ title: string; url?: string; documentType: string }>,
          disclaimer:
            "This information is for educational purposes only and does not constitute legal advice.",
        },
      };
    }),
});
