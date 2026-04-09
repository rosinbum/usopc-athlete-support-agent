import type { Route } from "./+types/api.access-request.js";
import { z } from "zod";
import { createAccessRequestEntity } from "@usopc/shared";
import { isRateLimited } from "../../lib/rate-limit.js";
import { sendAccessRequestNotification } from "../../lib/send-access-request-notification.js";

const AccessRequestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  sport: z.string().max(200).optional(),
  role: z.enum(["Athlete", "Coach", "Administrator", "Other"]).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AccessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, email, sport, role } = parsed.data;
  const entity = createAccessRequestEntity();

  // Dedup check
  const existing = await entity.get(email.toLowerCase().trim());
  if (existing) {
    return Response.json({ status: "already_requested" });
  }

  const created = await entity.create({ name, email, sport, role });

  // Fire-and-forget notification to admins
  sendAccessRequestNotification(created).catch(() => {});

  return Response.json({ status: "created" }, { status: 201 });
}
