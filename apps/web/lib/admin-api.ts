import { auth } from "../auth.js";
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

  if (session.user.role !== "admin") {
    return apiError("Forbidden", 403);
  }

  return null;
}
