import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

// Context type
export interface Context {
  requestId: string;
  apiKey?: string;
}

// Create context from request
export function createContext(opts?: { req?: Request }): Context {
  const requestId = crypto.randomUUID();
  const apiKey = opts?.req?.headers.get("x-api-key") ?? undefined;
  return { requestId, apiKey };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// Rate limiting middleware (simple in-memory for now)
// Track requests per API key per minute window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const rateLimited = middleware(async ({ ctx, next }) => {
  const key = ctx.apiKey ?? "anonymous";
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 60;

  const entry = rateLimitMap.get(key);
  if (entry && entry.resetAt > now) {
    if (entry.count >= maxRequests) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Maximum 60 requests per minute.",
      });
    }
    entry.count++;
  } else {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
  }

  return next();
});

export const protectedProcedure = publicProcedure.use(rateLimited);
