import { router, publicProcedure } from "../trpc.js";

export const healthRouter = router({
  check: publicProcedure.query(async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.0.1",
    };
  }),
});
