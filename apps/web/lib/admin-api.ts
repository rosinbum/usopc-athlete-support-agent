import { NextResponse } from "next/server";
import { auth } from "../auth.js";

/**
 * Guard that checks admin authentication for API routes.
 * Returns null if authenticated, or a 401 NextResponse if not.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
