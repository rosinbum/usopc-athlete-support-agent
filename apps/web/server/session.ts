import { getSession as authGetSession } from "@auth/express";
import { authConfig } from "./auth.js";

export interface AppSession {
  user?: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
    role?: string;
  };
}

/**
 * Get the current session from a Web Request object (used in React Router loaders/actions).
 * Converts the Web Request to the format expected by Auth.js.
 */
export async function getSession(request: Request): Promise<AppSession | null> {
  // @auth/express getSession expects an Express-like request.
  // We create a minimal adapter from the Web Request.
  const url = new URL(request.url);
  const expressLikeReq = {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: url.pathname + url.search,
    query: Object.fromEntries(url.searchParams.entries()),
    body: undefined,
  };

  const session = await authGetSession(expressLikeReq as never, authConfig);
  return session as AppSession | null;
}

/**
 * Require authentication in a loader/action. Throws a redirect Response if not authenticated.
 */
export function requireAuth(
  session: AppSession | null,
): asserts session is AppSession & { user: NonNullable<AppSession["user"]> } {
  if (!session?.user?.email) {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/auth/login" },
    });
  }
}

/**
 * Require admin role in a loader/action. Throws a redirect Response if not admin.
 */
export function requireAdmin(
  session: AppSession | null,
): asserts session is AppSession & {
  user: NonNullable<AppSession["user"]> & { role: "admin" };
} {
  requireAuth(session);
  if (session.user.role !== "admin") {
    throw new Response(null, {
      status: 302,
      headers: { Location: "/auth/login" },
    });
  }
}
