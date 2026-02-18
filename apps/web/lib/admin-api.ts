import { NextResponse } from "next/server";
import { auth } from "../auth.js";
import { getAdminEmails } from "./auth-env.js";

/**
 * Guard that checks admin authentication for API routes.
 * Returns null if authenticated and authorized, or a 401/403 NextResponse if not.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
