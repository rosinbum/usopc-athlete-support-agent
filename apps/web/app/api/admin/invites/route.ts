import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth.js";
import { createInviteEntity } from "@usopc/shared";
import { z } from "zod";

const createInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  invitedBy: z.string().optional(),
});

const deleteInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const inviteEntity = createInviteEntity();
    const invites = await inviteEntity.getAll();
    return NextResponse.json({ invites });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch invites",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { email, invitedBy } = parsed.data;

  try {
    const inviteEntity = createInviteEntity();
    const invite = await inviteEntity.create({
      email: email.toLowerCase().trim(),
      invitedBy: invitedBy ?? session.user?.email ?? undefined,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create invite",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json(
      {
        error: "Failed to delete invite",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
