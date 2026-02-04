import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { topicDomainSchema, authorityLevelSchema } from "@usopc/shared";
import { getPool } from "../db/client.js";
import { listUniqueDocuments, getSourcesStats } from "../db/sources.js";

export const sourcesRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          documentType: z.string().optional(),
          topicDomain: topicDomainSchema.optional(),
          ngbId: z.string().optional(),
          authorityLevel: authorityLevelSchema.optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const pool = getPool();
      const params = input ?? { page: 1, limit: 20 };
      return listUniqueDocuments(pool, params);
    }),

  getStats: publicProcedure.query(async () => {
    const pool = getPool();
    return getSourcesStats(pool);
  }),
});
