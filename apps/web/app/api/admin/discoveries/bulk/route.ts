import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../../auth.js";
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const bulkSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    ids: z.array(z.string().min(1)).min(1, "At least one ID is required"),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.action !== "reject" || !!data.reason, {
    message: "Reason is required when rejecting",
    path: ["reason"],
  });

// ---------------------------------------------------------------------------
// POST — bulk approve/reject discoveries
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await request.json();
    const result = bulkSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { action, ids, reason } = result.data;
    const session = await auth();
    const reviewedBy = session?.user?.email ?? "unknown";

    const entity = createDiscoveredSourceEntity();
    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        if (action === "approve") {
          await entity.approve(id, reviewedBy);
        } else {
          await entity.reject(id, reviewedBy, reason!);
        }
        succeeded++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    console.error("Admin bulk discovery action error:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 },
    );
  }
}
