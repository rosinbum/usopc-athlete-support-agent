import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../../auth.js";
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createDiscoveredSourceEntity } from "../../../../../lib/discovered-source.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    reason: z.string().min(1, "Reason is required for rejection").optional(),
  })
  .refine((data) => data.action !== "reject" || !!data.reason, {
    message: "Reason is required when rejecting",
    path: ["reason"],
  });

// ---------------------------------------------------------------------------
// GET — discovery detail
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const entity = createDiscoveredSourceEntity();
    const discovery = await entity.getById(id);

    if (!discovery) {
      return NextResponse.json(
        { error: "Discovery not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ discovery });
  } catch (error) {
    console.error("Admin discovery detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch discovery" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — approve or reject a discovery
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const result = patchSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const entity = createDiscoveredSourceEntity();
    const existing = await entity.getById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Discovery not found" },
        { status: 404 },
      );
    }

    const session = await auth();
    const reviewedBy = session?.user?.email ?? "unknown";

    if (result.data.action === "approve") {
      await entity.approve(id, reviewedBy);
    } else {
      await entity.reject(id, reviewedBy, result.data.reason!);
    }

    const discovery = await entity.getById(id);
    return NextResponse.json({ discovery });
  } catch (error) {
    console.error("Admin discovery update error:", error);
    return NextResponse.json(
      { error: "Failed to update discovery" },
      { status: 500 },
    );
  }
}
