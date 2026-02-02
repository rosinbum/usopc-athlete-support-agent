import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";

export const conversationsRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return {
        id: input.id,
        messages: [] as Array<{
          id: string;
          role: string;
          content: string;
          createdAt: Date;
        }>,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async () => {
      return {
        conversations: [] as Array<{
          id: string;
          createdAt: Date;
          updatedAt: Date;
        }>,
        nextCursor: undefined as string | undefined,
      };
    }),
});
