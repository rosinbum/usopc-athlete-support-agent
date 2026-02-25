import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-api.js";
import { createInviteEntity, logger } from "@usopc/shared";
import { z } from "zod";

const log = logger.child({ route: "admin/invites" });

const createInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  invitedBy: z.string().optional(),
});

const deleteInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function GET(_req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const inviteEntity = createInviteEntity();
    const invites = await inviteEntity.getAll();
    return NextResponse.json({ invites });
  } catch (error) {
    log.error("Failed to fetch invites", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch invites" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const result = await requireAdmin({ returnSession: true });
  if (result.denied) return result.denied;
  const { session } = result;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const invitedBy = session.user?.name ?? session.user?.email ?? undefined;

  try {
    const inviteEntity = createInviteEntity();
    const invite = await inviteEntity.create({
      email: email.toLowerCase().trim(),
      invitedBy,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    log.error("Failed to create invite", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = deleteInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  try {
    const inviteEntity = createInviteEntity();
    await inviteEntity.delete(email.toLowerCase().trim());
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("Failed to delete invite", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to delete invite" },
      { status: 500 },
    );
  }
}
