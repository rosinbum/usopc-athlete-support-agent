import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getResource, logger } from "@usopc/shared";
import { auth } from "../../../../../auth.js";
import { apiError } from "../../../../../lib/apiResponse.js";

const log = logger.child({ service: "documents-url" });

/**
 * GET /api/documents/:key/url
 *
 * Returns a presigned S3 URL for viewing an archived document.
 * The key is URL-encoded in the path parameter.
 * Requires any authenticated session (athletes and admins).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError("Unauthorized", 401);
  }

  try {
    const { key } = await params;
    const s3Key = decodeURIComponent(key);

    // Validate key format: must start with "sources/" and contain no traversal
    if (!s3Key.startsWith("sources/") || s3Key.includes("..")) {
      return NextResponse.json(
        { error: "Invalid document key" },
        { status: 400 },
      );
    }

    const s3 = new S3Client({});
    const command = new GetObjectCommand({
      Bucket: getResource("DocumentsBucket").name,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    return NextResponse.json({ url });
  } catch (error) {
    log.error("Presigned URL error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate document URL" },
      { status: 500 },
    );
  }
}
