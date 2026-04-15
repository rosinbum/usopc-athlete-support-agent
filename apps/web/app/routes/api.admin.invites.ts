import type { Route } from "./+types/api.admin.invites.js";
import { getSession } from "../../server/session.js";
import { sendInviteEmail } from "../../lib/send-invite-email.js";
import { createInviteEntity, logger } from "@usopc/shared";
import { z } from "zod";

const log = logger.child({ route: "admin/invites" });

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(request: Request) {
  const session = await getSession(request);
  if (!session?.user?.email)
    return {
      denied: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  if (session.user.role !== "admin")
    return { denied: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  invitedBy: z.string().optional(),
});

const deleteInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resendInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ---------------------------------------------------------------------------
// GET — list invites
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  const result = await requireAdmin(request);
  if ("denied" in result) return result.denied;

  try {
    const inviteEntity = createInviteEntity();
    const invites = await inviteEntity.getAll();
    return Response.json({ invites });
  } catch (error) {
    log.error("Failed to fetch invites", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Failed to fetch invites" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST / DELETE / PATCH — differentiated by request.method in action
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const result = await requireAdmin(request);
  if ("denied" in result) return result.denied;
  const { session } = result;

  if (request.method === "POST") {
    return handlePost(request, session);
  }

  if (request.method === "DELETE") {
    return handleDelete(request);
  }

  if (request.method === "PATCH") {
    return handlePatch(request, session);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

async function handlePost(
  request: Request,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const invitedBy = session.user?.name ?? session.user?.email ?? undefined;

  try {
    const inviteEntity = createInviteEntity();
    const normalizedEmail = email.toLowerCase().trim();
    const invite = await inviteEntity.create({
      email: normalizedEmail,
      invitedBy,
    });
    const emailSent = await sendInviteEmail(normalizedEmail, invitedBy);
    if (!emailSent) {
      log.warn("Invite created but email notification failed", {
        email: normalizedEmail,
      });
    }
    return Response.json({ invite, emailSent }, { status: 201 });
  } catch (error) {
    log.error("Failed to create invite", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Failed to create invite" }, { status: 500 });
  }
}

async function handleDelete(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = deleteInviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  try {
    const inviteEntity = createInviteEntity();
    await inviteEntity.delete(email.toLowerCase().trim());
    return Response.json({ success: true });
  } catch (error) {
    log.error("Failed to delete invite", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Failed to delete invite" }, { status: 500 });
  }
}

async function handlePatch(
  request: Request,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resendInviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const invitedBy = session.user?.name ?? session.user?.email ?? undefined;
  const emailSent = await sendInviteEmail(parsed.data.email, invitedBy);
  return Response.json({ emailSent });
}
