import type { Route } from "./+types/api.documents.$key.url.js";
import { getResource, createStorageService, logger } from "@usopc/shared";
import { getSession } from "../../server/session.js";
import { apiError } from "../../lib/apiResponse.js";

const log = logger.child({ service: "documents-url" });

let _storage: ReturnType<typeof createStorageService> | undefined;

/**
 * GET /api/documents/:key/url
 *
 * Returns a presigned URL for viewing an archived document.
 * The key is URL-encoded in the path parameter.
 * Requires any authenticated session (athletes and admins).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (!session?.user?.email) {
    return apiError("Unauthorized", 401);
  }

  try {
    const objectKey = decodeURIComponent(params.key);

    // Validate key format: must start with "sources/" and contain no traversal
    if (!objectKey.startsWith("sources/") || objectKey.includes("..")) {
      return Response.json({ error: "Invalid document key" }, { status: 400 });
    }

    const storage = (_storage ??= createStorageService(getResource("DocumentsBucket").name));
    const url = await storage.getSignedUrl(objectKey, 300);

    return Response.json({ url });
  } catch (error) {
    log.error("Presigned URL error", { error: String(error) });
    return Response.json(
      { error: "Failed to generate document URL" },
      { status: 500 },
    );
  }
}
