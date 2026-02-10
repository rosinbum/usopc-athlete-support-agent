import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-api.js";
import { createSourceConfigEntity } from "../../../../lib/source-config.js";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const entity = createSourceConfigEntity();
    const sources = await entity.getAll();
    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Admin sources list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sources" },
      { status: 500 },
    );
  }
}
