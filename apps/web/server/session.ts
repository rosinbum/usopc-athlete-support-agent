import { Auth } from "@auth/core";
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
 * Auth is disabled by default for local dev. Set REQUIRE_AUTH=true in
 * production (e.g. Cloud Run env vars) to enforce authentication.
 * Admin routes always require auth regardless of this setting.
 */
const AUTH_DISABLED = process.env.REQUIRE_AUTH !== "true";

const ANONYMOUS_SESSION: AppSession = {
  user: { email: "anonymous@local", name: "Anonymous", role: "athlete" },
};

/**
 * Get the current session from a Web Request object (used in React Router loaders/actions).
 * Calls @auth/core directly to read the JWT from cookies.
 */
export async function getSession(request: Request): Promise<AppSession | null> {
  if (AUTH_DISABLED) return ANONYMOUS_SESSION;

  const url = new URL(request.url);
  const sessionUrl = `${url.protocol}//${url.host}/api/auth/session`;

  const webRequest = new Request(sessionUrl, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const response = await Auth(webRequest, authConfig);
  if (response.status !== 200) return null;

  const data = await response.json();
  if (!data || !Object.keys(data).length) return null;
  return data as AppSession;
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
    // Redirect to home, not login — the user IS authenticated, just not admin.
    // Redirecting to /auth/login would cause a loop since the login page
    // redirects authenticated users back to /admin.
    throw new Response(null, {
      status: 302,
      headers: { Location: "/" },
    });
  }
}
