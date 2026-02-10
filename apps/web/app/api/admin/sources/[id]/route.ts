import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../../lib/source-config.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const patchSourceSchema = z
  .object({
    enabled: z.boolean().optional(),
    url: z.string().url("Must be a valid URL").optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No valid fields to update",
  });

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { id } = await params;
    const entity = createSourceConfigEntity();
    const source = await entity.getById(id);

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    return NextResponse.json({ source });
  } catch (error) {
    console.error("Admin source detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch source" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH
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
    const result = patchSourceSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const entity = createSourceConfigEntity();
    const source = await entity.update(id, result.data);
    return NextResponse.json({ source });
  } catch (error) {
    console.error("Admin source update error:", error);
    return NextResponse.json(
      { error: "Failed to update source" },
      { status: 500 },
    );
  }
}
