import type { Route } from "./+types/api.documents.$key.url.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getResource, logger } from "@usopc/shared";
import { getSession } from "../../server/session.js";
import { apiError } from "../../lib/apiResponse.js";

const log = logger.child({ service: "documents-url" });

/**
 * GET /api/documents/:key/url
 *
 * Returns a presigned S3 URL for viewing an archived document.
 * The key is URL-encoded in the path parameter.
 * Requires any authenticated session (athletes and admins).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (!session?.user?.email) {
    return apiError("Unauthorized", 401);
  }

  try {
    const s3Key = decodeURIComponent(params.key);

    // Validate key format: must start with "sources/" and contain no traversal
    if (!s3Key.startsWith("sources/") || s3Key.includes("..")) {
      return Response.json({ error: "Invalid document key" }, { status: 400 });
    }

    const s3 = new S3Client({});
    const command = new GetObjectCommand({
      Bucket: getResource("DocumentsBucket").name,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    return Response.json({ url });
  } catch (error) {
    log.error("Presigned URL error", { error: String(error) });
    return Response.json(
      { error: "Failed to generate document URL" },
      { status: 500 },
    );
  }
}
