import { auth } from "../auth.js";
import { getAdminEmails } from "./auth-env.js";
import { apiError } from "./apiResponse.js";

/**
 * Guard that checks admin authentication for API routes.
 * Returns null if authenticated and authorized, or a 401/403 NextResponse if not.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError("Unauthorized", 401);
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(session.user.email.toLowerCase())) {
    return apiError("Forbidden", 403);
  }

  return null;
}
