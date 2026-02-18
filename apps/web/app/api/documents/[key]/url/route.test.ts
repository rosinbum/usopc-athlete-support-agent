import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../auth.js", () => ({
  auth: vi.fn(),
}));

vi.mock("sst", () => ({
  Resource: {
    DocumentsBucket: {
      name: "test-documents-bucket",
    },
  },
}));

const mockGetSignedUrl = vi.fn();
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({})),
  GetObjectCommand: vi.fn((input: unknown) => ({ input })),
}));

import { GET } from "./route.js";
import { auth } from "../../../../../auth.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = vi.mocked(auth) as any;

function makeRequest(key: string): Request {
  return new Request(
    `http://localhost/api/documents/${encodeURIComponent(key)}/url`,
  );
}

describe("GET /api/documents/[key]/url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { email: "test@example.com" },
      expires: "",
    });
    mockGetSignedUrl.mockResolvedValue(
      "https://s3.amazonaws.com/presigned-url",
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const params = Promise.resolve({
      key: encodeURIComponent("sources/src-1/abc123.pdf"),
    });
    const response = await GET(makeRequest("sources/src-1/abc123.pdf"), {
      params,
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("returns a presigned URL for a valid S3 key", async () => {
    const params = Promise.resolve({
      key: encodeURIComponent("sources/src-1/abc123.pdf"),
    });
    const response = await GET(makeRequest("sources/src-1/abc123.pdf"), {
      params,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://s3.amazonaws.com/presigned-url");
    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
  });

  it("uses a 5-minute expiry for presigned URLs", async () => {
    const params = Promise.resolve({
      key: encodeURIComponent("sources/src-1/abc123.pdf"),
    });
    await GET(makeRequest("sources/src-1/abc123.pdf"), { params });

    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 },
    );
  });

  it("rejects keys that do not start with sources/", async () => {
    const params = Promise.resolve({
      key: encodeURIComponent("other/path/file.pdf"),
    });
    const response = await GET(makeRequest("other/path/file.pdf"), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid document key");
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects keys with path traversal", async () => {
    const params = Promise.resolve({
      key: encodeURIComponent("sources/../secrets/file.pdf"),
    });
    const response = await GET(makeRequest("sources/../secrets/file.pdf"), {
      params,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid document key");
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 500 when presigning fails", async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error("S3 error"));
    const params = Promise.resolve({
      key: encodeURIComponent("sources/src-1/abc123.pdf"),
    });
    const response = await GET(makeRequest("sources/src-1/abc123.pdf"), {
      params,
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to generate document URL");
  });
});
