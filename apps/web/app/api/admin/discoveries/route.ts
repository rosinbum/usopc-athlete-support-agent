import { NextResponse, type NextRequest } from "next/server";
import type { DiscoveryStatus } from "@usopc/shared";
import { requireAdmin } from "../../../../lib/admin-api.js";
import { createDiscoveredSourceEntity } from "../../../../lib/discovered-source.js";

const VALID_STATUSES = new Set<DiscoveryStatus>([
  "pending_metadata",
  "pending_content",
  "approved",
  "rejected",
]);

// ---------------------------------------------------------------------------
// GET — list discovered sources with optional status filter
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const status = request.nextUrl.searchParams.get("status");

    if (status && !VALID_STATUSES.has(status as DiscoveryStatus)) {
      return NextResponse.json(
        { error: "Invalid status filter" },
        { status: 400 },
      );
    }

    const entity = createDiscoveredSourceEntity();
    const discoveries = status
      ? await entity.getByStatus(status as DiscoveryStatus)
      : await entity.getAll();

    return NextResponse.json({ discoveries });
  } catch (error) {
    console.error("Admin discoveries list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch discoveries" },
      { status: 500 },
    );
  }
}
