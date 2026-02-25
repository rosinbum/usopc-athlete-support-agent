import type { Session } from "next-auth";
import { auth } from "../auth.js";
import { apiError } from "./apiResponse.js";

/**
 * Guard that checks admin authentication for API routes.
 * Returns null if authenticated and authorized, or a 401/403 NextResponse if not.
 */
export async function requireAdmin(): Promise<
  ReturnType<typeof apiError> | null
>;
/**
 * Guard that checks admin authentication and returns the session.
 * Returns { session } if authorized, or { denied } with a 401/403 NextResponse.
 */
export async function requireAdmin(options: {
  returnSession: true;
}): Promise<
  | { session: Session; denied?: never }
  | { denied: ReturnType<typeof apiError>; session?: never }
>;
export async function requireAdmin(
  options?: { returnSession: boolean } | undefined,
) {
  const session = await auth();
  if (!session?.user?.email) {
    return options?.returnSession
      ? { denied: apiError("Unauthorized", 401) }
      : apiError("Unauthorized", 401);
  }

  if (session.user.role !== "admin") {
    return options?.returnSession
      ? { denied: apiError("Forbidden", 403) }
      : apiError("Forbidden", 403);
  }

  return options?.returnSession ? { session } : null;
}
