import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getOptionalSecretValue } from "@usopc/shared";

// Context type
export interface Context {
  requestId: string;
  apiKey?: string | undefined;
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

/**
 * Authentication middleware — validates the x-api-key header against the
 * TrpcApiKey SST secret. When no key is configured (empty default), auth is
 * skipped so local dev works without extra setup.
 *
 * Infrastructure-level rate limiting is handled by API Gateway V2 throttling
 * (see sst.config.ts). This replaces the prior in-memory Map which was
 * ineffective across Lambda instances and reset on cold starts.
 */
export const authenticated = middleware(async ({ ctx, next }) => {
  const configuredKey = getOptionalSecretValue(
    "TRPC_API_KEY",
    "TrpcApiKey",
    "",
  );

  // If no API key is configured (e.g. local dev), skip auth
  if (configuredKey === "") {
    return next();
  }

  if (!ctx.apiKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing x-api-key header.",
    });
  }

  if (ctx.apiKey !== configuredKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid API key.",
    });
  }

  return next();
});

export const protectedProcedure = publicProcedure.use(authenticated);
