import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";

export const feedbackRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        rating: z.enum(["helpful", "not_helpful"]),
        comment: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return {
        id: crypto.randomUUID(),
        ...input,
        createdAt: new Date(),
      };
    }),
});
